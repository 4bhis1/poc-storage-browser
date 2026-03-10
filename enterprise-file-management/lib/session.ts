import { cookies } from "next/headers";
import { verifyToken } from "@/lib/token";
import prisma from "@/lib/prisma";
import { getHubTenantId } from "@/lib/hub-tenant";

const USER_INCLUDE = {
  tenant: true,
  policies: true,
  teams: { include: { team: { include: { policies: true } } } },
} as const;

export type AuthenticatedUser = NonNullable<
  Awaited<
    ReturnType<typeof prisma.user.findFirst<{ include: typeof USER_INCLUDE }>>
  >
> & {
  activeTenantId?: string;
};

// 2.1: Accept optional activeTenantId parameter
export async function getCurrentUser(
  activeTenantId?: string,
): Promise<AuthenticatedUser | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get("accessToken")?.value;

  if (!token) return null;

  const payload = await verifyToken(token);
  if (!payload || (!payload.email && !payload.email_address)) return null;

  const email = (
    (payload.email as string) ||
    (payload.email_address as string) ||
    ""
  ).toLowerCase();
  if (!email) return null;

  // 2.7: If activeTenantId not provided as param, read from cookie
  const resolvedActiveTenantId =
    activeTenantId ?? cookieStore.get("x-active-tenant-id")?.value;

  try {
    // 2.2: findMany by email instead of findUnique
    const users = await prisma.user.findMany({
      where: { email },
      include: USER_INCLUDE,
    });

    // 2.5: Auto-provision when 0 rows exist
    if (users.length === 0) {
      // Use tenantId from token, or fall back to hub tenant (pending assignment)
      const cognitoTenantId =
        (payload["custom:tenantId"] as string | undefined) ??
        (await getHubTenantId());

      // Verify tenant exists before creating
      const tenantExists = await prisma.tenant.findUnique({
        where: { id: cognitoTenantId },
      });
      if (!tenantExists) return null;

      const newUser = await prisma.user.create({
        data: {
          email,
          tenantId: cognitoTenantId,
          role: "TEAMMATE",
          hasLoggedIn: true,
        },
        include: USER_INCLUDE,
      });

      const user = await syncCognitoSub(newUser, payload, email);
      if (user) {
        user.activeTenantId = resolvedActiveTenantId;
      }
      return user;
    }

    // 2.3: Single-row auto-select
    if (users.length === 1) {
      const user = await syncCognitoSub(users[0], payload, email);
      if (user) {
        user.activeTenantId = resolvedActiveTenantId;
      }
      return user;
    }

    // 2.4: N rows — select by activeTenantId, fallback to first
    const activeUser =
      (resolvedActiveTenantId
        ? users.find((u) => u.tenantId === resolvedActiveTenantId)
        : undefined) ?? users[0];

    const user = await syncCognitoSub(
      activeUser,
      payload as Record<string, unknown>,
      email,
    );
    if (user) {
      user.activeTenantId = resolvedActiveTenantId;
    }
    return user;
  } catch (error) {
    console.error("Session DB Error", error);
    throw error;
  }
}

// 2.6: Sync cognitoSub on the active User row if it differs from the token's sub
async function syncCognitoSub(
  user: AuthenticatedUser,
  payload: Record<string, unknown>,
  email: string,
): Promise<AuthenticatedUser | null> {
  if (!user) return null;

  const tokenSub = payload["sub"] as string | undefined;
  if (tokenSub && user.cognitoSub !== tokenSub) {
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { cognitoSub: tokenSub },
      include: USER_INCLUDE,
    });
    return updated as AuthenticatedUser;
  }

  return user;
}
