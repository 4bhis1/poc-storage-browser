import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import { STSClient, AssumeRoleCommand } from "@aws-sdk/client-sts";
import type {
  SQSEvent,
  SQSBatchResponse,
  SQSBatchItemFailure,
} from "aws-lambda";
import { getPrismaClient } from "./prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedS3Event {
  type: "created" | "deleted" | "unknown";
  bucketName: string;
  key: string;
  size: number;
  eTag?: string;
  ipAddress: string | null;
}

interface BucketInfo {
  bucketId: string;
  tenantId: string;
  region: string;
  awsAccount: {
    roleArn: string;
    externalId: string;
  } | null;
}

// ─── Event Parsers ────────────────────────────────────────────────────────────

function parseS3Event(body: string): ParsedS3Event[] {
  const parsed = JSON.parse(body);

  // ── Format 1: EventBridge envelope ──────────────────────────────────────
  if (parsed["detail-type"] && parsed.detail) {
    const detailType: string = parsed["detail-type"];
    const detail = parsed.detail;

    const bucketName: string = detail.bucket?.name ?? "";
    const key: string = decodeURIComponent(
      (detail.object?.key ?? "").replace(/\+/g, " "),
    );
    const size: number = detail.object?.size ?? 0;
    const eTag: string | undefined = detail.object?.etag;

    const ipAddress: string | null = detail["source-ip-address"] ?? null;

    let type: ParsedS3Event["type"] = "unknown";
    if (
      detailType === "Object Created" ||
      detailType === "Object Restore Completed"
    ) {
      type = "created";
    } else if (detailType === "Object Deleted") {
      type = "deleted";
    }

    return [{ type, bucketName, key, size, eTag, ipAddress }];
  }

  // ── Format 2: Direct S3 notification ────────────────────────────────────
  if (Array.isArray(parsed.Records)) {
    return parsed.Records.map((record: any) => {
      const bucketName: string = record.s3?.bucket?.name ?? "";
      const key: string = decodeURIComponent(
        (record.s3?.object?.key ?? "").replace(/\+/g, " "),
      );
      const size: number = record.s3?.object?.size ?? 0;
      const eTag: string | undefined = record.s3?.object?.eTag;
      const eventName: string = record.eventName ?? "";
      const ipAddress: string | null =
        record.requestParameters?.sourceIPAddress ?? null;

      let type: ParsedS3Event["type"] = "unknown";
      if (eventName.startsWith("ObjectCreated")) type = "created";
      else if (eventName.startsWith("ObjectRemoved")) type = "deleted";

      return { type, bucketName, key, size, eTag, ipAddress };
    });
  }

  console.warn("Unrecognized S3 event format:", JSON.stringify(parsed));
  return [];
}

// ─── DB Helpers ───────────────────────────────────────────────────────────────

async function resolveBucket(
  bucketName: string,
  cache: Map<string, BucketInfo>,
): Promise<BucketInfo | null> {
  if (cache.has(bucketName)) return cache.get(bucketName)!;

  const prisma = getPrismaClient();
  const bucket = await prisma.bucket.findFirst({
    where: { name: bucketName },
    select: {
      id: true,
      tenantId: true,
      region: true,
      awsAccount: {
        select: { roleArn: true, externalId: true },
      },
    },
  });

  if (!bucket) {
    console.warn(`No bucket record found for S3 bucket: ${bucketName}`);
    return null;
  }

  const info: BucketInfo = {
    bucketId: bucket.id,
    tenantId: bucket.tenantId,
    region: bucket.region,
    awsAccount: bucket.awsAccount
      ? {
          roleArn: bucket.awsAccount.roleArn,
          externalId: bucket.awsAccount.externalId,
        }
      : null,
  };
  cache.set(bucketName, info);
  return info;
}

// ─── S3 Client helpers ────────────────────────────────────────────────────────

// Default S3 client using Lambda's own role (for same-account buckets)
let defaultS3: S3Client | null = null;
function getDefaultS3(): S3Client {
  if (!defaultS3) defaultS3 = new S3Client({});
  return defaultS3;
}

function decrypt(text: string): string {
  if (!text) return text;
  const [ivHex, encryptedHex, authTagHex] = text.split(":");
  if (!ivHex || !encryptedHex || !authTagHex) return text;

  const { createDecipheriv } = require("crypto");
  const key = Buffer.from(process.env.ENCRYPTION_KEY || "", "hex");
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const decipher = createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encryptedHex, "hex", "utf8");
  decrypted += decipher.final("utf8");
  return decrypted;
}

/**
 * Returns an S3 client scoped to the tenant's account via STS AssumeRole.
 * Falls back to the default Lambda role client if no awsAccount is present (same-account bucket).
 */
