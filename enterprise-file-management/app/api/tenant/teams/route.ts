import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || !user.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const teams = await prisma.team.findMany({
            where: { tenantId: user.tenantId },
            include: {
                _count: {
                    select: { members: true }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return NextResponse.json(teams);
    } catch (error) {
        console.error("Fetch teams error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}

export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'TENANT_ADMIN' || !user.tenantId) {
            return NextResponse.json({ error: 'Unauthorized or insufficient permissions' }, { status: 401 });
        }

        const { name } = await request.json();

        if (!name?.trim()) {
            return NextResponse.json({ error: 'Team name is required' }, { status: 400 });
        }

        const team = await prisma.team.create({
            data: {
                name: name.trim(),
                tenantId: user.tenantId,
            },
            include: {
                _count: {
                    select: { members: true }
                }
            }
        });

        return NextResponse.json(team);
    } catch (error) {
        console.error("Create team error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
