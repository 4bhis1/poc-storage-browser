"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const client_s3_1 = require("@aws-sdk/client-s3");
const prisma_1 = require("./prisma");
// ─── Event Parsers ────────────────────────────────────────────────────────────
/**
 * Parses an SQS message body into a normalized S3 event.
 * Handles two formats:
 *   1. Direct S3 → SQS notification (same-account buckets)
 *   2. EventBridge → SQS envelope (cross-account BYOA buckets)
 */
function parseS3Event(body) {
    const parsed = JSON.parse(body);
    // ── Format 1: EventBridge envelope ──────────────────────────────────────
    // EventBridge wraps events with detail-type and detail fields
    if (parsed["detail-type"] && parsed.detail) {
        const detailType = parsed["detail-type"];
        const detail = parsed.detail;
        const bucketName = detail.bucket?.name ?? "";
        const key = decodeURIComponent((detail.object?.key ?? "").replace(/\+/g, " "));
        const size = detail.object?.size ?? 0;
        const eTag = detail.object?.etag;
        let type = "unknown";
        if (detailType === "Object Created" ||
            detailType === "Object Restore Completed") {
            type = "created";
        }
        else if (detailType === "Object Deleted") {
            type = "deleted";
        }
        return [{ type, bucketName, key, size, eTag }];
    }
    // ── Format 2: Direct S3 notification ────────────────────────────────────
    // Standard S3 event notification has a Records array
    if (Array.isArray(parsed.Records)) {
        return parsed.Records.map((record) => {
            const bucketName = record.s3?.bucket?.name ?? "";
            const key = decodeURIComponent((record.s3?.object?.key ?? "").replace(/\+/g, " "));
            const size = record.s3?.object?.size ?? 0;
            const eTag = record.s3?.object?.eTag;
            const eventName = record.eventName ?? "";
            let type = "unknown";
            if (eventName.startsWith("ObjectCreated")) {
                type = "created";
            }
            else if (eventName.startsWith("ObjectRemoved")) {
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
async function resolveBucket(bucketName, cache) {
    if (cache.has(bucketName))
        return cache.get(bucketName);
    const prisma = (0, prisma_1.getPrismaClient)();
    const bucket = await prisma.bucket.findFirst({
        where: { name: bucketName },
        select: { id: true, tenantId: true },
    });
    if (!bucket) {
        console.warn(`No bucket record found for S3 bucket: ${bucketName}`);
        return null;
    }
    const info = { bucketId: bucket.id, tenantId: bucket.tenantId };
    cache.set(bucketName, info);
    return info;
}
// System actor used for all lambda-originated audit entries (no real user context)
const SYSTEM_ACTOR = "system:lambda";
// Lazy S3 client — reused across warm invocations
let s3Client = null;
function getS3() {
    if (!s3Client)
        s3Client = new client_s3_1.S3Client({});
    return s3Client;
}
/**
 * Fetches uploader identity from S3 object metadata (set at presigned URL generation).
 * Returns null if metadata is absent (e.g. direct S3 upload, cross-account BYOA).
 */
async function fetchUploaderIdentity(bucketName, key) {
    try {
        const head = await getS3().send(new client_s3_1.HeadObjectCommand({ Bucket: bucketName, Key: key }));
        const meta = head.Metadata ?? {};
        const userId = meta["uploaded-by-user-id"] ?? null;
        const uploaderType = meta["uploaded-by-type"] ?? "unknown";
        return { userId, uploaderType };
    }
    catch (err) {
        // HeadObject can fail for cross-account buckets or if object was already deleted
        console.warn(`[audit] HeadObject failed for ${bucketName}/${key}:`, err);
        return null;
    }
}
async function writeAudit(action, resource, resourceId, details, status, userId = null) {
    const prisma = (0, prisma_1.getPrismaClient)();
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
    }
    catch (err) {
        // Audit failure must never crash the sync — log and move on
        console.error("[audit] Failed to write audit log:", err);
    }
}
async function upsertFileObject(bucketInfo, event) {
    const prisma = (0, prisma_1.getPrismaClient)();
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
    }
    else {
        const parentKey = key.split("/").slice(0, -1).join("/");
        let parentId = null;
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
async function deleteFileObject(bucketInfo, event) {
    const prisma = (0, prisma_1.getPrismaClient)();
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
async function handler(event) {
    const failures = [];
    // Per-invocation cache: bucket name → { bucketId, tenantId }
    // Avoids N DB lookups for N messages from the same bucket in one batch
    const bucketCache = new Map();
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
                }
                else if (s3Event.type === "deleted") {
                    await deleteFileObject(bucketInfo, s3Event);
                }
            }
        }
        catch (err) {
            console.error(`Failed to process message ${record.messageId}:`, err);
            // Report this message as failed — SQS will redeliver only this one
            failures.push({ itemIdentifier: record.messageId });
        }
    }
    return { batchItemFailures: failures };
}
