import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/token";
import { PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { decrypt } from "@/lib/encryption";
import { checkPermission } from "@/lib/rbac";
import { getS3Client } from "@/lib/s3";
import { logAudit } from "@/lib/audit";
import { extractIpFromRequest, validateUserIpAccess } from "@/lib/ip-whitelist";

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

    const searchParams = request.nextUrl.searchParams;
    const bucketId = searchParams.get("bucketId");
    const action = searchParams.get("action"); // 'upload' or 'download'
    const parentId = searchParams.get("parentId");
    const contentType =
      searchParams.get("contentType") ?? "application/octet-stream";
    const name = searchParams.get("name");
    const paramKey = searchParams.get("key");

    // Verify Bucket Access
    if (!bucketId)
      return NextResponse.json(
        { error: "Bucket ID required" },
        { status: 400 },
      );

    const bucket = await prisma.bucket.findUnique({
      where: { id: bucketId },
      include: { account: true },
    });

    if (!bucket)
      return NextResponse.json({ error: "Bucket not found" }, { status: 404 });

    // Determine required permission based on action
    let requiredPermission: "READ" | "WRITE" | "DOWNLOAD" = "WRITE";
    if (action === "download") {
      requiredPermission = "DOWNLOAD";
    } else if (action === "read") {
      requiredPermission = "READ";
    }

    // Check Permission
    const hasAccess = await checkPermission(user, requiredPermission, {
      tenantId: bucket.account.tenantId,
      resourceType: "bucket",
      resourceId: bucket.id,
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const account = bucket.account;

    // Determine Key
    let key: string = paramKey || (name as string);
    if (!paramKey && parentId && parentId !== "null") {
      const parent = await prisma.fileObject.findUnique({
        where: { id: parentId },
      });
      if (parent) {
        // Ensure parent key doesn't have double slashes if it ends with /
        const prefix = parent.key.endsWith("/") ? parent.key : `${parent.key}/`;
        key = `${prefix}${name}`;
      }
    }

    // Support fallback to environment AWS_PROFILE credentials
    const s3 = getS3Client(account, bucket.region);

    let command;
    if (action === "download" || action === "read") {
      const { GetObjectCommand } = await import("@aws-sdk/client-s3");
      command = new GetObjectCommand({
        Bucket: bucket.name,
        Key: key,
        ResponseContentDisposition:
          action === "read"
            ? "inline"
            : `attachment; filename="${name || key.split("/").pop()}"`,
      });
    } else {
      // Default to Upload (PutObject)
      command = new PutObjectCommand({
        Bucket: bucket.name,
        Key: key,
        ContentType: contentType,
      });
    }

    const url = await getSignedUrl(s3, command, { expiresIn: 3600 });

    logAudit({
      userId: user.id,
      action:
        action === "download"
          ? "FILE_DOWNLOAD"
          : action === "read"
            ? "FILE_READ"
            : "FILE_UPLOAD_INITIATED",
      resource: "FileObject",
      status: "SUCCESS",
      ipAddress: extractIpFromRequest(request),
      details: { bucketId: bucket.id, key, action },
    });

    return NextResponse.json({ url, key });
  } catch (error) {
    console.error("Presigned URL error:", error);
    return NextResponse.json(
      { error: "Failed to generate presigned URL" },
      { status: 500 },
    );
  }
}
