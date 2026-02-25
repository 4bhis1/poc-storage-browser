"use server";

import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";

export async function getTeams() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }

    // Platform admin can see all teams (or could filter by tenant if supported)
    // Tenant admin should only see their tenant's teams
    let whereClause = {};
    if (currentUser.role !== "PLATFORM_ADMIN" && currentUser.tenantId) {
      whereClause = { tenantId: currentUser.tenantId };
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
