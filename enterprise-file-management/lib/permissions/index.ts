import { Role } from '../generated/prisma/client';

export type Action = 'CREATE_BUCKET' | 'READ' | 'UPLOAD' | 'DOWNLOAD' | 'SHARE' | 'DELETE';

export interface UserContext {
    id: string;
    role: Role;
    tenantId: string | null;
    policies?: PolicyContext[];
    teams?: { teamId: string, team: { policies: PolicyContext[] } }[];
}

export interface PolicyContext {
    actions: string[];
    resourceType: string;
    resourceId: string | null;
}

export interface ResourceContext {
    tenantId?: string;
    resourceType: string;
    resourceId?: string;
}

export function evaluatePermission(user: UserContext, action: Action, resource: ResourceContext): boolean {
    // 1. Platform Admin has God-mode across everything
    if (user.role === 'PLATFORM_ADMIN') {
        return true;
    }

    // 2. Tenant Isolation
    if (resource.tenantId && user.tenantId !== resource.tenantId) {
        return false;
    }

    // 3. Tenant Admin has God-mode within their tenant
    if (user.role === 'TENANT_ADMIN') {
        return true;
    }

    // 4. Team Admin might have special permissions (e.g. user management)
    // If the action is specific to managing their team, handled elsewhere or via specific policies.

    // 5. Evaluate Direct User Policies
    if (user.policies && user.policies.length > 0) {
        const hasDirectPerm = user.policies.some(policy => 
            policy.resourceType === resource.resourceType &&
            (policy.resourceId === null || policy.resourceId === resource.resourceId) &&
            policy.actions.includes(action)
        );
        if (hasDirectPerm) return true;
    }

    // 6. Evaluate Team Policies
    if (user.teams && user.teams.length > 0) {
        for (const membership of user.teams) {
            const hasTeamPerm = membership.team.policies.some(policy => 
                policy.resourceType === resource.resourceType &&
                (policy.resourceId === null || policy.resourceId === resource.resourceId) &&
                policy.actions.includes(action)
            );
            if (hasTeamPerm) return true;
        }
    }

    return false;
}
