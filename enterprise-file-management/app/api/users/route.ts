
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { checkPermission } from '@/lib/rbac';
import { verifyToken } from '@/lib/token';
import { hashPassword } from '@/lib/auth';
import { Role } from '@/lib/generated/prisma/client';

export async function GET(request: NextRequest) {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await verifyToken(token);
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const user = await prisma.user.findUnique({
        where: { id: payload.id as string },
        include: { policies: true }
    });

    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    // Check if user is allowed to list users (Tenant Admin or Platform Admin)
    // We can define a simplified resource context for "Tenant" management
    const canManageUsers =
        user.role === Role.PLATFORM_ADMIN ||
        user.role === Role.TENANT_ADMIN;

    if (!canManageUsers) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const where: any = {};
    if (user.role === Role.TENANT_ADMIN) {
        where.tenantId = user.tenantId;
    }

    const users = await prisma.user.findMany({
        where,
        select: {
            id: true,
            email: true,
            name: true,
            role: true,
            tenantId: true,
            createdAt: true
        }
    });

    return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const payload = await verifyToken(token);
    // @ts-ignore
    if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // @ts-ignore
    const requester = await prisma.user.findUnique({ where: { id: payload.id as string }, include: { policies: true } });
    if (!requester) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const data = await request.json();

    // Authorization Check
    if (requester.role === Role.PLATFORM_ADMIN) {
        // Can create any user
    } else if (requester.role === Role.TENANT_ADMIN) {
        // Can only create users in their tenant
        if (data.tenantId && data.tenantId !== requester.tenantId) {
            return NextResponse.json({ error: 'Cannot create user for another tenant' }, { status: 403 });
        }
        data.tenantId = requester.tenantId; // Force tenant ID
    } else {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (!data.email || !data.password) {
        return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const hashedPassword = await hashPassword(data.password);

    try {
        const newUser = await prisma.user.create({
            data: {
                email: data.email,
                password: hashedPassword,
                name: data.name,
                role: data.role || Role.TEAMMATE,
                tenantId: data.tenantId,
            },
            select: {
                id: true,
                email: true,
                name: true,
                role: true,
                tenantId: true,
                createdAt: true
            }
        });
        return NextResponse.json(newUser, { status: 201 });
    } catch (e) {
        return NextResponse.json({ error: 'User already exists or invalid data' }, { status: 400 });
    }
}
