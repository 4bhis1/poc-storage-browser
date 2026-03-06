import { S3Client, HeadObjectCommand } from "@aws-sdk/client-s3";
import type { SQSEvent, SQSBatchResponse, SQSBatchItemFailure } from "aws-lambda";
import { getPrismaClient } from "./prisma";

// ─── Types ────────────────────────────────────────────────────────────────────

interface ParsedS3Event {
  type: "created" | "deleted" | "unknown";
  bucketName: string;
  key: string;
  size: number;
  eTag?: string;
}

interface BucketInfo {
  bucketId: string;
  tenantId: string;
}

// ─── Event Parsers ────────────────────────────────────────────────────────────

/**
 * Parses an SQS message body into a normalized S3 event.
 * Handles two formats:
 *   1. Direct S3 → SQS notification (same-account buckets)
 *   2. EventBridge → SQS envelope (cross-account BYOA buckets)
 */
function parseS3Event(body: string): ParsedS3Event[] {
  const parsed = JSON.parse(body);

  // ── Format 1: EventBridge envelope ──────────────────────────────────────
  // EventBridge wraps events with detail-type and detail fields
  if (parsed["detail-type"] && parsed.detail) {
    const detailType: string = parsed["detail-type"];
    const detail = parsed.detail;

    const bucketName: string = detail.bucket?.name ?? "";
    const key: string = decodeURIComponent(
      (detail.object?.key ?? "").replace(/\+/g, " ")
    );
    const size: number = detail.object?.size ?? 0;
    const eTag: string | undefined = detail.object?.etag;

    let type: ParsedS3Event["type"] = "unknown";
    if (
      detailType === "Object Created" ||
      detailType === "Object Restore Completed"
    ) {
      type = "created";
    } else if (detailType === "Object Deleted") {
      type = "deleted";
    }

    return [{ type, bucketName, key, size, eTag }];
  }

  // ── Format 2: Direct S3 notification ────────────────────────────────────
  // Standard S3 event notification has a Records array
  if (Array.isArray(parsed.Records)) {
    return parsed.Records.map((record: any) => {
      const bucketName: string = record.s3?.bucket?.name ?? "";
      const key: string = decodeURIComponent(
        (record.s3?.object?.key ?? "").replace(/\+/g, " ")
      );
      const size: number = record.s3?.object?.size ?? 0;
      const eTag: string | undefined = record.s3?.object?.eTag;
      const eventName: string = record.eventName ?? "";

      let type: ParsedS3Event["type"] = "unknown";
      if (eventName.startsWith("ObjectCreated")) {
        type = "created";
      } else if (eventName.startsWith("ObjectRemoved")) {
        type = "deleted";
      }

      return { type, bucketName, key, size, eTag };
    });
  }

  console.warn("Unrecognized S3 event format:", JSON.stringify(parsed));
  return [];
}

// ─── DB Helpers ───────────────────────────────────────────────────────────────

/**
 * Resolves S3 bucket name → internal bucketId + tenantId.
 * Uses a per-invocation cache to avoid repeated DB lookups within a batch.
 */
async function resolveBucket(
  bucketName: string,
  cache: Map<string, BucketInfo>
): Promise<BucketInfo | null> {
  if (cache.has(bucketName)) return cache.get(bucketName)!;

  const prisma = getPrismaClient();
  const bucket = await prisma.bucket.findFirst({
    where: { name: bucketName },
    select: { id: true, tenantId: true },
  });

  if (!bucket) {
    console.warn(`No bucket record found for S3 bucket: ${bucketName}`);
    return null;
  }

  const info: BucketInfo = { bucketId: bucket.id, tenantId: bucket.tenantId };
  cache.set(bucketName, info);
  return info;
}

// System actor used for all lambda-originated audit entries (no real user context)
const SYSTEM_ACTOR = "system:lambda";

// Lazy S3 client — reused across warm invocations
let s3Client: S3Client | null = null;
function getS3(): S3Client {
  if (!s3Client) s3Client = new S3Client({});
  return s3Client;
}

/**
 * Fetches uploader identity from S3 object metadata (set at presigned URL generation).
 * Returns null if metadata is absent (e.g. direct S3 upload, cross-account BYOA).
 */
