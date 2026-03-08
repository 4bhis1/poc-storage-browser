import { cookies } from "next/headers";
import { verifyToken } from "@/lib/token";
import prisma from "@/lib/prisma";

export async function getCurrentUser() {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload || (!payload.email && !payload.email_address)) return null;

  const email = ((payload.email as string) || "").toLowerCase();

  try {
    let user = await prisma.user.findUnique({
      where: { email },
      include: {
        tenant: true,
        policies: true,
        teams: { include: { team: { include: { policies: true } } } },
      },
    });

    if (!user && email) {
      user = await prisma.user.upsert({
        where: { email },
        update: {},
        create: {
          email,
          role:
            email.toLowerCase() === "admin@fms.com"
              ? "PLATFORM_ADMIN"
              : "TEAMMATE",
        },
        include: {
          tenant: true,
          policies: true,
          teams: { include: { team: { include: { policies: true } } } },
        },
      });
    }

    if (user) {
      // Only sync tenantId from Cognito token (for initial tenant assignment).
      // IMPORTANT: We do NOT sync role from the token because:
      //   - The DB role is the source of truth (updated via admin actions)
      //   - The Cognito token may be stale (issued before a role change)
      //   - Syncing would overwrite an admin's DB role change on next refresh
      const cognitoTenantId = payload["custom:tenantId"] as string | undefined;

      // Verify tenantId exists locally before trying to set it (FK constraint)
      let validTenantId: string | undefined = undefined;
      if (cognitoTenantId && user.tenantId !== cognitoTenantId) {
        const tenantExists = await prisma.tenant.findUnique({
          where: { id: cognitoTenantId },
        });
        if (tenantExists) validTenantId = cognitoTenantId;
      }

      if (validTenantId !== undefined) {
        user = await prisma.user.update({
          where: { email },
          data: { tenantId: validTenantId },
          include: {
            tenant: true,
            policies: true,
            teams: { include: { team: { include: { policies: true } } } },
          },
        });
      }
    }

    return user;
  } catch (error) {
    console.error("Session DB Error", error);
    throw error;
  }
}
