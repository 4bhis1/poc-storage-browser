import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { Role } from "@/lib/generated/prisma/client";
import { logAudit } from "@/lib/audit";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ userId: string }> },
) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== Role.PLATFORM_ADMIN)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { userId } = await params;

  // Find the target user row
  const target = await prisma.user.findUnique({ where: { id: userId } });
  if (!target)
    return NextResponse.json({ error: "User not found" }, { status: 404 });

  // Guard: cannot remove last tenant assignment for this email
  const siblingCount = await prisma.user.count({
    where: { email: target.email },
  });
  if (siblingCount === 1)
    return NextResponse.json(
      { error: "Cannot remove last tenant assignment" },
      { status: 400 },
    );

  // Check FK references
  const [
    auditLogs,
    resourcePolicies,
    teamMemberships,
    botIdentities,
    sharesCreated,
    sharesUpdated,
    bucketsCreated,
    bucketsUpdated,
    filesCreated,
    filesUpdated,
    multipartUploads,
  ] = await Promise.all([
    prisma.auditLog.count({ where: { userId } }),
    prisma.resourcePolicy.count({ where: { userId } }),
    prisma.teamMembership.count({ where: { userId } }),
    prisma.botIdentity.count({ where: { userId } }),
    prisma.share.count({ where: { createdBy: userId } }),
    prisma.share.count({ where: { updatedBy: userId } }),
    prisma.bucket.count({ where: { createdBy: userId } }),
    prisma.bucket.count({ where: { updatedBy: userId } }),
    prisma.fileObject.count({ where: { createdBy: userId } }),
    prisma.fileObject.count({ where: { updatedBy: userId } }),
    prisma.multipartUpload.count({ where: { userId } }),
  ]);

  const deps: string[] = [];
  if (auditLogs) deps.push(`AuditLog (${auditLogs})`);
  if (resourcePolicies) deps.push(`ResourcePolicy (${resourcePolicies})`);
  if (teamMemberships) deps.push(`TeamMembership (${teamMemberships})`);
  if (botIdentities) deps.push(`BotIdentity (${botIdentities})`);
  if (sharesCreated || sharesUpdated)
    deps.push(`Share (${sharesCreated + sharesUpdated})`);
  if (bucketsCreated || bucketsUpdated)
    deps.push(`Bucket (${bucketsCreated + bucketsUpdated})`);
  if (filesCreated || filesUpdated)
    deps.push(`FileObject (${filesCreated + filesUpdated})`);
  if (multipartUploads) deps.push(`MultipartUpload (${multipartUploads})`);

  if (deps.length > 0)
    return NextResponse.json(
      {
        error: `Cannot delete user: dependent records exist — ${deps.join(", ")}`,
      },
      { status: 409 },
    );

  await prisma.user.delete({ where: { id: userId } });

  logAudit({
    userId: user.id,
    action: "USER_REMOVED_TENANT",
    resource: "TenantAccess",
    resourceId: userId,
    details: {
      targetEmail: target.email,
      tenantId: target.tenantId,
    },
    status: "SUCCESS",
    ipAddress: _request.headers.get("x-forwarded-for") || "127.0.0.1",
  });

  return NextResponse.json({ success: true }, { status: 200 });
}
