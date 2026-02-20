
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/token';
import { S3Client, CreateMultipartUploadCommand } from '@aws-sdk/client-s3';
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
        const { bucketId, name, type, parentId } = body;

        if (!bucketId || !name) {
            return NextResponse.json({ error: 'Bucket ID and Name are required' }, { status: 400 });
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
        if (!account.awsAccessKeyId || !account.awsSecretAccessKey) {
            return NextResponse.json({ error: 'AWS credentials missing' }, { status: 422 });
        }

        let key = name;
        if (parentId) {
            const parent = await prisma.fileObject.findUnique({ where: { id: parentId } });
            if (parent) {
                const prefix = parent.key.endsWith('/') ? parent.key : `${parent.key}/`;
                key = `${prefix}${name}`;
            }
        }

        const s3 = new S3Client({
            region: bucket.region,
            credentials: {
                accessKeyId: decrypt(account.awsAccessKeyId!),
                secretAccessKey: decrypt(account.awsSecretAccessKey!),
            },
        });

        const command = new CreateMultipartUploadCommand({
            Bucket: bucket.name,
            Key: key,
            ContentType: type || 'application/octet-stream',
        });

        const { UploadId } = await s3.send(command);

        return NextResponse.json({ uploadId: UploadId, key });

    } catch (error) {
        console.error('Initiate Multipart error:', error);
        return NextResponse.json({ error: 'Failed to initiate upload' }, { status: 500 });
    }
}
