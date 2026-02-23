import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { decrypt } from "@/lib/encryption";
import { verifyToken } from "@/lib/token";

export async function GET(request: NextRequest) {
    // ... (keep existing GET implementation)
    try {
        const searchParams = request.nextUrl.searchParams;
        const bucketId = searchParams.get('bucketId');
        const parentId = searchParams.get('parentId');
        const syncAll = searchParams.get('syncAll') === 'true';

        const where: any = {};
        if (bucketId) where.bucketId = bucketId;
        if (parentId) {
            where.parentId = parentId;
        } else if (bucketId && !syncAll) {
            where.parentId = null;
        }

        const files = await prisma.fileObject.findMany({
            where,
            orderBy: { isFolder: 'desc' },
            include: {
                children: true
            }
        });

        const fileItems = files.map(f => ({
            id: f.id,
            name: f.name,
            type: f.isFolder ? 'folder' : (f.mimeType?.includes('image') ? 'image' : f.mimeType?.includes('pdf') ? 'pdf' : 'document'),
            size: f.size || 0,
            modifiedAt: f.updatedAt.toISOString(),
            owner: 'Admin',
            shared: false,
            starred: false,
            children: f.children.map(c => ({ id: c.id })),
            // Fields needed for SyncEngine in Electron
            key: f.key,
            isFolder: f.isFolder,
            mimeType: f.mimeType,
            bucketId: f.bucketId,
            parentId: f.parentId,
            createdAt: f.createdAt,
            updatedAt: f.updatedAt
        }));

        return NextResponse.json(fileItems);
    } catch (error) {
        console.error('Failed to fetch files:', error);
        return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 });
    }

    const files = await prisma.fileObject.findMany({
      where,
      orderBy: { isFolder: "desc" },
      include: {
        children: true,
      },
    });

    const fileItems = files.map((f) => ({
      id: f.id,
      name: f.name,
      type: f.isFolder
        ? "folder"
        : f.mimeType?.includes("image")
          ? "image"
          : f.mimeType?.includes("pdf")
            ? "pdf"
            : "document",
      size: f.size || 0,
      modifiedAt: f.updatedAt.toISOString(),
      owner: "Admin",
      shared: false,
      starred: false,
      children: f.children.map((c) => ({ id: c.id })),
    }));

    return NextResponse.json(fileItems);
  } catch (error) {
    console.error("Failed to fetch files:", error);
    return NextResponse.json(
      { error: "Failed to fetch files" },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await verifyToken(token);
    if (!payload || typeof payload !== "object" || !("id" in payload)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const userId = payload.id;

    const body = await request.json();
    const { name, isFolder, parentId, bucketId, size, mimeType } = body;

    if (!name || !bucketId) {
      return NextResponse.json(
        { error: "Name and bucketId are required" },
        { status: 400 },
      );
    }

    // 1. Fetch Bucket and Account to get credentials
    const bucket = await prisma.bucket.findUnique({
      where: { id: bucketId },
      include: { account: true },
    });

    if (!bucket || !bucket.account) {
      return NextResponse.json(
        { error: "Bucket or associated account not found" },
        { status: 404 },
      );
    }

    const account = bucket.account;
    if (!account.awsAccessKeyId || !account.awsSecretAccessKey) {
      return NextResponse.json(
        { error: "AWS credentials missing for this account" },
        { status: 422 },
      );
    }

    // 2. Determine the full Key (path)
    let key = name;
    if (parentId) {
      const parent = await prisma.fileObject.findUnique({
        where: { id: parentId },
      });
      if (parent) {
        // Assuming parent.key is the clean path like "folder1" or "folder1/subfolder"
        // We append the new name.
        // Note: Standard S3 keys don't usually start with /, but let's mimic parent's style
        // If parent.key is empty or just name, we append.
        key = `${parent.key}/${name}`;
      }
    }

    // 3. If it's a folder, create it in S3
    if (isFolder) {
      try {
        const s3 = new S3Client({
          region: bucket.region,
          credentials: {
            accessKeyId: decrypt(account.awsAccessKeyId!),
            secretAccessKey: decrypt(account.awsSecretAccessKey!),
          },
        });

        // S3 folders are typically represented by a zero-byte object with a trailing slash
        const s3Key = key.endsWith("/") ? key : `${key}/`;

        await s3.send(
          new PutObjectCommand({
            Bucket: bucket.name,
            Key: s3Key,
            Body: "", // Empty body for folder
          }),
        );
      } catch (s3Error: any) {
        console.error("Failed to create folder in S3:", s3Error);
        return NextResponse.json(
          { error: `S3 Sync Failed: ${s3Error.message}` },
          { status: 502 },
        );
      }
    }

    // 4. Update or Create Record in DB (Upsert behavior without unique constraint)
    const existingFile = await prisma.fileObject.findFirst({
      where: {
        bucketId: bucketId,
        key: key,
        isFolder: isFolder || false,
      },
    });

    let file;
    if (existingFile) {
      file = await prisma.fileObject.update({
        where: { id: existingFile.id },
        data: {
          size: size || 0,
          mimeType: mimeType || "application/octet-stream",
          updatedAt: new Date(),
          updatedBy: userId,
        },
      });
    } else {
      file = await prisma.fileObject.create({
        data: {
          name,
          bucketId,
          tenantId: bucket.tenantId,
          parentId: parentId || null,
          isFolder: isFolder || false,
          size: size || 0,
          mimeType: mimeType || "application/octet-stream",
          key: key,
          createdBy: userId,
          updatedBy: userId,
        },
      });
    }

    return NextResponse.json(file);
  } catch (error) {
    console.error("Failed to create file:", error);
    return NextResponse.json(
      { error: "Failed to create file" },
      { status: 500 },
    );
  }
}
