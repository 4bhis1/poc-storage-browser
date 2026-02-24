import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';

export async function PUT(request: NextRequest, { params }: { params: { teamId: string } }) {
    try {
        const user = await getCurrentUser();
        if (!user || user.role !== 'TENANT_ADMIN' || !user.tenantId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const team = await prisma.team.findFirst({
            where: { id: params.teamId, tenantId: user.tenantId }
        });

        if (!team) {
            return NextResponse.json({ error: 'Team not found' }, { status: 404 });
        }

        // Expected body: { policies: { bucketId: ['READ', 'WRITE', ...], ... } }
        const { policies } = await request.json();
        if (!policies || typeof policies !== 'object') {
            return NextResponse.json({ error: 'Invalid policies format' }, { status: 400 });
        }

        // Use a transaction to replace bucket policies for this team
        await prisma.$transaction(async (tx) => {
            // 1. Delete all existing bucket policies for this team
            await tx.resourcePolicy.deleteMany({
                where: {
                    teamId: params.teamId,
                    resourceType: 'Bucket'
                }
            });

            // 2. Create the new policies
            const policiesToCreate = Object.entries(policies).map(([bucketId, actions]) => ({
                teamId: params.teamId,
                resourceType: 'Bucket',
                resourceId: bucketId,
                actions: Array.isArray(actions) ? actions : []
            })).filter(p => p.actions.length > 0);

            if (policiesToCreate.length > 0) {
                await tx.resourcePolicy.createMany({
                    data: policiesToCreate
                });
            }
        });

        // Return updated policies
        const updatedPolicies = await prisma.resourcePolicy.findMany({
            where: { teamId: params.teamId }
        });

        return NextResponse.json({ success: true, policies: updatedPolicies });
    } catch (error) {
        console.error("Update policies error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
