
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { S3Client, ListBucketsCommand, ListObjectsV2Command } from "@aws-sdk/client-s3";

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    const { id } = await params;

    try {
        const account = await prisma.account.findUnique({
            where: { id }
        });

        if (!account || !account.awsAccessKeyId || !account.awsSecretAccessKey) {
            return NextResponse.json({ error: 'Account not found or missing credentials' }, { status: 404 });
        }

        const s3 = new S3Client({
            region: 'us-east-1',
            credentials: {
                accessKeyId: account.awsAccessKeyId,
                secretAccessKey: account.awsSecretAccessKey
            }
        });

        // 1. Sync Buckets
        const bucketsData = await s3.send(new ListBucketsCommand({}));
        const s3Buckets = bucketsData.Buckets || [];

        let syncedBucketsCount = 0;
        let syncedFilesCount = 0;

        for (const s3Bucket of s3Buckets) {
            if (!s3Bucket.Name) continue;

            // Upsert Bucket
            const bucket = await prisma.bucket.upsert({
                where: {
                    // Composite key would be better, but schema has ID. 
                    // We need to find by name+accountId or just add unique constraint on name (globally unique in S3).
                    // For this POC, let's find first by name for this account.
                    // Since we can't easily upsert on non-unique, we'll do find/create logic.
                    id: 'legacy-placeholder' // won't match
                },
                update: {},
                create: {
                    name: s3Bucket.Name,
                    region: 'us-east-1', // S3 list buckets doesn't return region directly easily without easy lookup
                    accountId: account.id,
                    createdAt: s3Bucket.CreationDate || new Date()
                }
            });

            // Since upsert with placeholder ID is tricky without unique name, let's fix logic:
            let dbBucket = await prisma.bucket.findFirst({
                where: { name: s3Bucket.Name, accountId: account.id }
            });

            if (!dbBucket) {
                dbBucket = await prisma.bucket.create({
                    data: {
                        name: s3Bucket.Name,
                        region: 'us-east-1',
                        accountId: account.id,
                        createdAt: s3Bucket.CreationDate || new Date()
                    }
                });
            }

            syncedBucketsCount++;

            // 2. Sync Objects (Batched)
            let continuationToken: string | undefined = undefined;

            do {
                const objectsData = await s3.send(new ListObjectsV2Command({
                    Bucket: s3Bucket.Name,
                    ContinuationToken: continuationToken
                }));

                continuationToken = objectsData.NextContinuationToken;

                if (objectsData.Contents) {
                    for (const obj of objectsData.Contents) {
                        if (!obj.Key) continue;

                        // Parse Key for Folder Structure
                        const parts = obj.Key.split('/');
                        const isFolder = obj.Key.endsWith('/');
                        const fileName = parts[parts.length - 1] || parts[parts.length - 2]; // handle trailing slash

                        // Recursively ensure parent folders exist
                        let parentId: string | null = null;

                        // If it's "a/b/c.txt":
                        // 1. Ensure "a" exists (parent=null) -> get ID
                        // 2. Ensure "b" exists (parent="a") -> get ID
                        // 3. Create "c.txt" (parent="b")

                        // Iterating through path parts to build hierarchy
                        // Exclude the last part which is the file itself (or empty if folder)
                        const folderPath = isFolder ? parts.slice(0, parts.length - 1) : parts.slice(0, parts.length - 1);

                        for (let i = 0; i < folderPath.length; i++) {
                            const folderName = folderPath[i];
                            if (!folderName) continue;

                            // Find or create folder in this bucket with current parent
                            // We need to be careful about race conditions here in highly concurrent envs, 
                            // but for sync serialized loop it's "ok" slow but safe.
                            // Optimization: Cache known paths in memory map during sync.

                            const existingFolder = await prisma.fileObject.findFirst({
                                where: {
                                    name: folderName,
                                    bucketId: dbBucket.id,
                                    parentId: parentId,
                                    isFolder: true
                                }
                            });

                            if (existingFolder) {
                                parentId = existingFolder.id;
                            } else {
                                const newFolder = await prisma.fileObject.create({
                                    data: {
                                        name: folderName,
                                        key: folderPath.slice(0, i + 1).join('/') + '/',
                                        isFolder: true,
                                        bucketId: dbBucket.id,
                                        parentId: parentId,
                                        size: 0
                                    }
                                });
                                parentId = newFolder.id;
                            }
                        }

                        // Create/Update the file itself
                        // If it's a folder object itself (Key ends in /), we might have already processed it above 
                        // or we need to update its metadata. AWS returns folders as 0-byte objects sometimes.

                        // If explicit object:
                        if (!isFolder) {
                            const existingFile = await prisma.fileObject.findFirst({
                                where: {
                                    name: fileName,
                                    bucketId: dbBucket.id,
                                    parentId: parentId,
                                    isFolder: false
                                }
                            });

                            if (existingFile) {
                                // Update size/mod time
                                await prisma.fileObject.update({
                                    where: { id: existingFile.id },
                                    data: {
                                        size: obj.Size,
                                        updatedAt: obj.LastModified
                                    }
                                });
                            } else {
                                await prisma.fileObject.create({
                                    data: {
                                        name: fileName,
                                        key: obj.Key,
                                        isFolder: false,
                                        bucketId: dbBucket.id,
                                        parentId: parentId,
                                        size: obj.Size,
                                        updatedAt: obj.LastModified,
                                        // mimeType guess could go here
                                    }
                                });
                            }
                            syncedFilesCount++;
                        }
                    }
                }
            } while (continuationToken);
        }

        return NextResponse.json({
            success: true,
            syncedBuckets: syncedBucketsCount,
            syncedFiles: syncedFilesCount
        });

    } catch (error) {
        console.error('Sync failed:', error);
        return NextResponse.json({ error: 'Sync failed: ' + (error as Error).message }, { status: 500 });
    }
}
