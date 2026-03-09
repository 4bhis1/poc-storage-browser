"use server";

import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { checkPermission } from "@/lib/rbac";
import { Role } from "@/lib/generated/prisma/client";

export async function getAuditLogs(filters?: {
  action?: string;
  timeRange?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  limit?: number;
  tenantId?: string;
}) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const skip = (page - 1) * limit;

    const whereClause: any = {};

    // ── 1. Tenant/Role Filters ──
    if (user.role === "TENANT_ADMIN") {
      whereClause.user = { tenantId: user.tenantId };
    } else if (user.role === "TEAMMATE") {
      const userWithPolicies: any = await prisma.user.findUnique({
        where: { id: user.id },
        include: {
          policies: true,
          teams: { include: { team: { include: { policies: true } } } },
        },
      });

      if (userWithPolicies && user.tenantId) {
        const buckets = await prisma.bucket.findMany({
          where: { tenantId: user.tenantId },
        });

        const allowedBucketIds = new Set<string>();
        for (const b of buckets) {
          const hasAccess = await checkPermission(userWithPolicies, "READ", {
            tenantId: user.tenantId!,
            resourceType: "bucket",
            resourceId: b.id,
          });
          if (hasAccess) allowedBucketIds.add(b.id);
        }

        // TEAMMATE: Can see their own logs OR logs for buckets they can access
        const teammateOrConditions: any[] = [{ userId: user.id }];
        if (allowedBucketIds.size > 0) {
          const bucketOrs = Array.from(allowedBucketIds).map((id) => ({
            details: { contains: id },
          }));
          teammateOrConditions.push({ OR: bucketOrs });
        }
        whereClause.OR = teammateOrConditions;
      } else {
        // Fallback if no tenant/policies: only see own logs
        whereClause.userId = user.id;
      }
    }

    // ── Tenant Filter (PLATFORM_ADMIN only) ──
    if (user.role === "PLATFORM_ADMIN" && filters?.tenantId) {
      whereClause.user = { tenantId: filters.tenantId };
    }

    // ── 2. Time Range Filters ──
    if (filters?.timeRange && filters.timeRange !== "all") {
      if (
        filters.timeRange === "custom" &&
        filters.dateFrom &&
        filters.dateTo
      ) {
        const from = new Date(filters.dateFrom);
        const to = new Date(filters.dateTo);
        to.setHours(23, 59, 59, 999);
        whereClause.createdAt = { gte: from, lte: to };
      } else if (filters.timeRange !== "custom") {
        const now = new Date();
        let threshold = new Date();
        if (filters.timeRange === "7d") threshold.setDate(now.getDate() - 7);
        else if (filters.timeRange === "30d")
          threshold.setDate(now.getDate() - 30);
        else if (filters.timeRange === "90d")
          threshold.setDate(now.getDate() - 90);

        whereClause.createdAt = { gte: threshold };
      }
    }

    // ── 3. Action Filters ──
    if (filters?.action && filters.action !== "all") {
      const f = filters.action;
      if (f === "upload")
        whereClause.action = { contains: "upload", mode: "insensitive" };
      else if (f === "download")
        whereClause.action = { contains: "download", mode: "insensitive" };
      else if (f === "delete") {
        whereClause.OR = [
          ...(whereClause.OR || []),
          { action: { contains: "delete", mode: "insensitive" } },
          { action: { contains: "remove", mode: "insensitive" } },
        ];
      } else if (f === "share") {
        whereClause.OR = [
          ...(whereClause.OR || []),
          { action: { contains: "share", mode: "insensitive" } },
          { action: { contains: "permission", mode: "insensitive" } },
        ];
      } else if (f === "create_bucket")
        whereClause.action = { contains: "create", mode: "insensitive" };
      else if (f === "invite_user") {
        whereClause.OR = [
          ...(whereClause.OR || []),
          { action: { contains: "team", mode: "insensitive" } },
          { action: { contains: "login", mode: "insensitive" } },
        ];
      } else if (f === "modify")
        whereClause.action = { contains: "modify", mode: "insensitive" };
      else if (f === "sync")
        whereClause.action = { contains: "sync", mode: "insensitive" };
      else if (f === "view")
        whereClause.action = { contains: "view", mode: "insensitive" };
      else {
        whereClause.action = f;
      }
    }

    // ── DB Query execution ──
    const [totalCount, dbLogs] = await Promise.all([
      prisma.auditLog.count({ where: whereClause }),
      prisma.auditLog.findMany({
        where: whereClause,
        include: {
          user: { select: { name: true, email: true } },
        },
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
    ]);

    // Parse details string into JSON
    const logs = dbLogs.map((log: any) => {
      let parsedDetails = log.details;
      if (typeof log.details === "string") {
        try {
          parsedDetails = JSON.parse(log.details);
        } catch (e) {
          // Keep as string if parsing fails
        }
      }
      return { ...log, details: parsedDetails || {} };
    });

    // Extract bucket IDs to fetch names
    const bucketIds = new Set<string>();
    logs.forEach((log: any) => {
      if (log.details?.bucketId) {
        bucketIds.add(log.details.bucketId);
      }
    });

    const buckets = await prisma.bucket.findMany({
      where: { id: { in: Array.from(bucketIds) } },
      select: { id: true, name: true },
    });

    const bucketMap = new Map(buckets.map((b) => [b.id, b.name]));

    const enrichedLogs = logs.map((log: any) => {
      if (log.details?.bucketId) {
        log.details.bucketName =
          bucketMap.get(log.details.bucketId) ||
          log.details.bucketName ||
          "Unknown Bucket";
      }
      return log;
    });

    return {
      success: true,
      data: enrichedLogs,
      pagination: {
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        limit,
      },
    };
  } catch (error) {
    console.error("Failed to fetch audit logs:", error);
    return { success: false, error: "Failed to fetch audit logs" };
  }
}

