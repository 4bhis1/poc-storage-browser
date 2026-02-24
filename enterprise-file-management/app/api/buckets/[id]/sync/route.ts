import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/token';
import { decrypt } from '@/lib/encryption';
import {
    S3Client,
    GetBucketVersioningCommand,
    GetBucketEncryptionCommand,
    GetBucketTaggingCommand,
    ListObjectsV2Command
} from '@aws-sdk/client-s3';

export async function POST(
    request: NextRequest,
    { params }: { params: Promise<{ id: string }> }
) {
    try {
        const { id: bucketId } = await params;
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = await verifyToken(token);
        // @ts-ignore
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });


        // Fetch bucket with account details
        const bucket = await prisma.bucket.findUnique({
            where: { id: bucketId },
            include: { account: true }
        });

        if (!bucket) return NextResponse.json({ error: 'Bucket not found' }, { status: 404 });
        if (!process.env.AWS_PROFILE && (!bucket.account.awsAccessKeyId || !bucket.account.awsSecretAccessKey)) {
            return NextResponse.json({ error: 'AWS credentials not found and AWS_PROFILE is not configured' }, { status: 400 });
        }

        let s3ClientConfig: any = { region: bucket.region };
        if (bucket.account.awsAccessKeyId && bucket.account.awsSecretAccessKey) {
            s3ClientConfig.credentials = {
                accessKeyId: decrypt(bucket.account.awsAccessKeyId),
                secretAccessKey: decrypt(bucket.account.awsSecretAccessKey),
            };
        } else if (process.env.AWS_PROFILE) {
            const { fromIni } = await import('@aws-sdk/credential-providers');
            s3ClientConfig.credentials = fromIni({ profile: process.env.AWS_PROFILE });
        }

        // Initialize S3 Client
        const s3 = new S3Client(s3ClientConfig);

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

        // Update DB with metadata
        const updatedBucket = await prisma.bucket.update({
            where: { id: bucketId },
            data: {
                versioning,
                encryption,
                tags
            }
        });

        // Sync Bucket Files
        let syncedFilesCount = 0;
        let continuationToken: string | undefined = undefined;

        console.log(`[BucketSync] Starting file sync for bucket ${bucket.name}`);

        do {
            const objectsData: any = await s3.send(new ListObjectsV2Command({
                Bucket: bucket.name,
                ContinuationToken: continuationToken
            }));

            continuationToken = objectsData.NextContinuationToken;

            if (objectsData.Contents) {
                for (const obj of objectsData.Contents) {
                    if (!obj.Key) continue;

                    const parts = obj.Key.split('/');
                    const isFolder = obj.Key.endsWith('/');
                    const fileName = parts[parts.length - 1] || parts[parts.length - 2]; 

                    let parentId: string | null = null;
                    const folderPath = isFolder ? parts.slice(0, parts.length - 1) : parts.slice(0, parts.length - 1);

                    // Ensure folder hierarchy exists
                    for (let i = 0; i < folderPath.length; i++) {
                        const folderName = folderPath[i];
                        if (!folderName) continue;

                        const existingFolder: any = await prisma.fileObject.findFirst({
                            where: {
                                name: folderName,
                                bucketId: bucket.id,
                                parentId: parentId,
                                isFolder: true
                            }
                        });

                        if (existingFolder) {
                            parentId = existingFolder.id;
                        } else {
                            const newFolder: any = await prisma.fileObject.create({
                                data: {
                                    name: folderName,
                                    key: folderPath.slice(0, i + 1).join('/') + '/',
                                    isFolder: true,
                                    bucketId: bucket.id,
                                    parentId: parentId,
                                    size: 0
                                }
                            });
                            parentId = newFolder.id;
                        }
                    }

                    if (!isFolder) {
                        const existingFile = await prisma.fileObject.findFirst({
                            where: {
                                name: fileName,
                                bucketId: bucket.id,
                                parentId: parentId,
                                isFolder: false
                            }
                        });

                        const mimeType = fileName.includes('.') ? fileName.split('.').pop() : 'application/octet-stream';

                        if (existingFile) {
                            await prisma.fileObject.update({
                                where: { id: existingFile.id },
                                data: {
                                    size: obj.Size,
                                    updatedAt: obj.LastModified,
                                    mimeType
                                }
                            });
                        } else {
                            await prisma.fileObject.create({
                                data: {
                                    name: fileName,
                                    key: obj.Key,
                                    isFolder: false,
                                    bucketId: bucket.id,
                                    parentId: parentId,
                                    size: obj.Size,
                                    updatedAt: obj.LastModified,
                                    mimeType
                                }
                            });
                        }
                        syncedFilesCount++;
                    }
                }
            }
        } while (continuationToken);

        console.log(`[BucketSync] Completed sync for ${bucket.name}. Synced ${syncedFilesCount} files.`);

        return NextResponse.json({
            bucket: updatedBucket,
            syncedFiles: syncedFilesCount,
            success: true
        });

    } catch (error: any) {
        console.error('Failed to sync bucket:', error);
        return NextResponse.json({ error: error.message || 'Failed to sync bucket' }, { status: 500 });
    }
}
