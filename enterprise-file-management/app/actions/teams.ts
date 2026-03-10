"use server";

import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { getHubTenantId } from "@/lib/hub-tenant";

export async function getTeams() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }

    const hubTenantId = await getHubTenantId();
    let whereClause = {};
    if (currentUser.role === "PLATFORM_ADMIN") {
      const effectiveTenantId = currentUser.activeTenantId;
      if (effectiveTenantId && effectiveTenantId !== hubTenantId) {
        whereClause = { tenantId: effectiveTenantId };
      } else {
        whereClause = { tenant: { isHubTenant: false } };
      }
    } else if (currentUser.tenantId) {
      whereClause = { tenantId: currentUser.tenantId };
    } else {
      return { success: false, error: "Unauthorized" };
    }

    const teams = await prisma.team.findMany({
      where: whereClause,
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
      },
    });

    return { success: true, data: teams };
  } catch (error) {
    console.error("Failed to fetch teams:", error);
    return { success: false, error: "Failed to fetch teams" };
  }
}