// ─── S3 cost rate ────────────────────────────────────────────────────────────
const COST_PER_GB = 0.023; // $0.023 per GB/month (standard S3 rate)

// Helper: resolve which bucket IDs the user is allowed to see
async function getAllowedBucketIds(user: any): Promise<string[] | null> {
  // null means "all buckets" (admin shortcut)
  if (user.role === Role.PLATFORM_ADMIN) return null;

  if (user.role === Role.TENANT_ADMIN) {
    const tenantBuckets = await prisma.bucket.findMany({
      where: { tenantId: user.tenantId },
      select: { id: true },
    });
    return tenantBuckets.map((b) => b.id);
  }

  // TEAMMATE — check policies from direct assignments + team memberships
  const allPolicies: any[] = [
    ...(user.policies || []),
    ...(user.teams || []).flatMap(
      (membership: any) => membership.team?.policies || [],
    ),
  ];

  const hasGlobalAccess = allPolicies.some(
    (p: any) =>
      p.resourceType?.toLowerCase() === "bucket" &&
      p.resourceId === null &&
      (p.actions.includes("READ") || p.actions.includes("LIST")),
  );

  if (hasGlobalAccess) {
    // Wildcard access — return all tenant buckets
    const tenantBuckets = await prisma.bucket.findMany({
      where: { tenantId: user.tenantId },
      select: { id: true },
    });
    return tenantBuckets.map((b) => b.id);
  }

  const allowedIds = [
    ...new Set(
      allPolicies
        .filter(
          (p: any) =>
            p.resourceType?.toLowerCase() === "bucket" &&
            p.resourceId !== null &&
            (p.actions.includes("READ") || p.actions.includes("LIST")),
        )
        .map((p: any) => p.resourceId as string),
    ),
  ];

  return allowedIds;
}

export interface DashboardStats {
  totalFiles: number;
  totalStorageBytes: number;
  activeBuckets: number;
  monthlyCostUsd: number;
  storageByBucket: { name: string; sizeGb: number }[];
  costTrend: { month: string; total: number }[];
}

export async function getDashboardStats(filters?: {
  timeRange?: string;
  dateFrom?: string;
  dateTo?: string;
}): Promise<
  { success: true; data: DashboardStats } | { success: false; error: string }
