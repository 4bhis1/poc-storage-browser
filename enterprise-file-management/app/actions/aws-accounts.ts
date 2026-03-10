"use server";

import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { Role } from "@/lib/generated/prisma/client";
import { validateAwsAccount } from "@/lib/workers/account-validator";
import { getHubTenantId } from "@/lib/hub-tenant";

export async function getAwsAccounts() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return { success: false, error: "Unauthorized" };
    }

    const hubTenantId = await getHubTenantId();
    let whereClause: any = {};
    if (user.role === Role.PLATFORM_ADMIN) {
      const effectiveTenantId = user.activeTenantId;
      if (effectiveTenantId && effectiveTenantId !== hubTenantId) {
        whereClause.tenantId = effectiveTenantId;
      } else {
        whereClause.tenant = { isHubTenant: false };
      }
    } else if (user.role === Role.TENANT_ADMIN) {
      whereClause.tenantId = user.tenantId;
    } else {
      return { success: false, error: "Unauthorized" };
    }

    const accounts = await prisma.awsAccount.findMany({
      where: whereClause,
      include: {
        tenant: {
          select: {
            name: true,
          },
        },
        _count: {
          select: {
            buckets: true,
          },
        },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    return { success: true, data: accounts };
  } catch (error) {
    console.error("Failed to fetch AWS accounts:", error);
    return { success: false, error: "Failed to fetch AWS accounts" };
  }
}

export async function triggerAccountValidation(accountId: string) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== Role.PLATFORM_ADMIN) {
      return { success: false, error: "Unauthorized" };
    }

    const account = await prisma.awsAccount.findUnique({
      where: { id: accountId },
    });

    if (!account) {
      return { success: false, error: "AWS Account not found" };
    }

    // Set to pending immediately so UI reflects it
    await prisma.awsAccount.update({
      where: { id: accountId },
      data: { status: "PENDING_VALIDATION" },
    });

    // Run validation in the background (fire and forget)
    validateAwsAccount(accountId, user.id, 2).catch(console.error);

    return { success: true };
  } catch (error) {
    console.error("Failed to trigger validation:", error);
    return { success: false, error: "Failed to trigger validation" };
  }
}
