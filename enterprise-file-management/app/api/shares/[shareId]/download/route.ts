import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { jwtVerify } from "jose";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { extractIpFromRequest } from "@/lib/ip-whitelist";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { decrypt } from "@/lib/encryption";
import { fromIni } from "@aws-sdk/credential-providers";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "fallback_secret_for_development",
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ shareId: string }> | { shareId: string } },
) {
  try {
    const { shareId } = await params;

    // 1. Verify Access Session
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(`share_session_${shareId}`);

    if (!sessionCookie) {
      return NextResponse.json(
        { error: "Unauthorized access to share" },
        { status: 401 },
      );
    }

    try {
      const { payload } = await jwtVerify(sessionCookie.value, JWT_SECRET);
      if (payload.shareId !== shareId || !payload.access) {
        throw new Error("Invalid session payload");
      }
    } catch (e) {
      return NextResponse.json(
        { error: "Session expired or invalid" },
        { status: 401 },
      );
    }

    const clientIp = extractIpFromRequest(request);

    // 2. Fetch Share & File
    const share = await prisma.share.findUnique({
      where: { id: shareId },
      include: {
        file: true,
        bucket: { include: { account: true } },
      },
    });

    if (!share) {
      return NextResponse.json({ error: "Share not found" }, { status: 404 });
    }

    // 3. Validate Share conditions
    if (share.status === "REVOKED") {
      return NextResponse.json(
        { error: "Share link has been revoked" },
        { status: 403 },
      );
    }

    if (new Date() > new Date(share.expiry)) {
      await prisma.share.update({
        where: { id: share.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json(
        { error: "Share link has expired" },
        { status: 403 },
      );
    }

    if (share.downloads >= share.downloadLimit) {
      await prisma.share.update({
        where: { id: share.id },
        data: { status: "EXPIRED" },
      });
      return NextResponse.json(
        { error: "Download limit reached" },
        { status: 403 },
      );
    }

    // 4. Generate Presigned URL
    const { getS3Client } = await import("@/lib/s3");
    const s3 = getS3Client(share.bucket.account, share.bucket.region);
    const command = new GetObjectCommand({
      Bucket: share.bucket.name,
      Key: share.file.key,
      ResponseContentDisposition: `attachment; filename="${share.file.name}"`,
    });

    const signedUrl = await getSignedUrl(s3, command, { expiresIn: 3600 });

    // 5. Update Download Counter (Only when URL generation succeeds)
    const updatedShare = await prisma.share.update({
      where: { id: share.id },
      data: { downloads: { increment: 1 } },
    });

    if (updatedShare.downloads >= updatedShare.downloadLimit) {
      // Mark as expired if the limit is reached just now
      await prisma.share.update({
        where: { id: share.id },
        data: { status: "EXPIRED" },
      });
    }

    // 6. Audit Logging (Share Download)
    // Note: We might be logging "Anonymous" or "Shared User" since they are not logged in FMS users.
    // For userId we can use share.createdBy as the owner, but it's an anonymous download. Let's use share.createdBy for now but log the IP and email.
    if (share.createdBy) {
      logAudit({
        userId: share.createdBy,
        action: "FILE_DOWNLOAD",
        resource: "FileObject",
        resourceId: share.file.id,
        status: "SUCCESS",
        ipAddress: clientIp,
        details: {
          shareId: share.id,
          fileName: share.file.name,
          downloadedByEmail: share.toEmail,
          isSharedAccess: true,
        },
      });
    }

    // 7. Redirect to the presigned url
    return NextResponse.redirect(signedUrl);
  } catch (error) {
    console.error("Failed to process share download:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
