"use server";

import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { hashPassword } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { getHubTenantId } from "@/lib/hub-tenant";

export async function getTeammates() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const hubTenantId = await getHubTenantId();
    const effectiveTenantId =
      user.role === "PLATFORM_ADMIN" ? user.activeTenantId : user.tenantId;

    if (!effectiveTenantId || effectiveTenantId === hubTenantId) {
      // Platform hub is imaginary, it has no visible teammates for normal views
      return { success: true, data: [] };
    }

    const teammates = await prisma.user.findMany({
      where: {
        tenantId: effectiveTenantId,
        role: { not: "PLATFORM_ADMIN" },
      },
      orderBy: {
        createdAt: "desc",
      },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        createdAt: true,
        // Exclude password
      },
    });

    return { success: true, data: teammates };
  } catch (error) {
    console.error("Failed to fetch teammates:", error);
    return { success: false, error: "Failed to fetch teammates" };
  }
}

export async function inviteTeammate(formData: FormData) {
  const name = formData.get("name") as string;
  const email = formData.get("email") as string;
  const role = formData.get("role") as Role;
  const password = formData.get("password") as string;

  if (!name || !email || !role || !password) {
    return { success: false, error: "Missing required fields" };
  }

  if (role === "PLATFORM_ADMIN" || role === "TEAM_ADMIN") {
    return { success: false, error: "Cannot assign restricted roles" };
  }

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }

    const hubTenantId = await getHubTenantId();
    const effectiveTenantId =
      currentUser.role === "PLATFORM_ADMIN"
        ? currentUser.activeTenantId
        : currentUser.tenantId;

    if (
      !effectiveTenantId ||
      effectiveTenantId === hubTenantId ||
      (currentUser.role !== "TENANT_ADMIN" &&
        currentUser.role !== "PLATFORM_ADMIN")
    ) {
      return { success: false, error: "Unauthorized" };
    }

    const hashedPassword = await hashPassword(password);

    await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        tenantId: effectiveTenantId,
      },
    });

    revalidatePath("/teammates");
    return { success: true };
  } catch (error) {
    console.error("Failed to invite teammate:", error);
    return {
      success: false,
      error: "Failed to invite teammate. Email might be taken.",
    };
  }
}
