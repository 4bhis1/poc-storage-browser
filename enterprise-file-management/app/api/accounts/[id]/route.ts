import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/token';
import { Role } from '@/lib/generated/prisma/client';

// ─── PATCH /api/accounts/[id] ──────────────────────────────────────────────
// Update account details (name, isActive)
export async function PATCH(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = await verifyToken(token);
        // @ts-ignore
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // @ts-ignore
        const user = await prisma.user.findUnique({ where: { id: payload.id as string } });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        if (user.role !== Role.PLATFORM_ADMIN && user.role !== Role.TENANT_ADMIN) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const body = await request.json();
        const { name, isActive } = body;

        // Ensure the account belongs to the user's tenant (unless platform admin)
        const whereClause: any = { id: params.id };
        if (user.role !== Role.PLATFORM_ADMIN) {
            whereClause.tenantId = user.tenantId;
        }

        const account = await prisma.account.findFirst({ where: whereClause });
        if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

        const updatedAccount = await prisma.account.update({
            where: { id: account.id },
            data: {
                name: name !== undefined ? name : undefined,
                isActive: isActive !== undefined ? isActive : undefined,
            },
        });

        return NextResponse.json(updatedAccount);
    } catch (error) {
        console.error('Failed to update account:', error);
        return NextResponse.json({ error: 'Failed to update account' }, { status: 500 });
    }
}

// ─── DELETE /api/accounts/[id] ─────────────────────────────────────────────
// Delete an account (only if no buckets exist)
export async function DELETE(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = await verifyToken(token);
        // @ts-ignore
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // @ts-ignore
        const user = await prisma.user.findUnique({ where: { id: payload.id as string } });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        if (user.role !== Role.PLATFORM_ADMIN && user.role !== Role.TENANT_ADMIN) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Ensure the account belongs to the user's tenant (unless platform admin)
        const whereClause: any = { id: params.id };
        if (user.role !== Role.PLATFORM_ADMIN) {
            whereClause.tenantId = user.tenantId;
        }

        const account = await prisma.account.findFirst({
            where: whereClause,
            include: { _count: { select: { buckets: true } } },
        });

        if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 });

        if (account._count.buckets > 0) {
            return NextResponse.json(
                { error: 'Cannot delete account with existing buckets. Please delete the buckets first.' },
                { status: 400 }
            );
        }

        await prisma.account.delete({ where: { id: account.id } });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Failed to delete account:', error);
        return NextResponse.json({ error: 'Failed to delete account' }, { status: 500 });
    }
}
