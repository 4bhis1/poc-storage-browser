import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/token";
import { CompleteMultipartUploadCommand } from "@aws-sdk/client-s3";
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
    const {
      bucketId,
      key,
      uploadId,
      parts,
      name,
      size,
      mimeType,
      parentId,
      fileHash,
    } = body;

    if (!bucketId || !key || !uploadId || !parts || !name || !fileHash) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const bucket = await prisma.bucket.findUnique({
      where: { id: bucketId },
      include: { awsAccount: true, tenant: true },
    });

    if (!bucket)
      return NextResponse.json({ error: "Bucket not found" }, { status: 404 });

    const hasAccess = await checkPermission(user, "WRITE", {
      tenantId: bucket.tenantId,
      resourceType: "bucket",
      resourceId: bucket.id,
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const account = null;
    const awsAccount = bucket.awsAccount;

    const s3 = await getS3Client(account, bucket.region, awsAccount);

    const command = new CompleteMultipartUploadCommand({
      Bucket: bucket.name,
      Key: key,
      UploadId: uploadId,
      MultipartUpload: {
        Parts: parts,
      },
    });

    await s3.send(command);

    // Clean up our tracking table now that S3 has completed the upload
    if (fileHash) {
      await prisma.multipartUpload.deleteMany({
        where: {
          fileHash: fileHash,
          userId: user.id,
        },
      });
    }

    console.log(">> @@@ file Upload::: multipart", process.env.NODE_ENV)

    // DB record creation:
    // - DEV: write directly to DB (no SQS/Lambda running locally)
    // - PROD: handled asynchronously by the file-sync Lambda via S3 ObjectCreated event → SQS → Lambda
    if (process.env.NODE_ENV === 'development') {
      const fileId = `${bucketId}-${key}-${Date.now()}`;
      await prisma.fileObject.upsert({
        where: { id: fileId },
        create: {
          id: fileId,
          name,
          key,
          isFolder: false,
          size: size ? BigInt(size) : null,
          mimeType: mimeType || null,
          bucket: { connect: { id: bucket.id } },
          tenant: { connect: { id: bucket.tenantId } },
          parent: parentId ? { connect: { id: parentId } } : undefined,
        },
        update: {
          name,
          size: size ? BigInt(size) : null,
          mimeType: mimeType || null,
          updatedAt: new Date(),
        },
      });
    }

    logAudit({
      userId: user.id,
      action: "FILE_UPLOAD",
      resource: "FileObject",
      status: "SUCCESS",
      ipAddress: extractIpFromRequest(request),
      details: { bucketId: bucket.id, bucketName: bucket.name, key, size },
    });

    return NextResponse.json({ status: "accepted", key }, { status: 202 });
  } catch (error) {
    console.error("Complete Multipart error:", error);
    return NextResponse.json(
      { error: "Failed to complete upload" },
      { status: 500 },
    );
  }
}
