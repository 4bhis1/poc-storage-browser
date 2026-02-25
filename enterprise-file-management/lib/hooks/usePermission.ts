
import { useAuth } from '@/components/providers/AuthProvider';

interface ResourceContext {
    tenantId?: string;
    resourceType: 'bucket' | 'folder' | 'object' | 'account' | 'tenant' | 'user' | 'team' | 'policy';
    resourceId?: string;
}

export type Action = 'READ' | 'WRITE' | 'DELETE' | 'LIST' | 'CREATE';

export function usePermission() {
    const { user } = useAuth();

    const can = (action: Action, context: ResourceContext): boolean => {
        if (!user) return false;

        // 1. Platform Admin
        if (user.role === 'PLATFORM_ADMIN') return true;

        // 2. Tenant Isolation
        if (context.tenantId && user.tenantId !== context.tenantId) return false;

        // 3. Tenant Admin
        if (user.role === 'TENANT_ADMIN') return true;

        // 4. Teammate Policy Check
        // We need user policies. If they are not loaded in the user object (Context), we can't check efficiently.
        // Assuming policies are part of the user object or we fetch them.
        // For this POC, let's assume we load them or have a way to check.
        // If not in user object, we default to false or need to fetch.

        // If policies are missing, we can't verify.
        if (!user.policies) return false;

        return user.policies.some((policy: any) => {
            const typeMatch = policy.resourceType === context.resourceType;
            const idMatch = policy.resourceId === null || policy.resourceId === context.resourceId;
            const actionMatch = policy.actions.includes(action);
            return typeMatch && idMatch && actionMatch;
        });
    };

    return { can };
}
