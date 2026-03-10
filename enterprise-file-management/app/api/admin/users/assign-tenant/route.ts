import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { Role } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";
import { logAudit } from "@/lib/audit";

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (user.role !== Role.PLATFORM_ADMIN)
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const body = await request.json();
  const { email, tenantId, role } = body as {
    email: string;
    tenantId: string;
    role?: Role;
  };

  if (!email || !tenantId)
    return NextResponse.json(
      { error: "email and tenantId are required" },
      { status: 400 },
    );

  if (role === Role.PLATFORM_ADMIN || role === Role.TEAM_ADMIN) {
    return NextResponse.json(
      { error: "Cannot assign restricted roles" },
      { status: 400 },
    );
  }

  // Validate tenant exists
  const tenant = await prisma.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant)
    return NextResponse.json(
      { error: "Tenant does not exist" },
      { status: 400 },
    );

  // Fetch existing name from other assignments to maintain consistency
  const existingUser = await prisma.user.findFirst({
    where: { email: email.toLowerCase() },
    select: { name: true },
  });

  try {
    const created = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        name: existingUser?.name, // Propagate existing name
        tenantId,
        role: role ?? Role.TEAMMATE,
      },
    });

    logAudit({
      userId: user.id,
      action: "USER_ASSIGNED_TENANT",
      resource: "TenantAccess",
      resourceId: created.id,
      details: {
        targetEmail: email.toLowerCase(),
        tenantId,
        role: created.role,
      },
      status: "SUCCESS",
      ipAddress: request.headers.get("x-forwarded-for") || "127.0.0.1",
    });

    return NextResponse.json(created, { status: 201 });
  } catch (err) {
    logAudit({
      userId: user.id,
      action: "USER_ASSIGNED_TENANT",
      resource: "TenantAccess",
      details: {
        targetEmail: email.toLowerCase(),
        tenantId,
        error: err instanceof Error ? err.message : String(err),
      },
      status: "FAILED",
      ipAddress: request.headers.get("x-forwarded-for") || "127.0.0.1",
    });

    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2002")
        return NextResponse.json(
          { error: "User is already assigned to this tenant" },
          { status: 409 },
        );
      if (err.code === "P2003")
        return NextResponse.json(
          { error: "Tenant does not exist" },
          { status: 400 },
        );
    }
    console.error("assign-tenant error", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 },
    );
  }
}
