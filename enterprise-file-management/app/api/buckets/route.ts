import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/token';
import { Role } from '@/lib/generated/prisma/client';

// ─── GET /api/buckets ──────────────────────────────────────────────────────
// Returns buckets from DB only (no AWS API call).
// Filtered by role: PLATFORM_ADMIN sees all, TENANT_ADMIN sees own tenant,
// TEAMMATE sees only buckets they have policy access to.
export async function GET(request: NextRequest) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = await verifyToken(token);
        // @ts-ignore
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // @ts-ignore
        const user = await prisma.user.findUnique({
            where: { id: payload.id as string },
            include: { policies: true },
        });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        // Parse query params
        const { searchParams } = new URL(request.url);
        const page = parseInt(searchParams.get('page') || '1');
        const limit = parseInt(searchParams.get('limit') || '10');
        const search = searchParams.get('search') || '';
        const filterAccountId = searchParams.get('accountId') || '';
        const skip = (page - 1) * limit;

        let whereClause: any = {};

        // Base RBAC filters
        if (user.role === Role.PLATFORM_ADMIN) {
            // See everything
        } else if (user.role === Role.TENANT_ADMIN) {
            whereClause = { account: { tenantId: user.tenantId } };
        } else {
            // TEAMMATE — check resource policies
            const hasGlobalAccess = user.policies.some(
                (p: any) =>
                    p.resourceType === 'bucket' &&
                    p.resourceId === null &&
                    (p.actions.includes('READ') || p.actions.includes('LIST'))
            );

            if (hasGlobalAccess) {
                whereClause = { account: { tenantId: user.tenantId } };
            } else {
                const allowedBucketIds = user.policies
                    .filter(
                        (p: any) =>
                            p.resourceType === 'bucket' &&
                            p.resourceId !== null &&
                            (p.actions.includes('READ') || p.actions.includes('LIST'))
                    )
                    .map((p: any) => p.resourceId);

                if (allowedBucketIds.length === 0) return NextResponse.json({
                    data: [],
                    metadata: { total: 0, page, limit, totalPages: 0 }
                });

                whereClause = {
                    id: { in: allowedBucketIds },
                    account: { tenantId: user.tenantId },
                };
            }
        }

        // Apply user filters
        if (search) {
            whereClause.name = { contains: search, mode: 'insensitive' };
        }

        if (filterAccountId) {
            whereClause.accountId = filterAccountId;
        }

        // Get total count for pagination
        const total = await prisma.bucket.count({ where: whereClause });

        // Get paginated data
        const buckets = await prisma.bucket.findMany({
            where: whereClause,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: skip,
            include: { _count: { select: { objects: true } } },
        });

        const bucketsWithStats = await Promise.all(
            buckets.map(async (bucket) => {
                const stats = await prisma.fileObject.aggregate({
                    where: { bucketId: bucket.id },
                    _sum: { size: true },
                });
                return {
                    id: bucket.id,
                    name: bucket.name,
                    region: bucket.region,
                    accountId: bucket.accountId,
                    storageClass: 'STANDARD', // Still hardcoded as per plan
                    versioning: bucket.versioning,
                    encryption: bucket.encryption,
                    totalSize: stats._sum.size || 0,
                    maxSize: Number(bucket.quotaBytes),
                    fileCount: bucket._count.objects,
                    tags: bucket.tags,
                    createdAt: bucket.createdAt.toISOString(),
                };
            })
        );

        return NextResponse.json({
            data: bucketsWithStats,
            metadata: {
                total,
                page,
                limit,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error('Failed to fetch buckets:', error);
        return NextResponse.json({ error: 'Failed to fetch buckets' }, { status: 500 });
    }
}

// ─── POST /api/buckets ─────────────────────────────────────────────────────
// Creates a bucket on AWS S3 under the user-selected account, then saves
// the record to the DB. If S3 creation fails the DB row is rolled back.
//
// Required body: { name: string, region: string, accountId: string, encryption?: boolean }
export async function POST(request: NextRequest) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = await verifyToken(token);
        // @ts-ignore
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // @ts-ignore
        const user = await prisma.user.findUnique({ where: { id: payload.id as string } });
        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        // Only admins can create buckets
        if (user.role !== Role.PLATFORM_ADMIN && user.role !== Role.TENANT_ADMIN) {
            return NextResponse.json({ error: 'Forbidden: only admins can create buckets' }, { status: 403 });
        }

        const body = await request.json();
        const { name, region, accountId, encryption } = body;

        // Validate required fields
        if (!name || !region || !accountId) {
            return NextResponse.json(
                { error: 'name, region, and accountId are all required' },
                { status: 400 }
            );
        }

        // Look up the chosen account — must belong to the user's tenant (security check)
        const account = await prisma.account.findFirst({
            where: {
                id: accountId,
                tenantId: user.tenantId as string,
            },
        });

        if (!account) {
            return NextResponse.json(
                { error: 'The selected AWS account was not found or does not belong to your tenant' },
                { status: 404 }
            );
        }

        if (!account.awsAccessKeyId || !account.awsSecretAccessKey) {
            return NextResponse.json(
                { error: `AWS credentials are not configured for account "${account.name}". Please add them in Settings.` },
                { status: 422 }
            );
        }

        // Check for existing bucket in DB to prevent duplicates
        const existingBucket = await prisma.bucket.findFirst({
            where: { name }
        });

        if (existingBucket) {
            return NextResponse.json(
                { error: `Bucket "${name}" is already tracked in your system. Please use a different name.` },
                { status: 409 }
            );
        }

        // ── Step 1: Save record to DB ──────────────────────────────────────
        const bucket = await prisma.bucket.create({
            data: {
                name,
                region,
                accountId: account.id,
                encryption: !!encryption,
                versioning: false, // default
                tags: ['created-via-ui']
            },
        });

        // ── Step 2: Create the real S3 bucket ─────────────────────────────
        try {
            const { decrypt } = await import('@/lib/encryption');
            const { S3Client, CreateBucketCommand, PutBucketEncryptionCommand, DeleteBucketCommand, PutBucketCorsCommand } = await import('@aws-sdk/client-s3');

            const s3 = new S3Client({
                region,
                credentials: {
                    accessKeyId: decrypt(account.awsAccessKeyId),
                    secretAccessKey: decrypt(account.awsSecretAccessKey),
                },
            });

            // AWS does NOT allow a LocationConstraint for us-east-1 (it's the default)
            const input: any = { Bucket: name };
            if (region !== 'us-east-1') {
                input.CreateBucketConfiguration = { LocationConstraint: region };
            }

            await s3.send(new CreateBucketCommand(input));

            try {
                // Apply encryption if requested
                if (encryption) {
                    await s3.send(new PutBucketEncryptionCommand({
                        Bucket: name,
                        ServerSideEncryptionConfiguration: {
                            Rules: [
                                {
                                    ApplyServerSideEncryptionByDefault: {
                                        SSEAlgorithm: 'AES256'
                                    }
                                }
                            ]
                        }
                    }));
                }

                // Apply CORS configuration
                const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
                if (allowedOrigins.length > 0) {
                    await s3.send(new PutBucketCorsCommand({
                        Bucket: name,
                        CORSConfiguration: {
                            CORSRules: [
                                {
                                    AllowedHeaders: ["*"],
                                    AllowedMethods: ["PUT", "POST", "GET", "HEAD"],
                                    AllowedOrigins: allowedOrigins,
                                    ExposeHeaders: ["ETag"],
                                    MaxAgeSeconds: 3000
                                }
                            ]
                        }
                    }));
                }
            } catch (configError) {
                console.error('Failed to configure bucket, rolling back S3 creation:', configError);
                // Attempt to delete the bucket we just created
                try {
                    await s3.send(new DeleteBucketCommand({ Bucket: name }));
                } catch (cleanupError) {
                    console.error('Failed to cleanup S3 bucket after configuration error:', cleanupError);
                }
                throw configError; // Re-throw to trigger DB rollback below
            }
        } catch (s3Error: any) {
            // Roll back the DB row so we don't have a phantom bucket record
            await prisma.bucket.delete({ where: { id: bucket.id } });

            console.error('S3 CreateBucket failed:', s3Error);

            if (s3Error.name === 'BucketAlreadyExists') {
                return NextResponse.json(
                    { error: `The bucket name "${name}" is globally unique and already taken by another AWS user. Please choose a different name.` },
                    { status: 409 }
                );
            }
            if (s3Error.name === 'BucketAlreadyOwnedByYou') {
                return NextResponse.json(
                    { error: `You already own the bucket "${name}" in another region or account.` },
                    { status: 409 }
                );
            }

            return NextResponse.json(
                { error: `AWS S3 error: ${s3Error?.message || 'Unknown error'}` },
                { status: 500 }
            );
        }

        return NextResponse.json({
            ...bucket,
            quotaBytes: bucket.quotaBytes.toString()
        }, { status: 201 });
    } catch (error) {
        console.error('Failed to create bucket:', error);
        return NextResponse.json({ error: 'Failed to create bucket' }, { status: 500 });
    }
}
