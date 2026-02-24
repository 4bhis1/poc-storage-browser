/**
 * GET /api/agent/sync
 *
 * PRIVATE endpoint for the local Electron desktop agent.
 * Returns:
 *   - tenants, accounts (with ACTUAL encrypted credentials, not redacted)
 *   - buckets with all their file objects (key, size, isFolder, etc.)
 *     so the agent can diff vs local filesystem and download missing files.
 *
 * Security: JWT required. ADMIN roles only.
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/token';
import { Role } from '@/lib/generated/prisma/client';

export async function GET(request: NextRequest) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = await verifyToken(token);
        // @ts-ignore
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // @ts-ignore
        const user = await prisma.user.findUnique({ where: { email: payload.email as string } });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        if (user.role !== Role.PLATFORM_ADMIN && user.role !== Role.TENANT_ADMIN) {
            return NextResponse.json({ error: 'Forbidden: agent sync requires ADMIN role' }, { status: 403 });
        }

        // Scope by tenant
        const whereClause: any = user.role === Role.PLATFORM_ADMIN
            ? {}
            : { tenantId: user.tenantId as string };

        const tenantWhere: any = user.role === Role.PLATFORM_ADMIN
            ? {}
            : { id: user.tenantId as string };

        const [accounts, tenants] = await Promise.all([
            prisma.account.findMany({
                where: whereClause,
                include: { tenant: true },
                orderBy: { createdAt: 'asc' },
            }),
            prisma.tenant.findMany({ where: tenantWhere }),
        ]);

        // For each account, fetch its buckets + ALL file objects in those buckets
        const accountsWithData = await Promise.all(accounts.map(async (acc) => {
            const buckets = await prisma.bucket.findMany({
                where: { accountId: acc.id },
                select: {
                    id: true,
                    name: true,
                    region: true,
                    accountId: true,
                    updatedAt: true,
                    createdAt: true,
                }
            });

            // For each bucket, fetch all file objects (flat list with key for path reconstruction)
            const bucketsWithFiles = await Promise.all(buckets.map(async (bucket) => {
                const files = await prisma.fileObject.findMany({
                    where: { bucketId: bucket.id },
                    select: {
                        id: true,
                        name: true,
                        key: true,         // S3 key — used to build local path and generate presigned URL
                        isFolder: true,
                        size: true,
                        mimeType: true,
                        updatedAt: true,
                        createdAt: true,
                        parentId: true,
                    },
                    orderBy: { key: 'asc' }, // Sorted so folders come before their children
                });

                return { ...bucket, files };
            }));

            return {
                id: acc.id,
                name: acc.name,
                tenantId: acc.tenantId,
                isActive: acc.isActive,
                updatedAt: acc.updatedAt,
                createdAt: acc.createdAt,
                // ACTUAL encrypted credentials (not redacted) — agent decrypts with shared ENCRYPTION_KEY
                awsAccessKeyId: acc.awsAccessKeyId,
                awsSecretAccessKey: acc.awsSecretAccessKey,
                buckets: bucketsWithFiles,
            };
        }));

        return NextResponse.json({ tenants, accounts: accountsWithData });

    } catch (error) {
        console.error('[AgentSync] Error:', error);
        return NextResponse.json({ error: 'Agent sync failed' }, { status: 500 });
    }
}
