import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/token';
import { decrypt } from '@/lib/encryption';
import {
    S3Client,
    GetBucketVersioningCommand,
    GetBucketEncryptionCommand,
    GetBucketTaggingCommand
} from '@aws-sdk/client-s3';

export async function POST(
    request: NextRequest,
    { params }: { params: { id: string } }
) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = await verifyToken(token);
        // @ts-ignore
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const bucketId = params.id;

        // Fetch bucket with account details
        const bucket = await prisma.bucket.findUnique({
            where: { id: bucketId },
            include: { account: true }
        });

        if (!bucket) return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });
        if (!bucket.account.awsAccessKeyId || !bucket.account.awsSecretAccessKey) {
            return NextResponse.json({ error: 'AWS credentials not found' }, { status: 400 });
        }

        // Initialize S3 Client
        const s3 = new S3Client({
            region: bucket.region,
            credentials: {
                accessKeyId: decrypt(bucket.account.awsAccessKeyId),
                secretAccessKey: decrypt(bucket.account.awsSecretAccessKey),
            },
        });

        // Fetch details in parallel
        // We accept that some might fail (e.g. no tags, no encryption)
        const [versioningRes, encryptionRes, taggingRes] = await Promise.allSettled([
            s3.send(new GetBucketVersioningCommand({ Bucket: bucket.name })),
            s3.send(new GetBucketEncryptionCommand({ Bucket: bucket.name })),
            s3.send(new GetBucketTaggingCommand({ Bucket: bucket.name }))
        ]);

        let versioning = false;
        let encryption = false;
        let tags: string[] = [];

        // Process Versioning
        if (versioningRes.status === 'fulfilled' && versioningRes.value.Status === 'Enabled') {
            versioning = true;
        }

        // Process Encryption
        if (encryptionRes.status === 'fulfilled' &&
            encryptionRes.value.ServerSideEncryptionConfiguration?.Rules?.some(
                r => r.ApplyServerSideEncryptionByDefault?.SSEAlgorithm
            )
        ) {
            encryption = true;
        }

        // Process Tags
        if (taggingRes.status === 'fulfilled' && taggingRes.value.TagSet) {
            tags = taggingRes.value.TagSet.map(t => `${t.Key}:${t.Value}`);
        }

        // Update DB
        const updatedBucket = await prisma.bucket.update({
            where: { id: bucketId },
            data: {
                versioning,
                encryption,
                tags
            }
        });

        return NextResponse.json(updatedBucket);

    } catch (error: any) {
        console.error('Failed to sync bucket:', error);
        return NextResponse.json({ error: error.message || 'Failed to sync bucket' }, { status: 500 });
    }
}
