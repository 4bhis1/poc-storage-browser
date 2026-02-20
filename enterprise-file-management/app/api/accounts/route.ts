
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/token';
import { Role } from '@/lib/generated/prisma/client';
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";

// ─── GET /api/accounts ─────────────────────────────────────────────────────
// Returns only accounts that belong to the logged-in user's tenant.
// PLATFORM_ADMIN can see accounts across all tenants.
export async function GET(request: NextRequest) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = await verifyToken(token);
        // @ts-ignore
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // @ts-ignore
        const user = await prisma.user.findUnique({ where: { id: payload.id as string } });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        // PLATFORM_ADMIN sees all; everyone else is scoped to their own tenant
        const { searchParams } = new URL(request.url);
        const isActiveParam = searchParams.get('isActive');

        const whereClause: any = user.role === Role.PLATFORM_ADMIN
            ? {}
            : { tenantId: user.tenantId as string };

        if (isActiveParam === 'true') {
            whereClause.isActive = true;
        } else if (isActiveParam === 'false') {
            whereClause.isActive = false;
        }

        const accounts = await prisma.account.findMany({
            where: whereClause,
            include: {
                tenant: true,
                _count: { select: { buckets: true } },
            },
            orderBy: { createdAt: 'asc' },
        });

        // Never expose raw secret keys to the client
        const safeAccounts = accounts.map(acc => ({
            ...acc,
            awsAccessKeyId: acc.awsAccessKeyId ? '****' + acc.awsAccessKeyId.slice(-4) : null,
            awsSecretAccessKey: acc.awsSecretAccessKey ? '********' : null,
        }));

        return NextResponse.json(safeAccounts);
    } catch (error) {
        console.error('Failed to fetch accounts:', error);
        return NextResponse.json({ error: 'Failed to fetch accounts' }, { status: 500 });
    }
}

// Create new account with AWS credentials
export async function POST(request: NextRequest) {
    console.log("Bytes received for account creation");
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
        const { name, awsAccessKeyId, awsSecretAccessKey } = body;

        console.log(`Attempting to add account: ${name}`);

        if (!name || !awsAccessKeyId || !awsSecretAccessKey) {
            console.error("Missing required fields");
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        // Reject temporary STS credentials (ASIA prefix) — they expire and require a session token
        if (awsAccessKeyId.startsWith('ASIA')) {
            return NextResponse.json({
                error: 'Temporary STS credentials (starting with ASIA) are not supported. Please use permanent IAM user credentials (starting with AKIA).'
            }, { status: 400 });
        }

        // Validate credentials via STS before storing (STS is global; us-east-1 works everywhere)
        try {
            console.log("Validating credentials with STS...");
            const sts = new STSClient({
                region: 'us-east-1',
                credentials: {
                    accessKeyId: awsAccessKeyId,
                    secretAccessKey: awsSecretAccessKey,
                }
            });
            await sts.send(new GetCallerIdentityCommand({}));
            console.log("STS validation successful");
        } catch (stsError) {
            console.error("AWS Validation Failed:", stsError);
            return NextResponse.json({ error: 'Invalid AWS credentials. Please check your Access Key ID and Secret.' }, { status: 401 });
        }

        // Encrypt credentials at rest before storing
        console.log("Encrypting credentials...");
        try {
            const { encrypt } = await import('@/lib/encryption');
            const encryptedAccessKeyId = encrypt(awsAccessKeyId);
            const encryptedSecretAccessKey = encrypt(awsSecretAccessKey);
            console.log("Encryption successful");

            // Resolve target tenant
            const { tenantId } = body;
            const targetTenantId = tenantId || user.tenantId;
            if (!targetTenantId) {
                return NextResponse.json({ error: 'Could not determine tenant' }, { status: 400 });
            }

            console.log("Creating account in DB...");
            const account = await prisma.account.create({
                data: {
                    name,
                    awsAccessKeyId: encryptedAccessKeyId,
                    awsSecretAccessKey: encryptedSecretAccessKey,
                    tenantId: targetTenantId,
                }
            });
            console.log("Account created successfully");

            return NextResponse.json({ ...account, awsSecretAccessKey: '********' });
        } catch (innerError) {
            console.error("Error during encryption or DB creation:", innerError);
            throw innerError;
        }
    } catch (error) {
        console.error('Failed to create account (Outer catch):', error);
        return NextResponse.json({ error: 'Failed to create account' }, { status: 500 });
    }
}
