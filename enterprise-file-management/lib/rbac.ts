
import prisma from './prisma';
import { Role, User } from './generated/prisma/client';

// ResourceContext defines what we are trying to access
export interface ResourceContext {
    tenantId: string;
    resourceType: 'bucket' | 'folder' | 'object' | 'account' | 'tenant';
    resourceId?: string; // e.g. bucketId, folderId, or accountId
}

export type Action = 'READ' | 'WRITE' | 'DELETE' | 'LIST';

export async function checkPermission(user: User & { policies: any[] }, action: Action, context: ResourceContext): Promise<boolean> {
    // 1. Platform Admin: Access everything
    if (user.role === Role.PLATFORM_ADMIN) {
        return true;
    }

    // 2. Tenant Isolation
    // If resource has a tenantId, user must belong to it
    if (context.tenantId && user.tenantId !== context.tenantId) {
        return false;
    }

    // 3. Tenant Admin: Access everything within tenant
    if (user.role === Role.TENANT_ADMIN) {
        return true;
    }

    // 4. Teammate: Check Policies
    if (user.role === Role.TEAMMATE) {
        // Simple check: Do they have a policy for this specific resource?
        // Logic:
        // - Search policies for matching resourceType and resourceId (or null for global/all of type)
        // - Check if actions list contains the requested action

        const hasPermission = user.policies.some(policy => {
            const typeMatch = policy.resourceType === context.resourceType;
            const idMatch = policy.resourceId === null || policy.resourceId === context.resourceId;
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
