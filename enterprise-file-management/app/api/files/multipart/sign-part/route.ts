
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/token';
import { S3Client, UploadPartCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { decrypt } from '@/lib/encryption';
import { checkPermission } from '@/lib/rbac';

export async function POST(request: NextRequest) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = await verifyToken(token);
        // @ts-ignore
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        // @ts-ignore
        const user = await prisma.user.findUnique({
            where: { id: payload.id as string },
            include: { policies: true }
        });

        if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

        const body = await request.json();
        const { bucketId, key, uploadId, partNumber } = body;

        if (!bucketId || !key || !uploadId || !partNumber) {
            return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
        }

        const bucket = await prisma.bucket.findUnique({
            where: { id: bucketId },
            include: { account: true }
        });

        if (!bucket) return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });

        const hasAccess = await checkPermission(user, 'WRITE', {
            tenantId: bucket.account.tenantId,
            resourceType: 'bucket',
            resourceId: bucket.id
        });

        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const account = bucket.account;
        const s3 = new S3Client({
            region: bucket.region,
            credentials: {
                accessKeyId: decrypt(account.awsAccessKeyId!),
                secretAccessKey: decrypt(account.awsSecretAccessKey!),
            },
        });

        const command = new UploadPartCommand({
            Bucket: bucket.name,
            Key: key,
            UploadId: uploadId,
            PartNumber: partNumber,
        });

        const url = await getSignedUrl(s3, command, { expiresIn: 3600 });
        return NextResponse.json({ url });

    } catch (error) {
        console.error('Sign Part error:', error);
        return NextResponse.json({ error: 'Failed to sign part' }, { status: 500 });
    }
}
