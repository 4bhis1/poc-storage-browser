import prisma from "./prisma";
import { Role, User } from "./generated/prisma/client";

// ResourceContext defines what we are trying to access
export interface ResourceContext {
  tenantId: string;
  resourceType: "bucket" | "folder" | "object" | "account" | "tenant";
  resourceId?: string; // e.g. bucketId, folderId, or accountId
}

export type Action =
  | "READ"
  | "WRITE"
  | "DELETE"
  | "LIST"
  | "DOWNLOAD"
  | "SHARE";

export async function checkPermission(
  user: User & { policies: any[]; teams?: any[] },
  action: Action,
  context: ResourceContext,
): Promise<boolean> {
  // 1. Platform Admin: Access everything
  if (user.role === Role.PLATFORM_ADMIN) {
    return true;
  }

  // 2. Tenant Isolation
  // If resource has a tenantId, user must belong to it
  if (context.tenantId && user.tenantId !== context.tenantId) {
    return false;
  }

  // 3. Tenant Admin: Access everything within tenant (Unless explicit granular check is desired, but typically Admins see all)
  // To strictly enforce policies even on Admins, we would fall through to TEAMMATE logic.
  // However, for this platform, TENANT_ADMIN inherently has access to all buckets in their tenant.
  if (user.role === Role.TENANT_ADMIN) {
    return true;
  }

  // 4. Teammate or Team Admin: Check Policies
  if (user.role === Role.TEAMMATE || user.role === Role.TEAM_ADMIN) {
    let allPolicies: any[] = [];

    if (user.policies) {
      allPolicies = [...allPolicies, ...user.policies];
    }

    if (user.teams) {
      user.teams.forEach((membership: any) => {
        if (membership.team && membership.team.policies) {
          allPolicies = [...allPolicies, ...membership.team.policies];
        }
      });
    }

    const hasPermission = allPolicies.some((policy) => {
      const typeMatch =
        policy.resourceType?.toLowerCase() ===
        context.resourceType?.toLowerCase();
      const idMatch =
        policy.resourceId === null ||
        policy.resourceId === undefined ||
        policy.resourceId === context.resourceId;
      const actionMatch = policy.actions.includes(action);

      return typeMatch && idMatch && actionMatch;
    });

    if (hasPermission) return true;

    // Hierarchy Check (Optional but good):
    // If checking object, do they have bucket permission?
    // This requires fetching parent details which might be expensive here.
    // For now, we enforce explicit permissions or rely on the "resourceId: null" wildcard policy.

    return false;
  }

  return false;
}