> {
  try {
    const user = await getCurrentUser();
    if (!user) return { success: false, error: "Unauthorized" };

    const allowedBucketIds = await getAllowedBucketIds(user);

    let dateFrom: Date | undefined;
    let dateTo: Date | undefined;

    if (filters?.timeRange && filters.timeRange !== "all") {
      if (
        filters.timeRange === "custom" &&
        filters.dateFrom &&
        filters.dateTo
      ) {
        dateFrom = new Date(filters.dateFrom);
        dateTo = new Date(filters.dateTo);
        dateTo.setHours(23, 59, 59, 999);
      } else if (filters.timeRange !== "custom") {
        const now = new Date();
        dateTo = new Date();
        dateTo.setHours(23, 59, 59, 999);

        dateFrom = new Date();
        if (filters.timeRange === "today") {
          dateFrom.setHours(0, 0, 0, 0);
        } else if (filters.timeRange === "7d") {
          dateFrom.setDate(now.getDate() - 7);
          dateFrom.setHours(0, 0, 0, 0);
        } else if (filters.timeRange === "14d") {
          dateFrom.setDate(now.getDate() - 14);
          dateFrom.setHours(0, 0, 0, 0);
        } else if (filters.timeRange === "30d") {
          dateFrom.setDate(now.getDate() - 30);
          dateFrom.setHours(0, 0, 0, 0);
        }
      }
    }

    // Build Prisma where clause for FileObject queries
    const fileWhere: any = { isFolder: false };
    if (allowedBucketIds !== null) {
      fileWhere.bucketId = { in: allowedBucketIds };
    }
    if (dateFrom && dateTo) {
      fileWhere.createdAt = { gte: dateFrom, lte: dateTo };
    }

    // ── 1. Aggregate totals ──────────────────────────────────────────────────
    const [fileAgg, bucketCount] = await Promise.all([
      prisma.fileObject.aggregate({
        where: fileWhere,
        _count: { id: true },
        _sum: { size: true },
      }),
      prisma.bucket.count(
        allowedBucketIds !== null
          ? { where: { id: { in: allowedBucketIds } } }
          : undefined,
      ),
    ]);

    const totalFiles = fileAgg._count.id;
    const totalStorageBytes = Number(fileAgg._sum.size ?? 0);
    const totalStorageGb = totalStorageBytes / 1_073_741_824; // bytes → GiB
    const monthlyCostUsd = parseFloat(
      (totalStorageGb * COST_PER_GB).toFixed(2),
    );

    // ── 2. Storage by bucket ─────────────────────────────────────────────────
    const bucketIds =
      allowedBucketIds ??
      (await prisma.bucket.findMany({ select: { id: true } })).map((b) => b.id);

    const bucketRows = await prisma.bucket.findMany({
      where: { id: { in: bucketIds } },
      select: { id: true, name: true },
    });

    const storageByBucketRaw = await Promise.all(
      bucketRows.map(async (b) => {
        const agg = await prisma.fileObject.aggregate({
          where: { ...fileWhere, bucketId: b.id },
          _sum: { size: true },
        });
        return {
          name: b.name,
          sizeGb: parseFloat(
            (Number(agg._sum.size ?? 0) / 1_073_741_824).toFixed(3),
          ),
        };
      }),
    );

    // Sort descending by size
    const storageByBucket = storageByBucketRaw.sort(
      (a, b) => b.sizeGb - a.sizeGb,
    );

    // ── 3. Cost trend (last 6 months or daily) ───────────────────────────────
    let costTrend: { month: string; total: number }[] = [];

    if (dateFrom && dateTo) {
      // Build day boundaries for the selected range
      const days: { label: string; end: Date }[] = [];
      const diffTime = Math.abs(dateTo.getTime() - dateFrom.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      // Limit to 31 days max to prevent large loops
      for (let i = 0; i <= Math.min(diffDays, 31); i++) {
        const d = new Date(
          dateFrom.getFullYear(),
          dateFrom.getMonth(),
          dateFrom.getDate() + i,
        );
        if (d > dateTo && i > 0) break;

        const label = d.toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        });
        const endOfDay = new Date(d);
        endOfDay.setHours(23, 59, 59, 999);
        days.push({ label, end: endOfDay });
      }

      costTrend = await Promise.all(
        days.map(async ({ label, end }) => {
          const agg = await prisma.fileObject.aggregate({
            where: {
              ...(allowedBucketIds !== null
                ? { bucketId: { in: allowedBucketIds } }
                : {}),
              isFolder: false,
              createdAt: { lt: end }, // cumulative storage up to this day
            },
            _sum: { size: true },
          });
          const gb = Number(agg._sum.size ?? 0) / 1_073_741_824;
          return {
            month: label,
            total: parseFloat((gb * COST_PER_GB).toFixed(2)),
          };
        }),
      );
    } else {
      // Build month boundaries for the last 6 calendar months
      const now = new Date();
      const months: { label: string; start: Date; end: Date }[] = [];
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const start = new Date(d.getFullYear(), d.getMonth(), 1);
        const end = new Date(d.getFullYear(), d.getMonth() + 1, 1);
        const label = d.toLocaleString("en-US", {
          month: "short",
          year: "numeric",
        });
        months.push({ label, start, end });
      }

      // For each month, sum storage added up to the END of that month
      costTrend = await Promise.all(
        months.map(async ({ label, end }) => {
          const agg = await prisma.fileObject.aggregate({
            where: {
              ...(allowedBucketIds !== null
                ? { bucketId: { in: allowedBucketIds } }
                : {}),
              isFolder: false,
              createdAt: { lt: end },
            },
            _sum: { size: true },
          });
          const gb = Number(agg._sum.size ?? 0) / 1_073_741_824;
          return {
            month: label,
            total: parseFloat((gb * COST_PER_GB).toFixed(2)),
          };
        }),
      );
    }

    return {
      success: true,
      data: {
        totalFiles,
        totalStorageBytes,
        activeBuckets: bucketCount,
        monthlyCostUsd,
        storageByBucket,
        costTrend,
      },
    };
  } catch (error) {
    console.error("Failed to fetch dashboard stats:", error);
    return { success: false, error: "Failed to fetch dashboard stats" };
  }
}
