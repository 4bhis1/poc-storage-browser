import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { inviteUserToCognito } from "@/lib/auth-service";
import { getCurrentUser } from "@/lib/session";
import { getHubTenantId } from "@/lib/hub-tenant";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== "PLATFORM_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }
  const users = await prisma.user.findMany({
    where: {
      tenant: {
        isHubTenant: false,
      },
    },
    orderBy: { createdAt: "desc" },
  });

  const grouped = users.reduce((acc: Record<string, any>, curr) => {
    const email = curr.email.toLowerCase();
    if (!acc[email]) {
      acc[email] = {
        id: curr.id,
        email: curr.email,
        name: curr.name,
        roles: [curr.role],
        tenantsCount: 1,
        isActive: curr.isActive,
        createdAt: curr.createdAt,
      };
    } else {
      // Aggregate name if missing
      if (!acc[email].name && curr.name) acc[email].name = curr.name;
      // Aggregate roles
      if (!acc[email].roles.includes(curr.role))
        acc[email].roles.push(curr.role);
      // Increment tenants
      acc[email].tenantsCount += 1;
      // isActive if any assigned tenant is active
      if (curr.isActive) acc[email].isActive = true;
      // Earliest registration as joined date
      if (new Date(curr.createdAt) < new Date(acc[email].createdAt)) {
        acc[email].createdAt = curr.createdAt;
      }
    }
    return acc;
  }, {});

  return NextResponse.json(Object.values(grouped));
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== "PLATFORM_ADMIN") {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  try {
    const { email, role, name, tenantId } = await request.json();

    const finalTenantId = tenantId || (await getHubTenantId());

    // Invite to Cognito explicitly
    await inviteUserToCognito(email, finalTenantId, role || "TEAMMATE", name);

    // Log in Postgres
    const newUser = await prisma.user.create({
      data: {
        email,
        name,
        role: role || "TEAMMATE",
        tenantId: finalTenantId,
      },
    });

    return NextResponse.json(newUser);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