async function getS3ForBucket(bucketInfo: BucketInfo): Promise<S3Client> {
  if (!bucketInfo.awsAccount) return getDefaultS3();

  const { roleArn, externalId } = bucketInfo.awsAccount;
  const decryptedExternalId = decrypt(externalId);

  const sts = new STSClient({ region: "us-east-1" });
  const { Credentials } = await sts.send(
    new AssumeRoleCommand({
      RoleArn: roleArn,
      RoleSessionName: "CamsLambdaHeadObject",
      ExternalId: decryptedExternalId,
    }),
  );

  if (!Credentials) throw new Error(`Failed to assume role ${roleArn}`);

  return new S3Client({
    region: bucketInfo.region,
    credentials: {
      accessKeyId: Credentials.AccessKeyId!,
      secretAccessKey: Credentials.SecretAccessKey!,
      sessionToken: Credentials.SessionToken!,
    },
  });
}

// ─── Audit helpers ────────────────────────────────────────────────────────────

const SYSTEM_ACTOR = "system:lambda";

async function fetchUploaderIdentity(
  s3: S3Client,
  bucketName: string,
  key: string,
): Promise<{ userId: string | null; uploaderType: string } | null> {
  try {
    const head = await s3.send(
      new HeadObjectCommand({ Bucket: bucketName, Key: key }),
    );
    const meta = head.Metadata ?? {};
    return {
      userId: meta["uploaded-by-user-id"] ?? null,
      uploaderType: meta["uploaded-by-type"] ?? "unknown",
    };
  } catch (err) {
    console.warn(`[audit] HeadObject failed for ${bucketName}/${key}:`, err);
    return null;
  }
}

async function writeAudit(
  action: string,
  resource: string,
  resourceId: string | undefined,
  details: Record<string, unknown>,
  status: "SUCCESS" | "FAILED",
  userId: string | null = null,
  ipAddress: string | null = null,
): Promise<void> {
  const prisma = getPrismaClient();

  let country: string | null = null;
  let region: string | null = null;

  if (
    ipAddress &&
    !ipAddress.startsWith("127.") &&
    !ipAddress.startsWith("10.") &&
    !ipAddress.startsWith("192.168.")
  ) {
    try {
      // Use ip-api.com for fresh, external geo-resolution
      const response = await fetch(
        `http://ip-api.com/json/${ipAddress}?fields=status,country,regionName`,
      );
      const data = (await response.json()) as any;
      if (data.status === "success") {
        country = data.country;
        region = data.regionName;
      }
    } catch (err) {
      console.warn(`[audit] Geo resolution failed for IP ${ipAddress}:`, err);
    }
  }

  try {
    console.log("Writing audit log:", {
      userId,
      action,
      resource: resourceId ? `${resource}:${resourceId}` : resource,
      details: JSON.stringify({ ...details, actor: userId ?? SYSTEM_ACTOR }),
      status,
      ipAddress,
      country,
      region,
      createdBy: userId,
      updatedBy: userId,
    });
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource: resourceId ? `${resource}:${resourceId}` : resource,
        details: JSON.stringify({ ...details, actor: userId ?? SYSTEM_ACTOR }),
        status,
        ipAddress,
        country,
        region,
        createdBy: userId,
        updatedBy: userId,
      },
    });
  } catch (err: any) {
    console.error("[audit] Failed to write audit log:", err);
    if (err.meta) {
      console.error(
        "[audit] Prisma error meta:",
        JSON.stringify(err.meta, null, 2),
      );
    }
  }
}

async function ensureParentDirectories(
  prisma: any,
  bucketId: string,
  tenantId: string,
  parentKey: string,
  userId: string | null,
): Promise<string | null> {
  if (!parentKey) return null;

  const parts = parentKey.split("/");
  let currentKey = "";
  let currentParentId: string | null = null;

  for (const part of parts) {
    if (!part) continue;
    currentKey = currentKey ? `${currentKey}/${part}` : part;
    const folderKey = `${currentKey}/`;

    const folderKeyNoSlash = currentKey;

    let folder = await prisma.fileObject.findFirst({
      where: {
        bucketId,
        key: { in: [folderKey, folderKeyNoSlash] },
        isFolder: true,
      },
      select: { id: true, key: true },
    });

    if (!folder) {
      try {
        folder = await prisma.fileObject.create({
          data: {
            name: part,
            key: folderKey,
            isFolder: true,
            size: BigInt(0),
            bucketId,
            tenantId,
            parentId: currentParentId,
            createdBy: userId,
          },
          select: { id: true },
        });
      } catch (err: any) {
        // Handle potential race condition where another invocation created it between our findFirst and create
        folder = await prisma.fileObject.findFirst({
          where: {
            bucketId,
            key: { in: [folderKey, folderKeyNoSlash] },
            isFolder: true,
          },
          select: { id: true, key: true },
        });
      }
    }

    currentParentId = folder?.id ?? null;
  }

  return currentParentId;
}

