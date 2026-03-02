import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { decrypt } from "@/lib/encryption";
import { verifyToken } from "@/lib/token";
import { getS3Client } from "@/lib/s3";
import { logAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/rbac";
import { extractIpFromRequest, validateUserIpAccess } from "@/lib/ip-whitelist";
import { getCurrentUser } from "@/lib/session";

export async function GET(request: NextRequest) {
  try {
    let user = await getCurrentUser();
    if (!user) {
      const token = request.headers.get("Authorization")?.split(" ")[1];
      if (token) {
        const payload = await verifyToken(token);
        if (payload && typeof payload === "object" && payload.email) {
          user = await prisma.user.findUnique({
            where: { email: payload.email as string },
            include: {
              tenant: true,
              policies: true,
              teams: { include: { team: { include: { policies: true } } } },
            },
          });
        }
      }
    }

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

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
    const syncAll = searchParams.get("syncAll") === "true";
    const q = searchParams.get("q")?.trim();

    const where: any = {};
    if (bucketId) where.bucketId = bucketId;
    if (parentId) {
      where.parentId = parentId;
    } else if (bucketId && !syncAll) {
      where.parentId = null;
    }

    // If a search query is provided, use PostgreSQL tsvector FTS to find matching IDs
    if (q) {
      const ftsResults = await prisma.$queryRaw<{ id: string }[]>(
        Prisma.sql`
          SELECT id FROM "FileObject"
          WHERE "searchVector" @@ websearch_to_tsquery('english', ${q})
          ${bucketId ? Prisma.sql`AND "bucketId" = ${bucketId}` : Prisma.empty}
        `,
      );
      const matchingIds = ftsResults.map((r) => r.id);

      // If there are no matches, return an empty array early
      if (matchingIds.length === 0) {
        return NextResponse.json([]);
      }

      // Narrow the existing where clause to only the FTS-matched IDs
      where.id = { in: matchingIds };
      // When searching, show results from all levels (don't restrict by parentId)
      delete where.parentId;
    }

    const files = await prisma.fileObject.findMany({
      where,
      orderBy: { isFolder: "desc" },
      include: {
        children: true,
      },
    });

    const fileItems = files.map((f) => ({
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
      owner: "Admin",
      shared: false,
      starred: false,
      children: f.children.map((c) => ({ id: c.id })),
      // Fields needed for SyncEngine in Electron
      key: f.key,
      isFolder: f.isFolder,
      mimeType: f.mimeType,
      bucketId: f.bucketId,
      parentId: f.parentId,
      createdAt: f.createdAt,
      updatedAt: f.updatedAt,
    }));

    return NextResponse.json(fileItems);
  } catch (error) {
    console.error("Failed to fetch files:", error);
    return NextResponse.json(
      { error: "Failed to fetch files" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
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
          include: { team: { include: { policies: true } } },
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

    const body = (await request.json()) as any;
    const { name, isFolder, parentId, bucketId, size, mimeType } = body;

    if (!name || !bucketId) {
      return NextResponse.json(
        { error: "Name and bucketId are required" },
        { status: 400 },
      );
    }

    // 1. Fetch Bucket and Account to get credentials
    const bucket = await prisma.bucket.findUnique({
      where: { id: bucketId },
      include: { account: true },
    });

    if (!bucket || !bucket.account) {
      return NextResponse.json(
        { error: "Bucket or associated account not found" },
        { status: 404 },
      );
    }

    const hasAccess = await checkPermission(user, "WRITE", {
      tenantId: bucket.tenantId,
      resourceType: "bucket",
      resourceId: bucket.id,
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const account = bucket.account;
    if (!account.awsAccessKeyId || !account.awsSecretAccessKey) {
      // NOTE: Removed strict credential blocking here, as `getS3Client` handles fallbacks.
      // We will let S3 SDK attempt to find credentials.
    }

    // 2. Determine the full Key (path)
    let key = name;
    if (parentId) {
      const parent = await prisma.fileObject.findUnique({
        where: { id: parentId },
      });
      if (parent) {
        key = `${parent.key}/${name}`;
      }
    }

    // 3. If it's a folder, create it in S3
    if (isFolder) {
      try {
        const s3 = getS3Client(account, bucket.region);

        // S3 folders are typically represented by a zero-byte object with a trailing slash
        const s3Key = key.endsWith("/") ? key : `${key}/`;

        await s3.send(
          new PutObjectCommand({
            Bucket: bucket.name,
            Key: s3Key,
            Body: "", // Empty body for folder
          }),
        );
      } catch (s3Error: any) {
        console.error("Failed to create folder in S3:", s3Error);
        return NextResponse.json(
          { error: `S3 Sync Failed: ${s3Error.message}` },
          { status: 502 },
        );
      }
    }

    // 4. Update or Create Record in DB (Upsert behavior without unique constraint)
    const existingFile = await prisma.fileObject.findFirst({
      where: {
        bucketId: bucketId,
        key: key,
        isFolder: isFolder || false,
      },
    });

    let file;
    if (existingFile) {
      file = await prisma.fileObject.update({
        where: { id: existingFile.id },
        data: {
          size: (size as number) || 0,
          mimeType: (mimeType as string) || "application/octet-stream",
          updatedAt: new Date(),
          updatedBy: user.id,
        },
      });

      if (!isFolder) {
        logAudit({
          userId: user.id,
          action: "FILE_UPLOAD",
          resource: "FileObject",
          resourceId: file.id,
          status: "SUCCESS",
          details: { bucketId: bucket.id, bucketName: bucket.name, key, size },
        });
      }
    } else {
      file = await prisma.fileObject.create({
        data: {
          name,
          bucketId,
          tenantId: bucket.tenantId,
          parentId: parentId || null,
          isFolder: isFolder || false,
          size: (size as number) || 0,
          mimeType: (mimeType as string) || "application/octet-stream",
          key: key,
          createdBy: user.id,
          updatedBy: user.id,
        },
      });

      if (isFolder) {
        logAudit({
          userId: user.id,
          action: "FOLDER_CREATE",
          resource: "FileObject",
          resourceId: file.id,
          status: "SUCCESS",
          details: { name, bucketId, bucketName: bucket.name, key },
        });
      } else {
        logAudit({
          userId: user.id,
          action: "FILE_UPLOAD",
          resource: "FileObject",
          resourceId: file.id,
          status: "SUCCESS",
          details: { bucketId: bucket.id, bucketName: bucket.name, key, size },
        });
      }
    }

    return NextResponse.json({ ...file, size: Number(file.size) || 0 });
  } catch (error) {
    console.error("Failed to create file:", error);
    return NextResponse.json(
      { error: "Failed to create file" },
      { status: 500 },
    );
  }
}
