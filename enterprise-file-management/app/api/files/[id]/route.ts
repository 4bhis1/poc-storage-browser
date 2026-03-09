import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/token";
import {
  S3Client,
  DeleteObjectCommand,
  CopyObjectCommand,
  ListObjectsV2Command,
  ListObjectsV2CommandOutput,
} from "@aws-sdk/client-s3";

import { decrypt } from "@/lib/encryption";
import { checkPermission } from "@/lib/rbac";
import { getS3Client } from "@/lib/s3";
import { logAudit } from "@/lib/audit";
import { extractIpFromRequest, validateUserIpAccess } from "@/lib/ip-whitelist";
import { verifyBotToken, assertBotBucketAccess } from "@/lib/bot-auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ── Bot JWT auth (HS256) ───────────────────────────────────────────────
    const botAuth = await verifyBotToken(token);

    let user: any = null;
    if (botAuth) {
      user = await prisma.user.findUnique({
        where: { email: botAuth.email },
        include: {
          policies: true,
          teams: { where: { isDeleted: false }, include: { team: { include: { policies: true } } } },
        },
      });
    } else {
      const payload = await verifyToken(token);
      if (!payload || typeof payload !== "object" || !payload.email)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      user = await prisma.user.findUnique({
        where: { email: payload.email as string },
        include: {
          policies: true,
          teams: { where: { isDeleted: false }, include: { team: { include: { policies: true } } } },
        },
      });
    }

    if (!user)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    const clientIp = extractIpFromRequest(request);
    if (!validateUserIpAccess(clientIp, user)) {
      logAudit({
        userId: user.id,
        action: "IP_ACCESS_DENIED",
        resource: "FileObject",
        status: "FAILED",
        ipAddress: clientIp,
        details: { reason: "IP not whitelisted for team", method: request.method, path: request.nextUrl.pathname },
      });
      return NextResponse.json(
        { error: "Forbidden: IP not whitelisted for your team" },
        { status: 403 },
      );
    }

    const { id } = await params;

    const file = await prisma.fileObject.findUnique({
      where: { id },
      include: { bucket: { include: { awsAccount: true, tenant: true } } },
    });

    if (!file)
      return NextResponse.json({ error: "File not found" }, { status: 404 });

    // ── Bot: validate bucket access ───────────────────────────────────────
    if (botAuth) {
      if (!assertBotBucketAccess(botAuth, file.bucketId, "DELETE") &&
          !assertBotBucketAccess(botAuth, file.bucketId, "WRITE")) {
        return NextResponse.json(
          { error: "Forbidden: bot lacks DELETE access to this bucket" },
          { status: 403 },
        );
      }
    } else {
      const hasAccess = await checkPermission(user, "WRITE", {
        tenantId: file.bucket.tenantId,
        resourceType: "bucket",
        resourceId: file.bucket.id,
      });
      if (!hasAccess)
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const awsAccount = file.bucket.awsAccount;

    const s3 = await getS3Client(null, file.bucket.region, awsAccount);

    // Use a recursive function to delete S3 objects
    const deleteS3Objects = async (prefix: string) => {
      let continuationToken: string | undefined = undefined;
      do {
        const listCommand: any = new ListObjectsV2Command({
          Bucket: file.bucket.name,
          Prefix: prefix,
          ContinuationToken: continuationToken,
        });
        const listRes: any = await s3.send(listCommand);

        if (listRes.Contents && listRes.Contents.length > 0) {
          // Delete objects one by one or in batch (simple loop for now)
          for (const obj of listRes.Contents) {
            if (obj.Key) {
              await s3.send(
                new DeleteObjectCommand({
                  Bucket: file.bucket.name,
                  Key: obj.Key,
                }),
              );
            }
          }
        }
        continuationToken = listRes.NextContinuationToken;
      } while (continuationToken);
    };

    if (file.isFolder) {
      // For folder, we need to delete everything with the prefix
      // Ensure prefix ends with /
      const prefix = file.key.endsWith("/") ? file.key : `${file.key}/`;
      await deleteS3Objects(prefix);
    } else {
      // Single file
      await s3.send(
        new DeleteObjectCommand({
          Bucket: file.bucket.name,
          Key: file.key,
        }),
      );
    }

    // DB record deletion is now handled asynchronously by the file-sync Lambda
    // via S3 ObjectRemoved event → SQS → Lambda pipeline.
    logAudit({
      userId: user.id,
      action: "FILE_DELETE",
      resource: "FileObject",
      resourceId: file.id,
      status: "SUCCESS",
      ipAddress: extractIpFromRequest(request),
      details: {
        bucketId: file.bucket.id,
        bucketName: file.bucket.name,
        key: file.key,
      },
    });

    return NextResponse.json({ success: true, status: "accepted" }, { status: 202 });
  } catch (error) {
    console.error("Delete error:", error);
    return NextResponse.json(
      { error: "Failed to delete file" },
      { status: 500 },
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    // ── Bot JWT auth (HS256) ───────────────────────────────────────────────
    const botAuth = await verifyBotToken(token);

    let user: any = null;
    if (botAuth) {
      user = await prisma.user.findUnique({
        where: { email: botAuth.email },
        include: {
          policies: true,
          teams: { where: { isDeleted: false }, include: { team: { include: { policies: true } } } },
        },
      });
    } else {
      const payload = await verifyToken(token);
      if (!payload || typeof payload !== "object" || !payload.email)
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

      user = await prisma.user.findUnique({
        where: { email: payload.email as string },
        include: {
          policies: true,
          teams: { where: { isDeleted: false }, include: { team: { include: { policies: true } } } },
        },
      });
    }

    if (!user)
      return NextResponse.json({ error: "User not found" }, { status: 404 });

    const clientIp = extractIpFromRequest(request);
    if (!validateUserIpAccess(clientIp, user)) {
      logAudit({
        userId: user.id,
        action: "IP_ACCESS_DENIED",
        resource: "FileObject",
        status: "FAILED",
        ipAddress: clientIp,
        details: { reason: "IP not whitelisted for team", method: request.method, path: request.nextUrl.pathname },
      });
      return NextResponse.json(
        { error: "Forbidden: IP not whitelisted for your team" },
        { status: 403 },
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { name } = body;

    if (!name)
      return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const file = await prisma.fileObject.findUnique({
      where: { id },
      include: { bucket: { include: { awsAccount: true, tenant: true } } },
    });

    if (!file)
      return NextResponse.json({ error: "File not found" }, { status: 404 });

    // ── Bot: validate bucket access ───────────────────────────────────────
    if (botAuth) {
      if (!assertBotBucketAccess(botAuth, file.bucketId, "WRITE")) {
        return NextResponse.json(
          { error: "Forbidden: bot lacks WRITE access to this bucket" },
          { status: 403 },
        );
      }
    } else {
      const hasAccess = await checkPermission(user, "WRITE", {
        tenantId: file.bucket.tenantId,
        resourceType: "bucket",
        resourceId: file.bucket.id,
      });
      if (!hasAccess)
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    // Simple Rename for Files ONLY for now (MVP)
    if (file.isFolder) {
      return NextResponse.json(
        { error: "Folder rename not supported yet" },
        { status: 501 },
      );
    }

    const awsAccount = file.bucket.awsAccount;
    const s3 = await getS3Client(null, file.bucket.region, awsAccount);

    // Construct new Key
    // Get parent path from old key
    const parts = file.key.split("/");
    parts.pop(); // Remove old name
    const newKey = parts.length > 0 ? `${parts.join("/")}/${name}` : name;

    // 1. Copy Object
    await s3.send(
      new CopyObjectCommand({
        Bucket: file.bucket.name,
        CopySource: `${file.bucket.name}/${file.key}`, // Source must include bucket
        Key: newKey,
      }),
    );

    // 2. Delete Old Object
    await s3.send(
      new DeleteObjectCommand({
        Bucket: file.bucket.name,
        Key: file.key,
      }),
    );

    // 3. Update DB
    const updatedFile = await prisma.fileObject.update({
      where: { id },
      data: {
        name: name,
        key: newKey,
      },
    });

    return NextResponse.json({
      ...updatedFile,
      size: Number(updatedFile.size) || 0,
    });
  } catch (error) {
    console.error("Rename error:", error);
    return NextResponse.json(
      { error: "Failed to rename file" },
      { status: 500 },
    );
  }
}