// ─── File sync handlers ───────────────────────────────────────────────────────

async function upsertFileObject(
  bucketInfo: BucketInfo,
  event: ParsedS3Event,
): Promise<void> {
  const prisma = getPrismaClient();
  const { bucketId, tenantId } = bucketInfo;
  const { key, size, bucketName, ipAddress } = event;

  const name = key.split("/").filter(Boolean).pop() ?? key;
  const isFolder = key.endsWith("/");

  // Use cross-account S3 client for BYOA buckets
  const s3 = await getS3ForBucket(bucketInfo);
  // Folders are virtual (0-byte prefix keys) — HeadObject will 404, skip it
  const identity = isFolder
    ? null
    : await fetchUploaderIdentity(s3, bucketName, key);
  const userId = identity?.userId ?? null;
  const uploaderType = identity?.uploaderType ?? "unknown";

  const existing = await prisma.fileObject.findFirst({
    where: { bucketId, key, isFolder },
  });

  if (existing) {
    await prisma.fileObject.update({
      where: { id: existing.id },
      data: { size: BigInt(size), updatedAt: new Date() },
    });
    console.log(`Updated FileObject: ${key} in bucket ${bucketId}`);
    await writeAudit(
      "FILE_UPLOAD",
      "FileObject",
      existing.id,
      { bucketId, key, size, source: "s3-event", op: "updated", uploaderType },
      "SUCCESS",
      userId,
      ipAddress,
    );
  } else {
    const parentKey = key.split("/").filter(Boolean).slice(0, -1).join("/");
    let parentId: string | null = null;

    if (parentKey) {
      parentId = await ensureParentDirectories(
        prisma,
        bucketId,
        tenantId,
        parentKey,
        userId,
      );
    }

    const created = await prisma.fileObject.create({
      data: {
        name,
        key,
        isFolder,
        size: BigInt(size),
        bucketId,
        tenantId,
        parentId,
        createdBy: userId,
      },
    });
    console.log(`Created FileObject: ${key} in bucket ${bucketId}`);
    const action = isFolder ? "FOLDER_CREATE" : "FILE_UPLOAD";
    await writeAudit(
      action,
      "FileObject",
      created.id,
      { bucketId, key, size, source: "s3-event", op: "created", uploaderType },
      "SUCCESS",
      userId,
      ipAddress,
    );
  }
}

async function deleteFileObject(
  bucketInfo: BucketInfo,
  event: ParsedS3Event,
): Promise<void> {
  const prisma = getPrismaClient();
  const { bucketId } = bucketInfo;
  const { key } = event;

  const isFolder = key.endsWith("/");

  if (isFolder) {
    // Delete all children (files and subfolders) whose key starts with this prefix
    const deleted = await prisma.fileObject.deleteMany({
      where: { bucketId, key: { startsWith: key } },
    });
    console.log(
      `Deleted folder and ${deleted.count} child objects for key: ${key} in bucket ${bucketId}`,
    );
    // Audit for deletions is written by the API route (which has the userId).
    // Lambda only syncs the DB — no duplicate audit here.
    return;
  }

  const file = await prisma.fileObject.findFirst({ where: { bucketId, key } });

  if (!file) {
    console.warn(`No FileObject found for key: ${key} in bucket ${bucketId}`);
    return;
  }

  await prisma.fileObject.delete({ where: { id: file.id } });
  console.log(`Deleted FileObject: ${key} in bucket ${bucketId}`);
  // Audit already written by the API route with the correct userId.
}

// ─── Lambda Handler ───────────────────────────────────────────────────────────

export async function handler(event: SQSEvent): Promise<SQSBatchResponse> {
  const failures: SQSBatchItemFailure[] = [];
  const bucketCache = new Map<string, BucketInfo>();

  for (const record of event.Records) {
    try {
      const s3Events = parseS3Event(record.body);

      for (const s3Event of s3Events) {
        if (s3Event.type === "unknown") {
          console.warn(`Skipping unknown event type for key: ${s3Event.key}`);
          continue;
        }

        const bucketInfo = await resolveBucket(s3Event.bucketName, bucketCache);
        if (!bucketInfo) {
          console.warn(
            `Skipping event — bucket not registered: ${s3Event.bucketName}`,
          );
          continue;
        }

        if (s3Event.type === "created") {
          await upsertFileObject(bucketInfo, s3Event);
        } else if (s3Event.type === "deleted") {
          await deleteFileObject(bucketInfo, s3Event);
        }
      }
    } catch (err) {
      console.error(`Failed to process message ${record.messageId}:`, err);
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures: failures };
}
