import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { Role } from "@/lib/generated/prisma/client";
import { extractIpFromRequest, validateUserIpAccess } from "@/lib/ip-whitelist";
import { logAudit } from "@/lib/audit";
import { checkPermission } from "@/lib/rbac";
import { getS3Client } from "@/lib/s3";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const bucket = await prisma.bucket.findUnique({
    where: { id },
    select: { id: true, name: true, region: true, tenantId: true, awsAccountId: true },
  });

  if (!bucket) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (bucket.tenantId !== user.tenantId && user.role !== Role.PLATFORM_ADMIN)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  return NextResponse.json(bucket);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientIp = extractIpFromRequest(request);
    if (!validateUserIpAccess(clientIp, user)) {
      logAudit({
        userId: user.id,
        action: "IP_ACCESS_DENIED",
        resource: "Bucket",
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

    const { id: bucketId } = await params;

    const bucket = await prisma.bucket.findUnique({
      where: { id: bucketId },
      include: {
        awsAccount: true,
        _count: { select: { objects: true } },
      },
    });

    if (!bucket) {
      return NextResponse.json({ error: "Bucket not found" }, { status: 404 });
    }

    // Role check and Permission Check
    let hasAccess = false;
    if (user.role === Role.PLATFORM_ADMIN) {
      hasAccess = true;
    } else if (
      user.role === Role.TENANT_ADMIN &&
      user.tenantId === bucket.tenantId
    ) {
      hasAccess = true;
    } else {
      hasAccess = await checkPermission(user, "DELETE", {
        tenantId: bucket.tenantId,
        resourceType: "bucket",
        resourceId: bucket.id,
      });
    }

    if (!hasAccess) {
      return NextResponse.json(
        {
          error: "Forbidden: You do not have permission to delete this bucket",
        },
        { status: 403 },
      );
    }

    // Safeguard: Bucket must be empty
    if (bucket._count.objects > 0) {
      return NextResponse.json(
        {
          error:
            "Bucket is not empty. Please delete all files and folders inside it before deleting the bucket.",
        },
        { status: 400 },
      );
    }

    // Delete from AWS S3
    const awsAccount = bucket.awsAccount;
    const s3 = await getS3Client(null, bucket.region, awsAccount);

    try {
      const { DeleteBucketCommand } = await import("@aws-sdk/client-s3");
      await s3.send(new DeleteBucketCommand({ Bucket: bucket.name }));
    } catch (s3Error: any) {
      console.error("Failed to delete S3 bucket:", s3Error);

      // If the bucket doesn't actually exist in AWS, we can probably safely delete it from DB as its a ghost record
      if (s3Error.name !== "NoSuchBucket") {
        return NextResponse.json(
          { error: `AWS S3 error: ${s3Error?.message || "Unknown error"}` },
          { status: 502 },
        );
      }
    }

    // Teardown EventBridge rule in tenant account (non-fatal)
    if (awsAccount && bucket.eventBridgeRuleArn) {
      try {
        const { teardownBucketEventBridge } = await import("@/lib/aws/setup-bucket-events");
        await teardownBucketEventBridge(
          {
            roleArn: awsAccount.roleArn,
            externalId: awsAccount.externalId,
            awsAccountId: awsAccount.awsAccountId,
            region: bucket.region,
          },
          bucket.name,
          bucket.eventBridgeRuleArn,
        );
      } catch (ebErr) {
        console.warn("EventBridge teardown failed (non-fatal):", ebErr);
      }
    }

    // Delete from DB
    await prisma.bucket.delete({
      where: { id: bucketId },
    });

    logAudit({
      userId: user.id,
      action: "BUCKET_DELETE" as any,
      resource: "Bucket",
      resourceId: bucket.id,
      status: "SUCCESS",
      ipAddress: clientIp,
      details: { bucketName: bucket.name, region: bucket.region },
    });

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("Failed to delete bucket:", error);
    return NextResponse.json(
      { error: "Failed to process bucket deletion request" },
      { status: 500 },
    );
  }
}