async function fetchUploaderIdentity(
  bucketName: string,
  key: string
): Promise<{ userId: string | null; uploaderType: string } | null> {
  try {
    const head = await getS3().send(new HeadObjectCommand({ Bucket: bucketName, Key: key }));
    const meta = head.Metadata ?? {};
    const userId = meta["uploaded-by-user-id"] ?? null;
    const uploaderType = meta["uploaded-by-type"] ?? "unknown";
    return { userId, uploaderType };
  } catch (err) {
    // HeadObject can fail for cross-account buckets or if object was already deleted
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
  userId: string | null = null
): Promise<void> {
  const prisma = getPrismaClient();
  try {
    await prisma.auditLog.create({
      data: {
        userId,
        action,
        resource: resourceId ? `${resource}:${resourceId}` : resource,
        details: JSON.stringify({ ...details, actor: userId ?? SYSTEM_ACTOR }),
        status,
        ipAddress: null,
        createdBy: null,
        updatedBy: null,
      },
    });
  } catch (err) {
    // Audit failure must never crash the sync — log and move on
    console.error("[audit] Failed to write audit log:", err);
  }
}

async function upsertFileObject(
  bucketInfo: BucketInfo,
  event: ParsedS3Event
): Promise<void> {
  const prisma = getPrismaClient();
  const { bucketId, tenantId } = bucketInfo;
  const { key, size, bucketName } = event;

  // Derive name from key (last segment)
  const name = key.split("/").filter(Boolean).pop() ?? key;
  const isFolder = key.endsWith("/");

  // Fetch uploader identity from S3 metadata (best-effort)
  const identity = await fetchUploaderIdentity(bucketName, key);
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
    await writeAudit("FILE_UPLOAD", "FileObject", existing.id, { bucketId, key, size, source: "s3-event", op: "updated", uploaderType }, "SUCCESS", userId);
  } else {
    const parentKey = key.split("/").slice(0, -1).join("/");
    let parentId: string | null = null;

    if (parentKey) {
      const parent = await prisma.fileObject.findFirst({
        where: { bucketId, key: parentKey + "/" },
        select: { id: true },
      });
      parentId = parent?.id ?? null;
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
        // createdBy/updatedBy intentionally null — no user context in S3 events
      },
    });
    console.log(`Created FileObject: ${key} in bucket ${bucketId}`);
    const action = isFolder ? "FOLDER_CREATE" : "FILE_UPLOAD";
    await writeAudit(action, "FileObject", created.id, { bucketId, key, size, source: "s3-event", op: "created", uploaderType }, "SUCCESS", userId);
  }
}

async function deleteFileObject(
  bucketInfo: BucketInfo,
  event: ParsedS3Event
): Promise<void> {
  const prisma = getPrismaClient();
  const { bucketId } = bucketInfo;
  const { key } = event;

  const file = await prisma.fileObject.findFirst({
    where: { bucketId, key },
  });

  if (!file) {
    console.warn(`No FileObject found for key: ${key} in bucket ${bucketId}`);
    return;
  }

  await prisma.fileObject.delete({ where: { id: file.id } });
  console.log(`Deleted FileObject: ${key} in bucket ${bucketId}`);
  // No HeadObject on delete — object is already gone from S3; userId stays null (system)
  await writeAudit("FILE_DELETE", "FileObject", file.id, { bucketId, key, source: "s3-event" }, "SUCCESS", null);
}

// ─── Lambda Handler ───────────────────────────────────────────────────────────

export async function handler(
  event: SQSEvent
): Promise<SQSBatchResponse> {
  const failures: SQSBatchItemFailure[] = [];

  // Per-invocation cache: bucket name → { bucketId, tenantId }
  // Avoids N DB lookups for N messages from the same bucket in one batch
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
          // Intentional no-op: bucket not yet registered in our system (e.g. BYOA not onboarded)
          console.warn(`Skipping event — bucket not registered: ${s3Event.bucketName}`);
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
      // Report this message as failed — SQS will redeliver only this one
      failures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures: failures };
}
