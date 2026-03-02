import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/token";
import { CreateMultipartUploadCommand } from "@aws-sdk/client-s3";
import { checkPermission } from "@/lib/rbac";
import { getS3Client } from "@/lib/s3";
import { logAudit } from "@/lib/audit";
import { extractIpFromRequest } from "@/lib/ip-whitelist";

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

    const body = await request.json();
    const { bucketId, name, type, parentId } = body;

    if (!bucketId || !name) {
      return NextResponse.json(
        { error: "Bucket ID and Name are required" },
        { status: 400 },
      );
    }

    const bucket = await prisma.bucket.findUnique({
      where: { id: bucketId },
      include: { account: true },
    });

    if (!bucket)
      return NextResponse.json({ error: "Bucket not found" }, { status: 404 });

    const hasAccess = await checkPermission(user, "WRITE", {
      tenantId: bucket.account.tenantId,
      resourceType: "bucket",
      resourceId: bucket.id,
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const account = bucket.account;

    let key = name;
    if (parentId) {
      const parent = await prisma.fileObject.findUnique({
        where: { id: parentId },
      });
      if (parent) {
        const prefix = parent.key.endsWith("/") ? parent.key : `${parent.key}/`;
        key = `${prefix}${name}`;
      }
    }

    const s3 = getS3Client(account, bucket.region);

    const command = new CreateMultipartUploadCommand({
      Bucket: bucket.name,
      Key: key,
      ContentType: type || "application/octet-stream",
    });

    const { UploadId } = await s3.send(command);

    logAudit({
      userId: user.id,
      action: "MULTIPART_UPLOAD_INITIATED",
      resource: "FileObject",
      status: "SUCCESS",
      ipAddress: extractIpFromRequest(request),
      details: { bucketId: bucket.id, bucketName: bucket.name, key },
    });

    return NextResponse.json({ uploadId: UploadId, key });
  } catch (error) {
    console.error("Initiate Multipart error:", error);
    return NextResponse.json(
      { error: "Failed to initiate upload" },
      { status: 500 },
    );
  }
}
