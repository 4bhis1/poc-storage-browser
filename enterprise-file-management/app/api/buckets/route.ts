import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { Role } from '@/lib/generated/prisma/client';

// ─── GET /api/buckets ──────────────────────────────────────────────────────
// Returns buckets from DB only (no AWS API call).
// Filtered by role: PLATFORM_ADMIN sees all, TENANT_ADMIN sees own tenant,
// TEAMMATE sees only buckets they have policy access to.
export async function GET(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
// Required body: { name: string, region: string, accountId: string, encryption?: boolean, isImport?: boolean }
export async function POST(request: NextRequest) {
    try {
        const user = await getCurrentUser();
        if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // Only admins can create buckets
        if (user.role !== Role.PLATFORM_ADMIN && user.role !== Role.TENANT_ADMIN) {
            return NextResponse.json({ error: 'Forbidden: only admins can create buckets' }, { status: 403 });
        }

        const body = await request.json();
        const { name, region, encryption, isExisting } = body;

        // Validate required fields
        if (!name || (!region && !isExisting)) {
            return NextResponse.json(
                { error: 'Name and region are required' },
                { status: 400 }
            );
        }

        // Look up an existing account for the user's tenant
        let account = await prisma.account.findFirst({
            where: {
                tenantId: user.tenantId as string,
            },
            include: { tenant: true }
        });

        if (!account) {
            // Create a default system account if one doesn't exist for this tenant
            const tenant = await prisma.tenant.findUnique({ where: { id: user.tenantId as string }});
            if (!tenant) return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });

            account = await prisma.account.create({
                data: {
                    name: 'System Default Account',
                    tenantId: tenant.id
                },
                include: { tenant: true }
            });
        }

        if (!process.env.AWS_PROFILE && (!account.awsAccessKeyId || !account.awsSecretAccessKey)) {
            return NextResponse.json(
                { error: `AWS profile environment variable is not configured, and account "${account.name}" has no credentials. Please configure AWS_PROFILE or add credentials.` },
                { status: 422 }
            );
        }

        const rawTenantName = account.tenant.name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const rawBucketSuffix = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        const finalBucketName = isExisting ? name : `fms-${rawTenantName}-bucket-${rawBucketSuffix}`;

        const existingBucket = await prisma.bucket.findFirst({
            where: { name: finalBucketName },
            include: { account: true }
        });

        if (existingBucket) {
            const isSameTenant = existingBucket.account?.tenantId === user.tenantId;
            return NextResponse.json(
                { error: isSameTenant ? 
                  `Bucket "${finalBucketName}" is already mapped in your tenant. You should see it in your Buckets list.` :
                  `Bucket "${finalBucketName}" is already tracked by another tenant in the system. Please use a different name.` 
                },
                { status: 409 }
            );
        }

        // ── Step 1: Save record to DB ──────────────────────────────────────
        const bucket = await prisma.bucket.create({
            data: {
                name: finalBucketName,
                region,
                accountId: account.id,
                encryption: !!encryption,
                versioning: false, // default
                tags: ['created-via-ui']
            },
        });

        // ── Step 2: Create or verify the S3 bucket ─────────────────────────────
        try {
            const { decrypt } = await import('@/lib/encryption');
            const { S3Client, CreateBucketCommand, PutBucketEncryptionCommand, DeleteBucketCommand, PutBucketCorsCommand, HeadBucketCommand } = await import('@aws-sdk/client-s3');
            
            let s3ClientConfig: any = { region };
            if (account.awsAccessKeyId && account.awsSecretAccessKey) {
                s3ClientConfig.credentials = {
                    accessKeyId: decrypt(account.awsAccessKeyId),
                    secretAccessKey: decrypt(account.awsSecretAccessKey),
                };
            } else if (process.env.AWS_PROFILE) {
                const { fromIni } = await import('@aws-sdk/credential-providers');
                s3ClientConfig.credentials = fromIni({ profile: process.env.AWS_PROFILE });
            }

            const s3 = new S3Client(s3ClientConfig);

            if (isExisting) {
                // Verify the bucket exists and we have access
                await s3.send(new HeadBucketCommand({ Bucket: finalBucketName }));
            } else {
                // AWS does NOT allow a LocationConstraint for us-east-1 (it's the default)
                const input: any = { Bucket: finalBucketName };
                if (region !== 'us-east-1') {
                    input.CreateBucketConfiguration = { LocationConstraint: region };
                }

                await s3.send(new CreateBucketCommand(input));

                try {
                    // Apply encryption if requested
                    if (encryption) {
                            await s3.send(new PutBucketEncryptionCommand({
                                Bucket: finalBucketName,
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
                                Bucket: finalBucketName,
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
                        await s3.send(new DeleteBucketCommand({ Bucket: finalBucketName }));
                    } catch (cleanupError) {
                        console.error('Failed to cleanup S3 bucket after configuration error:', cleanupError);
                    }
                    throw configError; // Re-throw to trigger DB rollback below
                }
            }
        } catch (s3Error: any) {
            // Roll back the DB row so we don't have a phantom bucket record
            await prisma.bucket.delete({ where: { id: bucket.id } });

            console.error('S3 Bucket operation failed:', s3Error);

            if (s3Error.name === 'BucketAlreadyExists') {
                return NextResponse.json(
                    { error: `The bucket name "${finalBucketName}" is globally unique and already taken by another AWS user. Please choose a different name.` },
                    { status: 409 }
                );
            }
            if (s3Error.name === 'BucketAlreadyOwnedByYou') {
                return NextResponse.json(
                    { error: `You already own the bucket "${finalBucketName}" in another region or account.` },
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
