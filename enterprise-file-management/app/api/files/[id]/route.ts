
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/token';
import { S3Client, DeleteObjectCommand, CopyObjectCommand, ListObjectsV2Command, ListObjectsV2CommandOutput } from '@aws-sdk/client-s3';

import { decrypt } from '@/lib/encryption';
import { checkPermission } from '@/lib/rbac';

export async function DELETE(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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

        const { id } = await params;

        const file = await prisma.fileObject.findUnique({
            where: { id },
            include: { bucket: { include: { account: true } } }
        });

        if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

        // Check Permission
        const hasAccess = await checkPermission(user, 'WRITE', {
            tenantId: file.bucket.account.tenantId,
            resourceType: 'bucket',
            resourceId: file.bucket.id
        });

        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        const account = file.bucket.account;
        if (!account.awsAccessKeyId || !account.awsSecretAccessKey) {
            return NextResponse.json({ error: 'AWS credentials missing' }, { status: 422 });
        }

        const s3 = new S3Client({
            region: file.bucket.region,
            credentials: {
                accessKeyId: decrypt(account.awsAccessKeyId!),
                secretAccessKey: decrypt(account.awsSecretAccessKey!),
            },
        });

        // Use a recursive function to delete S3 objects
        const deleteS3Objects = async (prefix: string) => {
            let continuationToken: string | undefined = undefined;
            do {
                const listCommand = new ListObjectsV2Command({
                    Bucket: file.bucket.name,
                    Prefix: prefix,
                    ContinuationToken: continuationToken
                });
                const listRes = await s3.send(listCommand);

                if (listRes.Contents && listRes.Contents.length > 0) {
                    // Delete objects one by one or in batch (simple loop for now)
                    for (const obj of listRes.Contents) {
                        if (obj.Key) {
                            await s3.send(new DeleteObjectCommand({
                                Bucket: file.bucket.name,
                                Key: obj.Key
                            }));
                        }
                    }
                }
                continuationToken = listRes.NextContinuationToken;
            } while (continuationToken);
        };


        if (file.isFolder) {
            // For folder, we need to delete everything with the prefix
            // Ensure prefix ends with /
            const prefix = file.key.endsWith('/') ? file.key : `${file.key}/`;
            await deleteS3Objects(prefix);
        } else {
            // Single file
            await s3.send(new DeleteObjectCommand({
                Bucket: file.bucket.name,
                Key: file.key
            }));
        }

        // Delete from DB (Cascade should handle children if configured, but let's be safe)
        // If we rely on cascade in Prisma schema for self-relation:
        await prisma.fileObject.delete({
            where: { id }
        });

        return NextResponse.json({ success: true });

    } catch (error) {
        console.error('Delete error:', error);
        return NextResponse.json({ error: 'Failed to delete file' }, { status: 500 });
    }
}

export async function PATCH(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
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

        const { id } = await params;
        const body = await request.json();
        const { name } = body; // New name

        if (!name) return NextResponse.json({ error: 'Name is required' }, { status: 400 });

        const file = await prisma.fileObject.findUnique({
            where: { id },
            include: { bucket: { include: { account: true } } }
        });

        if (!file) return NextResponse.json({ error: 'File not found' }, { status: 404 });

        // Check Permission
        const hasAccess = await checkPermission(user, 'WRITE', {
            tenantId: file.bucket.account.tenantId,
            resourceType: 'bucket',
            resourceId: file.bucket.id
        });

        if (!hasAccess) {
            return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }

        // Simple Rename for Files ONLY for now (MVP)
        if (file.isFolder) {
            return NextResponse.json({ error: 'Folder rename not supported yet' }, { status: 501 });
        }

        const account = file.bucket.account;
        const s3 = new S3Client({
            region: file.bucket.region,
            credentials: {
                accessKeyId: decrypt(account.awsAccessKeyId!),
                secretAccessKey: decrypt(account.awsSecretAccessKey!),
            },
        });

        // Construct new Key
        // Get parent path from old key
        const parts = file.key.split('/');
        parts.pop(); // Remove old name
        const newKey = parts.length > 0 ? `${parts.join('/')}/${name}` : name;

        // 1. Copy Object
        await s3.send(new CopyObjectCommand({
            Bucket: file.bucket.name,
            CopySource: `${file.bucket.name}/${file.key}`, // Source must include bucket
            Key: newKey
        }));

        // 2. Delete Old Object
        await s3.send(new DeleteObjectCommand({
            Bucket: file.bucket.name,
            Key: file.key
        }));

        // 3. Update DB
        const updatedFile = await prisma.fileObject.update({
            where: { id },
            data: {
                name: name,
                key: newKey
            }
        });

        return NextResponse.json(updatedFile);

    } catch (error) {
        console.error('Rename error:', error);
        return NextResponse.json({ error: 'Failed to rename file' }, { status: 500 });
    }
}
