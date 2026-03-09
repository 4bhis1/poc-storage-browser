"use server";

import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import {
  inviteUserToCognito,
  updateUserRoleInCognito,
  createUserWithPasswordInCognito,
  toggleUserActiveStatusInCognito,
  deleteUserInCognito,
} from "@/lib/auth-service";
import { hashPassword } from "@/lib/auth";
import { Role } from "@/lib/generated/prisma/client";
import { revalidatePath } from "next/cache";
import { logAudit } from "@/lib/audit";

export async function getUsers() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }

    let whereClause = {};
    if (currentUser.role !== "PLATFORM_ADMIN") {
      if (!currentUser.tenantId) {
        return { success: false, error: "Unauthorized" };
      }
      whereClause = { tenantId: currentUser.tenantId };
    }

    const users = await prisma.user.findMany({
      where: whereClause,
      orderBy: {
        createdAt: "desc",
      },
      include: {
        tenant: true,
        teams: {
          include: {
            team: true,
          },
        },
      },
    });

    return { success: true, data: users };
  } catch (error) {
    console.error("Failed to fetch users:", error);
    return { success: false, error: "Failed to fetch users" };
  }
}

export async function inviteUser(formData: FormData) {
  const name = formData.get("name") as string;
  const email = (formData.get("email") as string).toLowerCase();
  const role = formData.get("role") as Role;
  const tenantId = formData.get("tenantId") as string;

  if (!email || !role || !tenantId) {
    return { success: false, error: "Missing required fields" };
  }

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }

    if (currentUser.role !== "PLATFORM_ADMIN") {
      if (
        currentUser.role !== "TENANT_ADMIN" ||
        currentUser.tenantId !== tenantId
      ) {
        return {
          success: false,
          error: `Unauthorized to invite to this tenant. Expected role TENANT_ADMIN, got ${currentUser.role}. Expected tenant ${tenantId}, got ${currentUser.tenantId}.`,
        };
      }
    }

    // Invite User to Cognito (sends magic link/temp password)
    await inviteUserToCognito(email, tenantId, role, name);

    // Save user in database
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        role,
        tenantId,
      },
    });

    void logAudit({
      userId: currentUser.id,
      action: "USER_INVITED",
      resource: "User",
      resourceId: newUser.id,
      details: { email, role, tenantId },
      status: "SUCCESS",
    });

    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    console.error("Failed to invite user:", error);
    return {
      success: false,
      error: "Failed to invite user. Email might be in use.",
    };
  }
}

export async function updateUserRole(userId: string, newRole: Role) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) {
      return { success: false, error: "User not found" };
    }

    if (currentUser.role !== "PLATFORM_ADMIN") {
      if (
        currentUser.role !== "TENANT_ADMIN" ||
        currentUser.tenantId !== targetUser.tenantId
      ) {
        return {
          success: false,
          error: "Unauthorized to modify this user's role",
        };
      }
    }

    // Prevent tenant admin from demoting themselves (optional, but good practice)
    if (
      currentUser.id === userId &&
      currentUser.role === "TENANT_ADMIN" &&
      newRole !== "TENANT_ADMIN"
    ) {
      return { success: false, error: "Cannot demote yourself" };
    }

    // 1. Update Cognito so the next session gets the correct token
    await updateUserRoleInCognito(targetUser.email, newRole);

    // 2. Update Database
    await prisma.user.update({
      where: { id: userId },
      data: { role: newRole },
    });

    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    console.error("Failed to change user role:", error);
    return { success: false, error: "Failed to update user role" };
  }
}

export async function createUserWithPassword(formData: FormData) {
  const name = formData.get("name") as string;
  const email = (formData.get("email") as string).toLowerCase();
  const role = formData.get("role") as Role;
  const tenantId = formData.get("tenantId") as string;
  const password = formData.get("password") as string;

  if (!email || !role || !tenantId || !password) {
    return { success: false, error: "Missing required fields" };
  }

  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) {
      return { success: false, error: "Unauthorized" };
    }

    if (currentUser.role !== "PLATFORM_ADMIN") {
      if (
        currentUser.role !== "TENANT_ADMIN" ||
        currentUser.tenantId !== tenantId
      ) {
        return {
          success: false,
          error: `Unauthorized to create user for this tenant. Expected role TENANT_ADMIN, got ${currentUser.role}. Expected tenant ${tenantId}, got ${currentUser.tenantId}.`,
        };
      }
    }

    // Create User in Cognito with permanent password
    await createUserWithPasswordInCognito(
      email,
      password,
      role,
      name,
      tenantId,
    );

    const hashedPassword = await hashPassword(password);

    // Save user in database
    const newUser = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        role,
        tenantId,
      },
    });

    void logAudit({
      userId: currentUser.id,
      action: "USER_INVITED",
      resource: "User",
      resourceId: newUser.id,
      details: { email, role, tenantId },
      status: "SUCCESS",
    });

    revalidatePath(`/superadmin/tenants/${tenantId}`);
    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    console.error("Failed to create user:", error);
    return {
      success: false,
      error: "Failed to create user. Email might be in use.",
    };
  }
}

export async function toggleUserStatus(userId: string, isActive: boolean) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return { success: false, error: "Unauthorized" };

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) return { success: false, error: "User not found" };

    // Prevent self-disable
    if (currentUser.id === userId && !isActive) {
      return { success: false, error: "Cannot disable your own account" };
    }

    if (currentUser.role !== "PLATFORM_ADMIN") {
      if (
        currentUser.role !== "TENANT_ADMIN" ||
        currentUser.tenantId !== targetUser.tenantId
      ) {
        return { success: false, error: "Unauthorized to modify this user" };
      }
    }

    // Update Cognito
    await toggleUserActiveStatusInCognito(targetUser.email, isActive);

    // Update Database
    await prisma.user.update({
      where: { id: userId },
      data: { isActive },
    });

    revalidatePath(`/superadmin/tenants/${targetUser.tenantId}`);
    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    console.error("Failed to toggle user status:", error);
    return { success: false, error: "Failed to toggle user status" };
  }
}

export async function removeUser(userId: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser) return { success: false, error: "Unauthorized" };

    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) return { success: false, error: "User not found" };

    // Prevent self-deletion
    if (currentUser.id === userId) {
      return { success: false, error: "Cannot delete your own account" };
    }

    if (currentUser.role !== "PLATFORM_ADMIN") {
      if (
        currentUser.role !== "TENANT_ADMIN" ||
        currentUser.tenantId !== targetUser.tenantId
      ) {
        return { success: false, error: "Unauthorized to modify this user" };
      }
    }

    // Optionally, check if they own buckets or anything else preventing deletion
    // and handle logic or reassign. Depending on logic, cascade delete might happen.
    // For now, let's delete them from cognito, then db.
    await deleteUserInCognito(targetUser.email);

    await prisma.user.delete({
      where: { id: userId },
    });

    revalidatePath(`/superadmin/tenants/${targetUser.tenantId}`);
    revalidatePath("/users");
    return { success: true };
  } catch (error) {
    console.error("Failed to remove user:", error);
    return { success: false, error: "Failed to remove user" };
  }
}
