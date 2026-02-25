"use server";

import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function mapUserToTeams(userId: string, teamIds: string[]) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser || !['PLATFORM_ADMIN', 'TENANT_ADMIN'].includes(currentUser.role)) {
      return { success: false, error: "Unauthorized" };
    }

    // Since Prisma doesn't have a simple "sync" for many-to-many with explicit join tables, we delete existing and recreate.
    await prisma.$transaction(async (tx) => {
      // Delete existing memberships
      await tx.teamMembership.deleteMany({
        where: { userId },
      });

      // Create new memberships
      if (teamIds.length > 0) {
        await tx.teamMembership.createMany({
          data: teamIds.map((teamId) => ({
            userId,
            teamId,
          })),
        });
      }
    });

    revalidatePath("/users");
    revalidatePath("/teams");
    return { success: true };
  } catch (error: any) {
    console.error("Failed to map user to teams:", error);
    return { success: false, error: error.message || "Failed to map user to teams" };
  }
}
