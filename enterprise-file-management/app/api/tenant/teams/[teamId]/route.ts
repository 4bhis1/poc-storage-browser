import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

export async function GET(request: NextRequest, { params }: { params: { teamId: string } }) {
    try {
        const user = await getCurrentUser();
        if (!user || !user.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const team = await prisma.team.findFirst({
            where: { 
                id: params.teamId,
                tenantId: user.tenantId 
            },
            include: {
                members: {
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
                },
                policies: true
            }
        });

        if (!team) {
            return NextResponse.json({ error: 'Team not found' }, { status: 404 });
        }

        return NextResponse.json(team);
    } catch (error) {
        console.error("Fetch team error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function DELETE(request: NextRequest, { params }: { params: { teamId: string } }) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'TENANT_ADMIN' || !user.tenantId) {
            return NextResponse.json({ error: 'Unauthorized or insufficient permissions' }, { status: 401 });
        }

        await prisma.resourcePolicy.deleteMany({
            where: { teamId: params.teamId }
        });

        await prisma.teamMembership.deleteMany({
            where: { teamId: params.teamId }
        });

        await prisma.team.delete({
            where: {
                id: params.teamId,
                tenantId: user.tenantId
            }
        });

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error("Delete team error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
