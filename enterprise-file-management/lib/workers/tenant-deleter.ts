import prisma from "@/lib/prisma";
import { deleteUserInCognito } from "@/lib/auth-service";
import { logAudit } from "@/lib/audit";

/**
 * Background worker: deletes a tenant and all its DB records.
 * Fire-and-forget — never blocks the HTTP response.
 * No S3 actions are performed; S3 buckets and objects are left untouched.
 */
export async function deleteTenantWorker(
  tenantId: string,
  tenantName: string,
  requestingUserId: string,
): Promise<void> {
  console.log(`[tenant-deleter] Starting deletion for tenant ${tenantId} (${tenantName})`);

  try {
    // ── Step 1: Nullify FK refs that point to Users (createdBy/updatedBy)
    // This prevents FK violations when we delete users later.
    await prisma.$transaction([
      prisma.auditLog.updateMany({
        where: { userId: { in: await getTenantUserIds(tenantId) } },
        data: { userId: null, createdBy: null, updatedBy: null },
      }),
      prisma.bucket.updateMany({
        where: { tenantId },
        data: { createdBy: null, updatedBy: null },
      }),
      prisma.fileObject.updateMany({
        where: { tenantId },
        data: { createdBy: null, updatedBy: null },
      }),
      prisma.share.updateMany({
        where: { tenantId },
        data: { createdBy: null, updatedBy: null },
      }),
      prisma.resourcePolicy.updateMany({
        where: {
          userId: { in: await getTenantUserIds(tenantId) },
        },
        data: { createdBy: null, updatedBy: null },
      }),
      prisma.tenant.update({
        where: { id: tenantId },
        data: { createdBy: null, updatedBy: null },
      }),
    ]);

    // ── Step 2: Delete in dependency order (no S3 operations)
    // Multipart uploads
    await prisma.multipartUpload.deleteMany({
      where: { user: { tenantId } },
    });

    // Shares
    await prisma.share.deleteMany({ where: { tenantId } });

    // File objects
    await prisma.fileObject.deleteMany({ where: { tenantId } });

    // Buckets (DB records only — S3 buckets untouched)
    await prisma.bucket.deleteMany({ where: { tenantId } });

    // Team memberships
    await prisma.teamMembership.deleteMany({
      where: { team: { tenantId } },
    });

    // Resource policies for tenant teams
    await prisma.resourcePolicy.deleteMany({
      where: { team: { tenantId } },
    });

    // Teams
    await prisma.team.deleteMany({ where: { tenantId } });

    // Resource policies for tenant users
    await prisma.resourcePolicy.deleteMany({
      where: { user: { tenantId } },
    });

    // Bot identities
    await prisma.botIdentity.deleteMany({ where: { tenantId } });

    // AWS accounts (DB records only)
    await prisma.awsAccount.deleteMany({ where: { tenantId } });

    // Users — delete from Cognito first, then DB
    const users = await prisma.user.findMany({
      where: { tenantId },
      select: { id: true, email: true },
    });

    for (const user of users) {
      try {
        await deleteUserInCognito(user.email);
      } catch (err: any) {
        // Log but don't abort — Cognito user may already be deleted
        console.warn(`[tenant-deleter] Cognito delete failed for ${user.email}: ${err.message}`);
      }
    }

    await prisma.user.deleteMany({ where: { tenantId } });

    // Finally delete the tenant
    await prisma.tenant.delete({ where: { id: tenantId } });

    // ── Step 3: Audit log
    void logAudit({
      userId: requestingUserId,
      action: "TENANT_DELETED",
      resource: "Tenant",
      resourceId: tenantId,
      details: { tenantName, userCount: users.length },
      status: "SUCCESS",
    });

    console.log(`[tenant-deleter] Completed deletion for tenant ${tenantId}`);
  } catch (err: any) {
    console.error(`[tenant-deleter] Failed to delete tenant ${tenantId}:`, err);

    void logAudit({
      userId: requestingUserId,
      action: "TENANT_DELETED",
      resource: "Tenant",
      resourceId: tenantId,
      details: { tenantName, error: err.message },
      status: "FAILED",
    });
  }
}

/** Helper: get all user IDs for a tenant (used for FK nullification) */
async function getTenantUserIds(tenantId: string): Promise<string[]> {
  const users = await prisma.user.findMany({
    where: { tenantId },
    select: { id: true },
  });
  return users.map((u) => u.id);
}
