import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { Prisma } from "@/lib/generated/prisma/client";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { verifyToken } from "@/lib/token";
import { getS3Client } from "@/lib/s3";
import { logAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/rbac";
import { extractIpFromRequest, validateUserIpAccess } from "@/lib/ip-whitelist";
import { verifyBotToken, assertBotBucketAccess } from "@/lib/bot-auth";
import { withTenantAccess } from "@/lib/middleware/tenant-access";
import { ensureParentDirectories } from "@/lib/file-hierarchy";

export async function GET(request: NextRequest) {
  return withTenantAccess(
    request,
    async (req, middlewareUser) => {
      try {
        // Bot JWT auth (HS256) — overrides middleware user
        const bearerToken = req.headers.get("Authorization")?.split(" ")[1];
        const botAuth = bearerToken ? await verifyBotToken(bearerToken) : null;

        let user: any = middlewareUser;
        if (botAuth) {
          user = await prisma.user.findFirst({
            where: { email: botAuth.email },
            include: {
              tenant: true,
              policies: true,
              teams: { include: { team: { include: { policies: true } } } },
            },
          });
        } else if (!user.policies) {
          user = await prisma.user.findUnique({
            where: { id: user.id },
            include: {
              tenant: true,
              policies: true,
              teams: { include: { team: { include: { policies: true } } } },
            },
          });
        }

        if (!user)
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

        const clientIp = extractIpFromRequest(req);
        if (!validateUserIpAccess(clientIp, user)) {
          logAudit({
            userId: user.id,
            action: "IP_ACCESS_DENIED",
            resource: "FileObject",
            status: "FAILED",
            ipAddress: clientIp,
            details: {
              reason: "IP not whitelisted for team",
              method: req.method,
              path: req.nextUrl.pathname,
            },
          });
          return NextResponse.json(
            { error: "Forbidden: IP not whitelisted for your team" },
            { status: 403 },
          );
        }

        const searchParams = req.nextUrl.searchParams;
        const bucketId = searchParams.get("bucketId");
        const parentId = searchParams.get("parentId");
        const syncAll = searchParams.get("syncAll") === "true";
        const q = searchParams.get("q")?.trim();

        if (botAuth) {
          if (bucketId) {
            if (!assertBotBucketAccess(botAuth, bucketId, "READ")) {
              return NextResponse.json(
                { error: "Forbidden: bot lacks READ access to this bucket" },
                { status: 403 },
              );
            }
          } else if (botAuth.allowedBucketIds.length === 0) {
            return NextResponse.json([]);
          }
        }

        const where: any = {};
        if (bucketId) {
          where.bucketId = bucketId;
        } else if (botAuth) {
          where.bucketId = { in: botAuth.allowedBucketIds };
        }

        if (parentId) {
          where.parentId = parentId;
        } else if (bucketId && !syncAll) {
          where.parentId = null;
        }

        if (q) {
          const ftsResults = await prisma.$queryRaw<{ id: string }[]>(
            Prisma.sql`
              SELECT id FROM "FileObject"
              WHERE "searchVector" @@ websearch_to_tsquery('english', ${q})
              ${bucketId ? Prisma.sql`AND "bucketId" = ${bucketId}` : Prisma.empty}
            `,
          );
          const matchingIds = ftsResults.map((r) => r.id);
          if (matchingIds.length === 0) return NextResponse.json([]);
          where.id = { in: matchingIds };
          delete where.parentId;
        }

        const files = await prisma.fileObject.findMany({
          where,
          orderBy: { isFolder: "desc" },
          include: { children: true },
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
    },
    { allowSelfTenant: true },
  );
}

export async function POST(request: NextRequest) {
  return withTenantAccess(
    request,
    async (req, middlewareUser) => {
      try {
        const token = req.headers.get("Authorization")?.split(" ")[1];
        const botAuth = token ? await verifyBotToken(token) : null;

        let user: any = middlewareUser;
        if (botAuth) {
          user = await prisma.user.findFirst({
            where: { email: botAuth.email },
            include: {
              policies: true,
              teams: {
                where: { isDeleted: false },
                include: { team: { include: { policies: true } } },
              },
            },
          });
        } else if (!user.policies) {
          user = await prisma.user.findUnique({
            where: { id: user.id },
            include: {
              policies: true,
              teams: {
                where: { isDeleted: false },
                include: { team: { include: { policies: true } } },
              },
            },
          });
        }

        if (!user)
          return NextResponse.json(
            { error: "User not found" },
            { status: 404 },
          );

        const clientIp = extractIpFromRequest(req);
        if (!validateUserIpAccess(clientIp, user)) {
          logAudit({
            userId: user.id,
            action: "IP_ACCESS_DENIED",
            resource: "FileObject",
            status: "FAILED",
            ipAddress: clientIp,
            details: {
              reason: "IP not whitelisted for team",
              method: req.method,
              path: req.nextUrl.pathname,
            },
          });
          return NextResponse.json(
            { error: "Forbidden: IP not whitelisted for your team" },
            { status: 403 },
          );
        }

        const body = (await req.json()) as any;
        const { name, isFolder, parentId, bucketId, size, mimeType } = body;

        if (!name || !bucketId) {
          return NextResponse.json(
            { error: "Name and bucketId are required" },
            { status: 400 },
          );
        }

        if (botAuth) {
          const requiredPerm = isFolder ? "WRITE" : "UPLOAD";
          if (
            !botAuth.allowedBucketIds.includes(bucketId) ||
            (!botAuth.hasBucketPermission(bucketId, requiredPerm) &&
              !botAuth.hasBucketPermission(bucketId, "WRITE"))
          ) {
            return NextResponse.json(
              {
                error:
                  "Forbidden: bot lacks WRITE/UPLOAD access to this bucket",
              },
              { status: 403 },
            );
          }
        }

        const bucket = await prisma.bucket.findUnique({
          where: { id: bucketId },
          include: { awsAccount: true, tenant: true },
        });
        if (!bucket)
          return NextResponse.json(
            { error: "Bucket not found" },
            { status: 404 },
          );

        if (!botAuth) {
          const hasAccess = await checkPermission(user, "WRITE", {
            tenantId: bucket.tenantId,
            resourceType: "bucket",
            resourceId: bucket.id,
          });
          if (!hasAccess)
            return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const { parentId: resolvedParentId, baseName: resolvedName } =
          await ensureParentDirectories(
            bucket.id,
            bucket.tenantId,
            name,
            user.id,
            parentId,
          );

        let key = resolvedName;
        if (resolvedParentId) {
          const parent = await prisma.fileObject.findUnique({
            where: { id: resolvedParentId },
          });
          if (parent) {
            const prefix = parent.key.endsWith("/")
              ? parent.key
              : `${parent.key}/`;
            key = `${prefix}${resolvedName}`;
          }
        } else {
          // Root level bucket key calculation
          key = resolvedName;
        }

        if (isFolder) {
          if (!key.endsWith("/")) {
            key = `${key}/`;
          }
          try {
            const s3 = await getS3Client(
              null,
              bucket.region,
              bucket.awsAccount,
            );
            await s3.send(
              new PutObjectCommand({
                Bucket: bucket.name,
                Key: key,
                Body: "",
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

        console.log(">> @@@ file Upload::: multipart", process.env.NODE_ENV);

        if (process.env.NODE_ENV === "development") {
          const fileId = `${bucketId}-${key}-${Date.now()}`;
          await prisma.fileObject.upsert({
            where: { id: fileId },
            create: {
              id: fileId,
              name: resolvedName,
              key,
              isFolder: !!isFolder,
              size: size ? BigInt(size) : null,
              mimeType: mimeType || null,
              bucket: { connect: { id: bucket.id } },
              tenant: { connect: { id: bucket.tenantId } },
              parent: resolvedParentId
                ? { connect: { id: resolvedParentId } }
                : undefined,
            },
            update: {
              name: resolvedName,
              size: size ? BigInt(size) : null,
              mimeType: mimeType || null,
              updatedAt: new Date(),
            },
          });
        }

        logAudit({
          userId: user.id,
          action: isFolder ? "FOLDER_CREATE" : "FILE_UPLOAD",
          resource: "FileObject",
          status: "SUCCESS",
          ipAddress: extractIpFromRequest(req),
          details: {
            bucketId: bucket.id,
            bucketName: bucket.name,
            key,
            isFolder,
          },
        });

        return NextResponse.json(
          { key, bucketId, status: "accepted" },
          { status: 202 },
        );
      } catch (error) {
        console.error("Failed to create file:", error);
        return NextResponse.json(
          { error: "Failed to create file" },
          { status: 500 },
        );
      }
    },
    { allowSelfTenant: true },
  );
}
