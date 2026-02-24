
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/token';
import { Role } from '@/lib/generated/prisma/client';

export async function GET(request: NextRequest) {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get('userId');

    if (!targetUserId) return NextResponse.json({ error: 'Missing userId' }, { status: 400 });

    // Authz: Only Tenant Admin (of same tenant) or Platform Admin
    // @ts-ignore
    const requester = await prisma.user.findUnique({ where: { email: payload.email as string } });
    if (!requester) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const targetUser = await prisma.user.findUnique({ where: { id: targetUserId } });
    if (!targetUser) return NextResponse.json({ error: 'Target user not found' }, { status: 404 });

    if (requester.role === Role.PLATFORM_ADMIN) {
        // Allow
    } else if (requester.role === Role.TENANT_ADMIN) {
        if (requester.tenantId !== targetUser.tenantId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
    } else {
        // Teammates can't view policies of others (unless maybe their own? For now restrict)
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const policies = await prisma.resourcePolicy.findMany({
        where: { userId: targetUserId }
    });

    return NextResponse.json(policies);
}

export async function POST(request: NextRequest) {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // @ts-ignore
    const requester = await prisma.user.findUnique({ where: { email: payload.email as string } });

    const data = await request.json();
    const { userId, resourceType, resourceId, actions } = data;

    if (!requester) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Validate Target User
    const targetUser = await prisma.user.findUnique({ where: { id: userId } });
    if (!targetUser) return NextResponse.json({ error: 'Target user not found' }, { status: 404 });

    // Authorization
    if (requester.role === Role.PLATFORM_ADMIN) {
        // Allow
    } else if (requester.role === Role.TENANT_ADMIN) {
        if (requester.tenantId !== targetUser.tenantId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
    } else {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const policy = await prisma.resourcePolicy.create({
        data: {
            userId,
            resourceType, // 'bucket', 'folder'
            resourceId: resourceId || null,
            actions // ['READ', 'WRITE']
        }
    });

    return NextResponse.json(policy, { status: 201 });
}

export async function DELETE(request: NextRequest) {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const policyId = searchParams.get('id');

    if (!policyId) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

    const policy = await prisma.resourcePolicy.findUnique({ where: { id: policyId }, include: { user: true } });
    if (!policy) return NextResponse.json({ error: 'Policy not found' }, { status: 404 });

    // @ts-ignore
    const requester = await prisma.user.findUnique({ where: { email: payload.email as string } });

    if (requester?.role === Role.PLATFORM_ADMIN) {
        // Allow
    } else if (requester?.role === Role.TENANT_ADMIN) {
        if (policy.user && requester.tenantId !== policy.user.tenantId) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
    } else {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await prisma.resourcePolicy.delete({ where: { id: policyId } });

    return NextResponse.json({ success: true });
}
