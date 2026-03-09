"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handler = handler;
const client_s3_1 = require("@aws-sdk/client-s3");
const client_sts_1 = require("@aws-sdk/client-sts");
const prisma_1 = require("./prisma");
// ─── Event Parsers ────────────────────────────────────────────────────────────
function parseS3Event(body) {
    const parsed = JSON.parse(body);
    // ── Format 1: EventBridge envelope ──────────────────────────────────────
    if (parsed["detail-type"] && parsed.detail) {
        const detailType = parsed["detail-type"];
        const detail = parsed.detail;
        const bucketName = detail.bucket?.name ?? "";
        const key = decodeURIComponent((detail.object?.key ?? "").replace(/\+/g, " "));
        const size = detail.object?.size ?? 0;
        const eTag = detail.object?.etag;
        let type = "unknown";
        if (detailType === "Object Created" || detailType === "Object Restore Completed") {
            type = "created";
        }
        else if (detailType === "Object Deleted") {
            type = "deleted";
        }
        return [{ type, bucketName, key, size, eTag }];
    }
    // ── Format 2: Direct S3 notification ────────────────────────────────────
    if (Array.isArray(parsed.Records)) {
        return parsed.Records.map((record) => {
            const bucketName = record.s3?.bucket?.name ?? "";
            const key = decodeURIComponent((record.s3?.object?.key ?? "").replace(/\+/g, " "));
            const size = record.s3?.object?.size ?? 0;
            const eTag = record.s3?.object?.eTag;
            const eventName = record.eventName ?? "";
            let type = "unknown";
            if (eventName.startsWith("ObjectCreated"))
                type = "created";
            else if (eventName.startsWith("ObjectRemoved"))
                type = "deleted";
            return { type, bucketName, key, size, eTag };
        });
    }
    console.warn("Unrecognized S3 event format:", JSON.stringify(parsed));
    return [];
}
// ─── DB Helpers ───────────────────────────────────────────────────────────────
async function resolveBucket(bucketName, cache) {
    if (cache.has(bucketName))
        return cache.get(bucketName);
    const prisma = (0, prisma_1.getPrismaClient)();
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
    const info = {
        bucketId: bucket.id,
        tenantId: bucket.tenantId,
        region: bucket.region,
        awsAccount: bucket.awsAccount
            ? { roleArn: bucket.awsAccount.roleArn, externalId: bucket.awsAccount.externalId }
            : null,
    };
    cache.set(bucketName, info);
    return info;
}
// ─── S3 Client helpers ────────────────────────────────────────────────────────
// Default S3 client using Lambda's own role (for same-account buckets)
let defaultS3 = null;
function getDefaultS3() {
    if (!defaultS3)
        defaultS3 = new client_s3_1.S3Client({});
    return defaultS3;
}
function decrypt(text) {
    if (!text)
        return text;
    const [ivHex, encryptedHex, authTagHex] = text.split(":");
    if (!ivHex || !encryptedHex || !authTagHex)
        return text;
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
async function getS3ForBucket(bucketInfo) {
    if (!bucketInfo.awsAccount)
        return getDefaultS3();
    const { roleArn, externalId } = bucketInfo.awsAccount;
    const decryptedExternalId = decrypt(externalId);
    const sts = new client_sts_1.STSClient({ region: "us-east-1" });
    const { Credentials } = await sts.send(new client_sts_1.AssumeRoleCommand({
        RoleArn: roleArn,
        RoleSessionName: "CamsLambdaHeadObject",
        ExternalId: decryptedExternalId,
    }));
    if (!Credentials)
        throw new Error(`Failed to assume role ${roleArn}`);
    return new client_s3_1.S3Client({
        region: bucketInfo.region,
        credentials: {
            accessKeyId: Credentials.AccessKeyId,
            secretAccessKey: Credentials.SecretAccessKey,
            sessionToken: Credentials.SessionToken,
        },
    });
}
// ─── Audit helpers ────────────────────────────────────────────────────────────
const SYSTEM_ACTOR = "system:lambda";
async function fetchUploaderIdentity(s3, bucketName, key) {
    try {
        const head = await s3.send(new client_s3_1.HeadObjectCommand({ Bucket: bucketName, Key: key }));
        const meta = head.Metadata ?? {};
        return {
            userId: meta["uploaded-by-user-id"] ?? null,
            uploaderType: meta["uploaded-by-type"] ?? "unknown",
        };
    }
    catch (err) {
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
        console.error("[audit] Failed to write audit log:", err);
    }
}
// ─── File sync handlers ───────────────────────────────────────────────────────
async function upsertFileObject(bucketInfo, event) {
    const prisma = (0, prisma_1.getPrismaClient)();
    const { bucketId, tenantId } = bucketInfo;
    const { key, size, bucketName } = event;
    const name = key.split("/").filter(Boolean).pop() ?? key;
    const isFolder = key.endsWith("/");
    // Use cross-account S3 client for BYOA buckets
    const s3 = await getS3ForBucket(bucketInfo);
    const identity = await fetchUploaderIdentity(s3, bucketName, key);
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
            data: { name, key, isFolder, size: BigInt(size), bucketId, tenantId, parentId },
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
    const file = await prisma.fileObject.findFirst({ where: { bucketId, key } });
    if (!file) {
        console.warn(`No FileObject found for key: ${key} in bucket ${bucketId}`);
        return;
    }
    await prisma.fileObject.delete({ where: { id: file.id } });
    console.log(`Deleted FileObject: ${key} in bucket ${bucketId}`);
    await writeAudit("FILE_DELETE", "FileObject", file.id, { bucketId, key, source: "s3-event" }, "SUCCESS", null);
}
// ─── Lambda Handler ───────────────────────────────────────────────────────────
async function handler(event) {
    const failures = [];
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
            failures.push({ itemIdentifier: record.messageId });
        }
    }
    return { batchItemFailures: failures };
}
