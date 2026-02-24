import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { inviteUserToCognito } from '@/lib/auth-service';
import { getCurrentUser } from '@/lib/session';

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user || (user.role !== 'TENANT_ADMIN' && user.role !== 'PLATFORM_ADMIN')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  try {
    const { email, permissions } = await req.json();

    if (!email || !user.tenantId) {
      return NextResponse.json({ error: 'Email and valid tenant map are required' }, { status: 400 });
    }

    // 1. Invite User to Cognito (sends magic link/temp password)
    // Role usually TEAMMATE for typical invites
    const cognitoUser = await inviteUserToCognito(email, user.tenantId, 'TEAMMATE');
    
    // 2. Save user in database (Assuming SUB or email mapping)
    const newTeammate = await prisma.user.create({
      data: {
        email: email,
        tenantId: user.tenantId,
        role: 'TEAMMATE',
      }
    });

    // 3. Assign direct ResourcePolicy for specific permissions
    if (permissions && permissions.length > 0) {
      await prisma.resourcePolicy.create({
        data: {
          userId: newTeammate.id,
          resourceType: 'GLOBAL_TENANT', // Or granular to buckets, etc.
          actions: permissions,
        }
      });
    }

    return NextResponse.json({ teammate: newTeammate });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function GET() {
  const user = await getCurrentUser();
  if (!user || !user.tenantId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  const members = await prisma.user.findMany({
    where: { tenantId: user.tenantId },
    include: { policies: true, teams: true }
  });

  return NextResponse.json(members);
}
