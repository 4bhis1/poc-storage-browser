import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

export async function POST(request: NextRequest, { params }: { params: { teamId: string } }) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'TENANT_ADMIN' || !user.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { userId } = await request.json();
        if (!userId) {
            return NextResponse.json({ error: 'User ID is required' }, { status: 400 });
        }

        // Verify the user being added belongs to the same tenant
        const userToAdd = await prisma.user.findFirst({
            where: { id: userId, tenantId: user.tenantId }
        });

        if (!userToAdd) {
            return NextResponse.json({ error: 'User not found or not in your tenant' }, { status: 404 });
        }

        const membership = await prisma.teamMembership.create({
            data: {
                teamId: params.teamId,
                userId: userId
            },
            include: {
                user: {
                    select: {
                        id: true,
                        email: true,
                        name: true,
                        role: true
                    }
                }
            }
        });

        return NextResponse.json(membership);
    } catch (error: any) {
        if (error.code === 'P2002') {
            return NextResponse.json({ error: 'User is already in this team' }, { status: 400 });
        }
        console.error("Add member error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
