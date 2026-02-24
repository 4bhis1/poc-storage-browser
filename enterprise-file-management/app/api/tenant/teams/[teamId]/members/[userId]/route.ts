import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

export async function DELETE(request: NextRequest, { params }: { params: { teamId: string, userId: string } }) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'TENANT_ADMIN' || !user.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // Must verify team belongs to tenant to prevent deleting from another tenant's team
        const team = await prisma.team.findFirst({
            where: { id: params.teamId, tenantId: user.tenantId }
        });

        if (!team) {
            return NextResponse.json({ error: 'Team not found' }, { status: 404 });
        }

        await prisma.teamMembership.delete({
            where: {
                userId_teamId: {
                    userId: params.userId,
                    teamId: params.teamId
                }
            }
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        if (error.code === 'P2025') {
            return NextResponse.json({ error: 'Member not found in team' }, { status: 404 });
        }
        console.error("Remove member error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
