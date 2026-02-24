import { cookies } from "next/headers"
import { verifyToken } from "@/lib/token"
import prisma from "@/lib/prisma"

export async function getCurrentUser() {
    const cookieStore = await cookies()
    const token = cookieStore.get("accessToken")?.value

    if (!token) return null

    const payload = await verifyToken(token);
    if (!payload || (!payload.email && !payload.email_address)) return null

    const email = (payload.email as string) || '';

    try {
        let user = await prisma.user.findUnique({
            where: { email },
            include: { tenant: true, policies: true, teams: true },
        })

        if (!user && email) {
            user = await prisma.user.create({
                data: {
                    email,
                    role: email.toLowerCase() === 'admin@fms.com' ? 'PLATFORM_ADMIN' : 'TEAMMATE',
                },
                include: { tenant: true, policies: true, teams: true },
            })
        }

        if (user) {
            // Sync role and tenantId from Cognito token attributes into DB
            const cognitoRole = payload['custom:role'] as string | undefined;
            const cognitoTenantId = payload['custom:tenantId'] as string | undefined;

            const needsUpdate =
                (cognitoRole && user.role !== cognitoRole) ||
                (cognitoTenantId && user.tenantId !== cognitoTenantId);

            if (needsUpdate) {
                user = await prisma.user.update({
                    where: { email },
                    data: {
                        ...(cognitoRole ? { role: cognitoRole as any } : {}),
                        ...(cognitoTenantId ? { tenantId: cognitoTenantId } : {}),
                    },
                    include: { tenant: true, policies: true, teams: true },
                });
            }
        }

        return user
    } catch (error) {
        console.error("Session DB Error", error);
        return null
    }
}

