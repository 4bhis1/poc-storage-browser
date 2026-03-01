import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma, Role } from "@/lib/generated/prisma/client";
import { verifyToken } from "@/lib/token";
import { checkPermission } from "@/lib/rbac";
import { extractIpFromRequest, validateUserIpAccess } from "@/lib/ip-whitelist";
import { logAudit } from "@/lib/audit";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await verifyToken(token);
    if (!payload || typeof payload !== "object" || !payload.email)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const user = await prisma.user.findUnique({
      where: { email: payload.email as string },
      include: {
        policies: true,
        teams: {
          where: { isDeleted: false },
          include: {
            team: {
              include: { policies: true },
            },
          },
        },
      },
    });

    if (!user)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    const clientIp = extractIpFromRequest(request);
    if (!validateUserIpAccess(clientIp, user)) {
      logAudit({
        userId: user.id,
        action: "IP_ACCESS_DENIED",
        resource: "FileObject",
        status: "FAILED",
        ipAddress: clientIp,
        details: {
          reason: "IP not whitelisted for team",
          method: request.method,
          path: request.nextUrl.pathname,
        },
      });
      return NextResponse.json(
        { error: "Forbidden: IP not whitelisted for your team" },
        { status: 403 },
      );
    }

    const searchParams = request.nextUrl.searchParams;
    const bucketId = searchParams.get("bucketId");
    const parentId = searchParams.get("parentId");
    const search = searchParams.get("search");

    let allowedBucketIds: string[] = [];

    if (bucketId) {
      // Verify Specific Bucket Access
      const bucket = await prisma.bucket.findUnique({
        where: { id: bucketId },
        include: { account: true },
      });

      if (!bucket)
        return NextResponse.json(
          { error: "Bucket not found" },
          { status: 404 },
        );

      // Check Permission
      const hasAccess = await checkPermission(user, "READ", {
        tenantId: bucket.account.tenantId,
        resourceType: "bucket",
        resourceId: bucket.id,
      });

      if (!hasAccess) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
      allowedBucketIds.push(bucket.id);
    } else {
      // Fetch all buckets in tenant
      const userTenantBuckets = await prisma.bucket.findMany({
        where: { account: { tenantId: user.tenantId! } },
        include: { account: true },
      });
      // Filter by READ permission
      for (const b of userTenantBuckets) {
        const hasAccess = await checkPermission(user, "READ", {
          tenantId: b.account.tenantId,
          resourceType: "bucket",
          resourceId: b.id,
        });
        if (hasAccess) {
          allowedBucketIds.push(b.id);
        }
      }
    }

    if (allowedBucketIds.length === 0) {
      return NextResponse.json({ files: [] }); // No access to any buckets
    }

    // List Objects
    const whereClause: any = {
      bucketId: { in: allowedBucketIds },
    };

    if (search && search.trim() !== "") {
      // ------------------------------------------------------------------
      // FTS: use PostgreSQL tsvector to find matching file IDs
      // Also scope to the current folder's key prefix when parentId is set
      // ------------------------------------------------------------------
      let keyPrefix: string | undefined;
      if (parentId) {
        const parent = await prisma.fileObject.findUnique({
          where: { id: parentId },
        });
        if (parent) {
          keyPrefix = parent.key.endsWith("/") ? parent.key : `${parent.key}/`;
        }
      }

      const ftsResults = await prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`
          SELECT id FROM "FileObject"
          WHERE "bucketId" = ${bucketId}
            AND (
              "searchVector" @@ websearch_to_tsquery('english', ${search.trim()})
              OR name ILIKE ${"%" + search.trim() + "%"}
            )
            ${keyPrefix ? Prisma.sql`AND key LIKE ${keyPrefix + "%"}` : Prisma.empty}
        `,
      );
      const matchingIds = ftsResults.map((r) => r.id);

      if (matchingIds.length === 0) {
        return NextResponse.json({ files: [] });
      }

      whereClause.id = { in: matchingIds };
    } else {
      // Normal navigation: direct children only
      whereClause.parentId = parentId || null;
    }

    const files = await prisma.fileObject.findMany({
      where: whereClause,
      orderBy: {
        isFolder: "desc",
      },
      include: {
        children: true,
      },
    });

    // Fetch all ancestor folders if search is active
    let folderBreadcrumbsData = new Map<string, { id: string; name: string }>();
    if (search && search.trim() !== "" && files.length > 0) {
      const ancestorKeys = new Set<string>();
      files.forEach((f) => {
        const parts = f.key.split("/");
        let currentKey = "";
        const bound = f.isFolder ? parts.length : parts.length - 1;
        for (let i = 0; i < bound; i++) {
          currentKey = currentKey ? `${currentKey}/${parts[i]}` : parts[i];
          ancestorKeys.add(currentKey);
        }
      });

      if (ancestorKeys.size > 0) {
        const ancestors = await prisma.fileObject.findMany({
          where: {
            bucketId: bucketId ? bucketId : { in: allowedBucketIds },
            key: { in: Array.from(ancestorKeys) },
            isFolder: true,
          },
          select: { id: true, name: true, key: true },
        });
        ancestors.forEach((a) =>
          folderBreadcrumbsData.set(a.key, { id: a.id, name: a.name }),
        );
      }
    }

    const fileItems = files.map((f) => {
      let breadcrumbs: { id: string; name: string }[] | undefined = undefined;
      if (search && search.trim() !== "") {
        breadcrumbs = [];
        const parts = f.key.split("/");
        let currentKey = "";
        const bound = f.isFolder ? parts.length : parts.length - 1;
        for (let i = 0; i < bound; i++) {
          currentKey = currentKey ? `${currentKey}/${parts[i]}` : parts[i];
          const ancestor = folderBreadcrumbsData.get(currentKey);
          if (ancestor) {
            breadcrumbs.push(ancestor);
          }
        }
      }

      return {
        id: f.id,
        name: f.name,
        type: f.isFolder
          ? "folder"
          : f.mimeType?.includes("image")
            ? "image"
            : f.mimeType?.includes("pdf")
              ? "pdf"
              : "document",
        size: Number(f.size) || 0,
        modifiedAt: f.updatedAt.toISOString(),
        owner: "Admin", // Placeholder as per logic
        bucket: "prod-assets", // Placeholder
        bucketId: f.bucketId,
        path: f.key,
        key: f.key,
        breadcrumbs,
        children: f.children.map((c) => ({ id: c.id })),
      };
    });

    return NextResponse.json({ files: fileItems });
  } catch (error) {
    console.error("File explorer error:", error);
    return NextResponse.json(
      { error: "Failed to fetch files" },
      { status: 500 },
    );
  }
}
