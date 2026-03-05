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
import { jwtVerify } from 'jose';
import { Role } from '@/lib/generated/prisma/client';

const BOT_JWT_SECRET = new TextEncoder().encode(
  process.env.BOT_JWT_SECRET || process.env.ENCRYPTION_KEY || 'bot-secret-change-me',
);

export async function GET(request: NextRequest) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Try bot token (HS256) first
        let userEmail: string | null = null;
        let botPermissions: string[] | null = null;
        try {
            const { payload } = await jwtVerify(token, BOT_JWT_SECRET);
            if (payload.type === 'bot') {
                userEmail = payload.email as string;
                botPermissions = payload.permissions as string[];
            }
        } catch {}

        // Fall back to Cognito token
        if (!userEmail) {
            const payload = await verifyToken(token);
            if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            userEmail = payload.email as string;
        }

        if (!userEmail) return NextResponse.json({ error: 'Invalid token payload: missing email' }, { status: 401 });

        const user = await prisma.user.findUnique({ where: { email: userEmail as string } });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        // Bots bypass role check — their access is scoped by bucket permissions in the token
        if (!botPermissions && user.role !== Role.PLATFORM_ADMIN && user.role !== Role.TENANT_ADMIN) {
            return NextResponse.json({ error: 'Forbidden: agent sync requires ADMIN role' }, { status: 403 });
        }

        // Parse allowed bucket IDs from bot permissions: "BUCKET:id:PERM"
        const allowedBucketIds = botPermissions
            ? Array.from(new Set(
                botPermissions
                    .filter(p => p.startsWith('BUCKET:'))
                    .map(p => p.split(':')[1])
              ))
            : null; // null = no restriction (admin user)

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
                where: {
                    accountId: acc.id,
                    ...(allowedBucketIds ? { id: { in: allowedBucketIds } } : {}),
                },
                select: {
                    id: true, name: true, region: true,
                    accountId: true, updatedAt: true, createdAt: true,
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

                return {
                    ...bucket,
                    files: files.map(f => ({
                        ...f,
                        size: f.size !== null ? Number(f.size) : null
                    }))
                };
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
