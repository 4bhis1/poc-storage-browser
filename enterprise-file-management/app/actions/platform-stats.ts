"use server"

import prisma from "@/lib/prisma"

export async function getPlatformStats() {
  const [
    tenantCount,
    userCount,
    bucketCount,
    botCount,
    fileAgg,
    awsAccounts,
    recentAuditLogs,
    topTenants,
  ] = await Promise.all([
    prisma.tenant.count(),
    prisma.user.count({ where: { isActive: true } }),
    prisma.bucket.count(),
    prisma.botIdentity.count({ where: { isActive: true } }),
    prisma.fileObject.aggregate({ _sum: { size: true }, _count: { id: true } }),
    prisma.awsAccount.groupBy({ by: ["status"], _count: { id: true } }),
    prisma.auditLog.findMany({
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.tenant.findMany({
      take: 5,
      include: {
        _count: { select: { users: true, buckets: true } },
        awsAccounts: { select: { status: true }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    }),
  ])

  // Storage aggregation per tenant for top tenants
  const tenantStorageMap = await prisma.fileObject.groupBy({
    by: ["tenantId"],
    _sum: { size: true },
  })
  const storageByTenant = Object.fromEntries(
    tenantStorageMap.map((r) => [r.tenantId, Number(r._sum.size ?? 0)])
  )

  const awsStatusMap = Object.fromEntries(
    awsAccounts.map((r) => [r.status, r._count.id])
  )

  return {
    tenantCount,
    userCount,
    bucketCount,
    botCount,
    totalFiles: fileAgg._count.id,
    totalStorageBytes: Number(fileAgg._sum.size ?? 0),
    awsConnected: awsStatusMap["CONNECTED"] ?? 0,
    awsPending: (awsStatusMap["PENDING_VALIDATION"] ?? 0) + (awsStatusMap["CREATING"] ?? 0),
    awsFailed: (awsStatusMap["FAILED"] ?? 0) + (awsStatusMap["DISCONNECTED"] ?? 0),
    awsTotal: awsAccounts.reduce((s, r) => s + r._count.id, 0),
    recentAuditLogs: recentAuditLogs.map((l) => ({
      id: l.id,
      action: l.action,
      resource: l.resource,
      status: l.status,
      createdAt: l.createdAt.toISOString(),
      userName: l.user?.name || l.user?.email || "Unknown",
      details: l.details ? JSON.parse(l.details) : {},
    })),
    topTenants: topTenants.map((t) => ({
      id: t.id,
      name: t.name,
      isHubTenant: t.isHubTenant,
      userCount: t._count.users,
      bucketCount: t._count.buckets,
      storageBytes: storageByTenant[t.id] ?? 0,
      awsStatus: t.awsAccounts[0]?.status ?? null,
    })),
  }
}
