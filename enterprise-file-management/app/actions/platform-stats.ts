"use server";

import prisma from "@/lib/prisma";

interface PlatformStatsFilters {
  timeRange?: string;
  dateFrom?: string;
  dateTo?: string;
}

function getDateFilter(
  filters?: PlatformStatsFilters,
): { gte?: Date; lte?: Date } | undefined {
  if (!filters?.timeRange || filters.timeRange === "all") return undefined;
  const now = new Date();
  if (filters.timeRange === "custom" && filters.dateFrom && filters.dateTo) {
    return { gte: new Date(filters.dateFrom), lte: new Date(filters.dateTo) };
  }
  const days: Record<string, number> = {
    today: 0,
    "7d": 7,
    "14d": 14,
    "30d": 30,
  };
  const d = days[filters.timeRange];
  if (d === undefined) return undefined;
  const from = new Date(now);
  if (d === 0) {
    from.setHours(0, 0, 0, 0);
  } else {
    from.setDate(from.getDate() - d);
  }
  return { gte: from, lte: now };
}

export async function getPlatformStats(filters?: PlatformStatsFilters) {
  const dateFilter = getDateFilter(filters);
  const createdAtFilter = dateFilter ? { createdAt: dateFilter } : {};

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
    prisma.tenant.count({ where: { isHubTenant: false, ...createdAtFilter } }),
    prisma.user.count({
      where: {
        isActive: true,
        role: { not: "PLATFORM_ADMIN" },
        tenant: { isHubTenant: false },
        ...createdAtFilter,
      },
    }),
    prisma.bucket.count({
      where: { tenant: { isHubTenant: false }, ...createdAtFilter },
    }),
    prisma.botIdentity.count({
      where: {
        isActive: true,
        tenant: { isHubTenant: false },
        ...createdAtFilter,
      },
    }),
    prisma.fileObject.aggregate({
      where: { tenant: { isHubTenant: false }, ...createdAtFilter },
      _sum: { size: true },
      _count: { id: true },
    }),
    prisma.awsAccount.groupBy({
      by: ["status"],
      where: { tenant: { isHubTenant: false } },
      _count: { id: true },
    }),
    prisma.auditLog.findMany({
      where: {
        ...createdAtFilter,
        // Exclude logs related to system admins/hub if desired,
        // but typically audit logs are filtered by the 'user' relationship
        user: { tenant: { isHubTenant: false } },
      },
      take: 8,
      orderBy: { createdAt: "desc" },
      include: { user: { select: { name: true, email: true } } },
    }),
    prisma.tenant.findMany({
      where: { isHubTenant: false, ...createdAtFilter },
      take: 5,
      include: {
        _count: { select: { users: true, buckets: true } },
        awsAccounts: { select: { status: true }, take: 1 },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  const tenantStorageMap = await prisma.fileObject.groupBy({
    by: ["tenantId"],
    where: {
      tenant: { isHubTenant: false },
      ...(dateFilter ? { createdAt: dateFilter } : {}),
    },
    _sum: { size: true },
  });
  const storageByTenant = Object.fromEntries(
    tenantStorageMap.map((r) => [r.tenantId, Number(r._sum.size ?? 0)]),
  );

  const awsStatusMap = Object.fromEntries(
    awsAccounts.map((r) => [r.status, r._count.id]),
  );

  return {
    tenantCount,
    userCount,
    bucketCount,
    botCount,
    totalFiles: fileAgg._count.id,
    totalStorageBytes: Number(fileAgg._sum.size ?? 0),
    awsConnected: awsStatusMap["CONNECTED"] ?? 0,
    awsPending:
      (awsStatusMap["PENDING_VALIDATION"] ?? 0) +
      (awsStatusMap["CREATING"] ?? 0),
    awsFailed:
      (awsStatusMap["FAILED"] ?? 0) + (awsStatusMap["DISCONNECTED"] ?? 0),
    awsTotal: awsAccounts.reduce((s, r) => s + r._count.id, 0),
    recentAuditLogs: recentAuditLogs.map((l) => {
      let details = {};
      if (l.details) {
        try {
          details = JSON.parse(l.details);
        } catch (e) {
          console.error(`Failed to parse audit log details for ID ${l.id}:`, e);
        }
      }
      return {
        id: l.id,
        action: l.action,
        resource: l.resource,
        status: l.status,
        createdAt: l.createdAt.toISOString(),
        userName: l.user?.name || l.user?.email || "Unknown",
        details,
      };
    }),
    topTenants: topTenants.map((t) => ({
      id: t.id,
      name: t.name,
      userCount: t._count.users,
      bucketCount: t._count.buckets,
      storageBytes: storageByTenant[t.id] ?? 0,
      awsStatus: t.awsAccounts[0]?.status ?? null,
    })),
  };
}
