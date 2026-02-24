import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { inviteUserToCognito } from '@/lib/auth-service';
import { getCurrentUser } from '@/lib/session';

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== 'PLATFORM_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const tenants = await prisma.tenant.findMany({
    orderBy: { createdAt: 'desc' }
  });

  return NextResponse.json(tenants);
}

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || user.role !== 'PLATFORM_ADMIN') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { name, adminEmail } = await req.json();

    if (!name || !adminEmail) {
      return NextResponse.json({ error: 'Name and email are required' }, { status: 400 });
    }

    // 1. Create the tenant in DB
    const tenant = await prisma.tenant.create({
      data: { name },
    });

    // 2. Invite Admin to Cognito (sends magic link/temp password)
    const cognitoUser = await inviteUserToCognito(adminEmail, tenant.id, 'TENANT_ADMIN');
    
    // 3. Save admin user in database (Assuming SUB or email mapping)
    const newAdmin = await prisma.user.create({
      data: {
        email: adminEmail,
        tenantId: tenant.id,
        role: 'TENANT_ADMIN',
        // Optional: map cognitoSub if `cognitoUser` provides it.
        // cognitoSub: cognitoUser?.Username,
      }
    });

    return NextResponse.json({ tenant, newAdmin });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
