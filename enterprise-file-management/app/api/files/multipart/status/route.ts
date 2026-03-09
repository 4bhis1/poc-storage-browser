import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/token";
import { ListPartsCommand } from "@aws-sdk/client-s3";
import { checkPermission } from "@/lib/rbac";
import { getS3Client } from "@/lib/s3";

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
    const { fileHash } = body;

    if (!fileHash) {
      return NextResponse.json(
        { error: "fileHash is required" },
        { status: 400 },
      );
    }

    // Check if there is an active upload
    const activeUpload = await prisma.multipartUpload.findUnique({
      where: {
        fileHash_userId: { fileHash, userId: user.id },
      },
    });

    if (!activeUpload) {
      return NextResponse.json({ active: false });
    }

    // Verify bucket access
    const bucket = await prisma.bucket.findUnique({
      where: { id: activeUpload.bucketId },
      include: { awsAccount: true, tenant: true },
    });

    if (!bucket) {
      // Bucket deleted, clean up upload record
      await prisma.multipartUpload.delete({ where: { id: activeUpload.id } });
      return NextResponse.json({ active: false });
    }

    const hasAccess = await checkPermission(user, "WRITE", {
      tenantId: bucket.tenantId,
      resourceType: "bucket",
      resourceId: bucket.id,
    });

    if (!hasAccess) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    try {
      const s3 = await getS3Client(
        null,
        bucket.region,
        bucket.awsAccount,
      );

      // We need to fetch all parts. Pagination might be needed if parts > 1000
      let parts: any[] = [];
      let isTruncated = true;
      let partNumberMarker: string | undefined = undefined;

      while (isTruncated) {
        const command: any = new ListPartsCommand({
          Bucket: bucket.name,
          Key: activeUpload.key,
          UploadId: activeUpload.uploadId,
          PartNumberMarker: partNumberMarker,
        });

        const response: any = await s3.send(command);
        if (response.Parts && response.Parts.length > 0) {
          parts = [...parts, ...response.Parts];
        }

        isTruncated = response.IsTruncated || false;
        partNumberMarker = response.NextPartNumberMarker?.toString();
      }

      const completedParts = parts.map((part) => ({
        PartNumber: part.PartNumber,
        ETag: part.ETag?.replace(/^"|"$/g, ""), // S3 usually returns ETag with quotes
        Size: part.Size,
      }));

      return NextResponse.json({
        active: true,
        uploadId: activeUpload.uploadId,
        key: activeUpload.key,
        bucketId: activeUpload.bucketId,
        parts: completedParts,
      });
    } catch (s3Error: any) {
      if (s3Error.name === "NoSuchUpload") {
        // The upload was aborted manually or via bucket lifecycle rules
        // Cleanup our DB record
        await prisma.multipartUpload.delete({ where: { id: activeUpload.id } });
        return NextResponse.json({ active: false });
      }
      throw s3Error;
    }
  } catch (error) {
    console.error("Status Multipart error:", error);
    return NextResponse.json(
      { error: "Failed to fetch upload status" },
      { status: 500 },
    );
  }
}
