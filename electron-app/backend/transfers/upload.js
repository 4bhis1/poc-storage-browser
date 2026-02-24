const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const fs = require('fs');
const path = require('path');
const fsPromises = require('fs/promises');
const { createDecipheriv } = require("crypto");
const statusManager = require('./status');
const database = require('../database');
const syncHistory = require('../syncHistory');

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY || "", "hex");
const ALGORITHM = "aes-256-gcm";

function decrypt(text) {
    if (!text) return text;
    // If it doesn't look like our encrypted format (iv:hex:tag), return as is
    const parts = text.split(":");
    if (parts.length !== 3) return text;
    
    try {
        const [ivHex, encryptedHex, authTagHex] = parts;
        const iv = Buffer.from(ivHex, "hex");
        const authTag = Buffer.from(authTagHex, "hex");
        const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
        decipher.setAuthTag(authTag);
        let decrypted = decipher.update(encryptedHex, "hex", "utf8");
        decrypted += decipher.final("utf8");
        return decrypted;
    } catch (e) {
        console.warn('[UploadManager] Decryption failed, using raw value');
        return text;
    }
}

class UploadManager {
    constructor() {
        this.currentConfigId = null;
        this.currentSyncJobId = null;
    }
    /**
     * Handles both normal and large files.
     * Uses @aws-sdk/lib-storage Upload for automatic multipart handling.
     */
    async uploadFileToS3(s3Client, filePath, bucketName, s3Key, mimeType = 'application/octet-stream') {
        const fileName = path.basename(filePath);
        const stat = await fsPromises.stat(filePath);
        const transferId = `ul-${Date.now()}-${fileName}`;
        
        statusManager.startTransfer(transferId, fileName, 'upload', stat.size);

        try {
            const fileStream = fs.createReadStream(filePath);
            
            const upload = new Upload({
                client: s3Client,
                params: {
                    Bucket: bucketName,
                    Key: s3Key,
                    Body: fileStream,
                    ContentType: mimeType,
                },
                partSize: 5 * 1024 * 1024,
                queueSize: 4
            });

            upload.on('httpUploadProgress', (progress) => {
                const total = progress.total || stat.size;
                if (total > 0) {
                    const percentage = Math.round((progress.loaded * 100) / total);
                    statusManager.updateProgress(transferId, percentage, progress.loaded);
                }
            });

            await upload.done();
            statusManager.completeTransfer(transferId, 'done');
            await syncHistory.logActivity('UPLOAD', path.basename(filePath), 'SUCCESS', null, this.currentConfigId, this.currentSyncJobId);
            return true;
        } catch (error) {
            console.error('[UploadManager] S3 Upload Error:', error.message);
            statusManager.completeTransfer(transferId, 'error');
            await syncHistory.logActivity('UPLOAD', path.basename(filePath), 'FAILED', error.message, this.currentConfigId, this.currentSyncJobId);
            throw error;
        }
    }

    /**
     * Resolves credentials and bucket info then uploads.
     */
    async uploadWithBucketId(bucketId, filePath, s3Key, mimeType, configId = null, syncJobId = null) {
        this.currentConfigId = configId;
        this.currentSyncJobId = syncJobId;
        const dbRes = await database.query(`
            SELECT a."awsAccessKeyId", a."awsSecretAccessKey", b.region, b.name 
            FROM "Bucket" b 
            JOIN "Account" a ON b."accountId" = a.id 
            WHERE b.id = $1
        `, [bucketId]);

        if (dbRes.rows.length === 0) throw new Error("Bucket not found in database");
        
        const data = dbRes.rows[0];
        
        // Resolve Best Credentials
        let accessKeyId = decrypt(data.awsAccessKeyId);
        let secretAccessKey = decrypt(data.awsSecretAccessKey);
        let sessionToken = process.env.AWS_SESSION_TOKEN;

        // If DB keys are missing or redacted, fallback to .env
        if (!accessKeyId || accessKeyId.includes('*') || !secretAccessKey || secretAccessKey.includes('*')) {
            console.log(`[UploadManager] DB credentials for ${data.name} are missing or redacted. Falling back to .env.`);
            accessKeyId = process.env.AWS_ACCESS_KEY_ID;
            secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
        }

        // Sanitize: strip quotes and whitespace
        const clean = (val) => {
            if (!val) return null;
            let c = val.trim();
            if ((c.startsWith('"') && c.endsWith('"')) || (c.startsWith("'") && c.endsWith("'"))) {
                c = c.slice(1, -1);
            }
            return c || null;
        };
        
        const finalAccessKeyId = clean(accessKeyId);
        const finalSecretAccessKey = clean(secretAccessKey);
        const finalSessionToken = clean(sessionToken);

        if (!finalAccessKeyId || !finalSecretAccessKey) {
            throw new Error(`No valid AWS credentials found for bucket: ${data.name}`);
        }

        // Detect expired STS temporary credentials (ASIA... keys)
        if (finalAccessKeyId.startsWith('ASIA')) {
            const expiry = process.env.AWS_CREDENTIAL_EXPIRATION;
            if (expiry) {
                const expiryDate = new Date(expiry);
                if (expiryDate < new Date()) {
                    const msg = `AWS temporary credentials (STS) expired at ${expiryDate.toISOString()}. ` +
                        `Please update AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, and AWS_SESSION_TOKEN ` +
                        `in your .env file with fresh credentials from the AWS console.`;
                    console.error(`[UploadManager] ${msg}`);
                    throw new Error(msg);
                }
            }
            // STS key without expiry env var — warn but attempt anyway
            if (!finalSessionToken) {
                console.warn('[UploadManager] STS key detected but no AWS_SESSION_TOKEN set. Upload will likely fail.');
            }
        }

        const s3 = new S3Client({
            region: data.region || process.env.AWS_REGION || 'us-east-1',
            credentials: {
                accessKeyId: finalAccessKeyId,
                secretAccessKey: finalSecretAccessKey,
                ...(finalSessionToken ? { sessionToken: finalSessionToken } : {})
            },
        });

        return await this.uploadFileToS3(s3, filePath, data.name, s3Key, mimeType);
    }
}

module.exports = new UploadManager();
