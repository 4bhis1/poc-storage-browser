const { S3Client, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } = require('@aws-sdk/client-s3');
const { createDecipheriv } = require("crypto");
const database = require('../database');

const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY || "", "hex");
const ALGORITHM = "aes-256-gcm";

function decrypt(text) {
    if (!text) return text;
    const parts = text.split(":");
    if (parts.length !== 3) return text;
    const [ivHex, encryptedHex, authTagHex] = parts;
    const iv = Buffer.from(ivHex, "hex");
    const authTag = Buffer.from(authTagHex, "hex");
    const decipher = createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(encryptedHex, "hex", "utf8");
    decrypted += decipher.final("utf8");
    return decrypted;
}

class DeleteManager {
    async deleteFromS3(bucketId, s3Key) {
        try {
            const s3Client = await this._getS3Client(bucketId);
            const bucketName = await this._getBucketName(bucketId);

            await s3Client.send(new DeleteObjectCommand({
                Bucket: bucketName,
                Key: s3Key
            }));
            console.log(`[DeleteManager] Deleted from S3: s3://${bucketName}/${s3Key}`);
            return true;
        } catch (error) {
            console.error('[DeleteManager] Delete error:', error.message);
            return false;
        }
    }

    async deleteFolderFromS3(bucketId, prefix) {
        try {
            const s3Client = await this._getS3Client(bucketId);
            const bucketName = await this._getBucketName(bucketId);

            // 1. List all objects with prefix
            const listParams = {
                Bucket: bucketName,
                Prefix: prefix.endsWith('/') ? prefix : `${prefix}/`
            };

            const listedObjects = await s3Client.send(new ListObjectsV2Command(listParams));

            if (!listedObjects.Contents || listedObjects.Contents.length === 0) return true;

            // 2. Delete all objects
            const deleteParams = {
                Bucket: bucketName,
                Delete: { Objects: listedObjects.Contents.map(({ Key }) => ({ Key })) }
            };

            await s3Client.send(new DeleteObjectsCommand(deleteParams));

            if (listedObjects.IsTruncated) {
                await this.deleteFolderFromS3(bucketId, prefix);
            }

            console.log(`[DeleteManager] Deleted folder from S3: s3://${bucketName}/${prefix}`);
            return true;
        } catch (error) {
            console.error('[DeleteManager] Folder delete error:', error.message);
            return false;
        }
    }

    async _getS3Client(bucketId) {
        const dbRes = await database.query(`
            SELECT a."awsAccessKeyId", a."awsSecretAccessKey", b.region 
            FROM "Bucket" b 
            JOIN "Account" a ON b."accountId" = a.id 
            WHERE b.id = $1
        `, [bucketId]);

        if (dbRes.rows.length === 0) throw new Error("Bucket not found");
        const data = dbRes.rows[0];

        return new S3Client({
            region: data.region,
            credentials: {
                accessKeyId: decrypt(data.awsAccessKeyId),
                secretAccessKey: decrypt(data.awsSecretAccessKey),
            },
        });
    }

    async _getBucketName(bucketId) {
        const dbRes = await database.query('SELECT name FROM "Bucket" WHERE id = $1', [bucketId]);
        if (dbRes.rows.length === 0) throw new Error("Bucket not found");
        return dbRes.rows[0].name;
    }
}

module.exports = new DeleteManager();
