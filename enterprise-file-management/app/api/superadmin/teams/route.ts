import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

export async function GET() {
    const user = await getCurrentUser();
    if (!user || user.role !== 'PLATFORM_ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const teams = await prisma.team.findMany({
        include: { members: { include: { user: true } }, policies: true }
    });
    return NextResponse.json(teams);
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'PLATFORM_ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    try {
        const { name, tenantId, memberIds, permissions } = await request.json();

        // Foreign Key restriction requires a Tenant (mocking default if missing via Prisma)
        let resolvedTenantId = tenantId;
        if (!resolvedTenantId) {
            const firstTenant = await prisma.tenant.findFirst();
            if (firstTenant) {
                resolvedTenantId = firstTenant.id;
            } else {
                const nw = await prisma.tenant.create({ data: { name: 'Default Root Tenant' } });
                resolvedTenantId = nw.id;
            }
        }

        const team = await prisma.team.create({
            data: {
                name,
                tenantId: resolvedTenantId,
                members: {
                    create: memberIds.map((userId: string) => ({ userId }))
                },
                policies: {
                    create: {
                        resourceType: 'GLOBAL_SYSTEM', // Reusable generic
                        actions: permissions // string array e.g ['DOWNLOAD', 'CREATE_BUCKET']
                    }
                }
            },
            include: { members: true, policies: true }
        });

        return NextResponse.json(team);
    } catch(err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
