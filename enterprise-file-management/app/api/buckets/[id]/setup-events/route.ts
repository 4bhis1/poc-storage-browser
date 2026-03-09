import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { Role } from "@/lib/generated/prisma/client";

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== Role.PLATFORM_ADMIN && user.role !== Role.TENANT_ADMIN)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id } = await params;

  const bucket = await prisma.bucket.findUnique({
    where: { id },
    include: { awsAccount: true },
  });

  if (!bucket) return NextResponse.json({ error: "Bucket not found" }, { status: 404 });
  if (!bucket.awsAccount)
    return NextResponse.json({ error: "No AWS account linked to this bucket" }, { status: 400 });

  const ourEventBusArn = process.env.FILE_SYNC_EVENT_BUS_ARN;
  if (!ourEventBusArn)
    return NextResponse.json({ error: "FILE_SYNC_EVENT_BUS_ARN not configured" }, { status: 500 });

  try {
    const { setupBucketEventBridge } = await import("@/lib/aws/setup-bucket-events");
    const result = await setupBucketEventBridge(
      {
        roleArn: bucket.awsAccount.roleArn,
        externalId: bucket.awsAccount.externalId,
        awsAccountId: bucket.awsAccount.awsAccountId,
        region: bucket.region,
      },
      bucket.name,
      ourEventBusArn,
    );

    await prisma.bucket.update({
      where: { id },
      data: { eventBridgeRuleArn: result.eventBridgeRuleArn },
    });

    return NextResponse.json({ success: true, eventBridgeRuleArn: result.eventBridgeRuleArn });
  } catch (err: any) {
    console.error("EventBridge setup failed:", err);
    return NextResponse.json({ error: err?.message || "EventBridge setup failed" }, { status: 502 });
  }
}
