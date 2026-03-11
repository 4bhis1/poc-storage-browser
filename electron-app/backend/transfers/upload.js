const { S3Client, CreateMultipartUploadCommand, UploadPartCommand, CompleteMultipartUploadCommand, AbortMultipartUploadCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const fsPromises = require('fs/promises');
const axios = require('axios');
const statusManager = require('./status');
const transferState = require('./transferState');
const database = require('../database');
const syncHistory = require('../syncHistory');

const config         = require('../config');
const ENTERPRISE_URL = config.ENTERPRISE_URL;

// Match enterprise upload-provider thresholds
const PART_SIZE = 20 * 1024 * 1024;            // 20MB default
const MULTIPART_THRESHOLD = 100 * 1024 * 1024; // 100MB triggers multipart
const MAX_PARTS = 9900;                         // S3 hard limit is 10,000
const MAX_RETRIES = 3;

class UploadManager {
    constructor() {
        this.currentConfigId = null;
        this.currentSyncJobId = null;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PUBLIC ENTRY POINT
    // ─────────────────────────────────────────────────────────────────────────

    async uploadWithBucketId(bucketId, filePath, s3Key, mimeType, configId = null, syncJobId = null) {
        this.currentConfigId = configId;
        this.currentSyncJobId = syncJobId;

        const credentialManager = require('../aws-credentials');
        const authManager = require('../auth');

        const dbRes = await database.query(
            `SELECT b.region, b.name, b."accountId" FROM "Bucket" b WHERE b.id = $1`,
            [bucketId]
        );
        if (dbRes.rows.length === 0) throw new Error('Bucket not found in database');

        const { region, name: bucketName, accountId } = dbRes.rows[0];
        const stat = await fsPromises.stat(filePath);
        const contentType = mimeType || 'application/octet-stream';

        if (stat.size >= MULTIPART_THRESHOLD) {
            await this._uploadMultipart(bucketId, accountId, filePath, bucketName, s3Key, contentType, stat, region, credentialManager, authManager);
        } else {
            await this._uploadSimple(bucketId, accountId, filePath, bucketName, s3Key, contentType, stat, region, credentialManager, authManager);
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // SIMPLE UPLOAD — single PutObject for files < 100MB
    // Persists intent so the queue can retry after a crash.
    // ─────────────────────────────────────────────────────────────────────────

    async _uploadSimple(bucketId, accountId, filePath, bucketName, s3Key, contentType, stat, region, credentialManager, authManager) {
        const fileName = path.basename(filePath);
        const transferId = `ul-${Date.now()}-${fileName}`;
        const stateId = `ul-simple-${bucketId}-${Buffer.from(s3Key).toString('base64')}`;

        statusManager.startTransfer(transferId, fileName, 'upload', stat.size);

        // Persist intent — allows queue to retry after crash
        transferState.saveTransferState({
            id: stateId,
            type: 'upload',
            bucketId,
            s3Key,
            localPath: filePath,
            totalSize: stat.size,
            mimeType: contentType,
            configId: this.currentConfigId,
            syncJobId: this.currentSyncJobId,
            userId: authManager.getCurrentUserId(),
        });
        transferState.updateTransferState(stateId, { status: 'active' });

        try {
            const credentials = await credentialManager.getCredentials(accountId);
            const s3 = this._buildS3Client(credentials, region);

            const { PassThrough } = require('stream');
            const passThrough = new PassThrough();
            const fileStream = fs.createReadStream(filePath);
            let uploaded = 0;

            const abortCtrl = new AbortController();
            statusManager.registerAbortController(transferId, abortCtrl);

            fileStream.on('data', (chunk) => {
                uploaded += chunk.length;
                if (stat.size > 0) {
                    statusManager.updateProgress(transferId, (uploaded / stat.size) * 100, uploaded);
                }
            });
            fileStream.pipe(passThrough);

            await s3.send(new PutObjectCommand({
                Bucket: bucketName,
                Key: s3Key,
                Body: passThrough,
                ContentType: contentType,
                ContentLength: stat.size,
            }), { abortSignal: abortCtrl.signal });

            statusManager.completeTransfer(transferId, 'done');
            transferState.deleteTransferState(stateId);
            await syncHistory.logActivity('UPLOAD', s3Key, 'SUCCESS', null, this.currentConfigId, this.currentSyncJobId);

        } catch (error) {
            console.error('[UploadManager] Simple upload error:', error.message);
            const isTerminated = error.message === 'Transfer terminated by user';
            statusManager.completeTransfer(transferId, isTerminated ? 'terminated' : 'error');

            if (isTerminated) {
                transferState.deleteTransferState(stateId);
            } else {
                transferState.updateTransferState(stateId, { status: 'failed', error: error.message });
                await syncHistory.logActivity('UPLOAD', s3Key, 'FAILED', error.message, this.currentConfigId, this.currentSyncJobId);
            }
            throw error;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MULTIPART UPLOAD — resumable, 20MB parts, per-part credential refresh
    // On error: persists state to local DB instead of aborting S3 upload.
    // On start: checks local DB first, then enterprise API for resume state.
    // ─────────────────────────────────────────────────────────────────────────

    async _uploadMultipart(bucketId, accountId, filePath, bucketName, s3Key, contentType, stat, region, credentialManager, authManager) {
        const fileName = path.basename(filePath);
        const transferId = `ul-${Date.now()}-${fileName}`;

        // Dynamic part sizing
        let partSize = PART_SIZE;
        if (stat.size / partSize > MAX_PARTS) {
            partSize = Math.ceil(stat.size / MAX_PARTS);
        }
        const totalParts = Math.ceil(stat.size / partSize);

        statusManager.startTransfer(transferId, fileName, 'upload', stat.size, totalParts);

        // Deterministic state ID — same file + bucket always maps to same record
        const stateId = `ul-mp-${bucketId}-${Buffer.from(s3Key).toString('base64')}`;

        // Deterministic file hash for enterprise API resume check
        const fileHash = Buffer.from(
            `${bucketId}-root-${fileName}-${stat.size}-${stat.mtimeMs}`
        ).toString('base64');

        let uploadId = null;
        let completedParts = []; // [{ PartNumber, ETag }]

        try {
            // ── 1. Check local DB for resume state (fastest path) ──────────
            const localState = transferState.getTransferState(stateId);
            if (localState?.uploadId) {
                uploadId = localState.uploadId;
                completedParts = localState.completedParts || [];
                console.log(`[UploadManager] Resuming from local state: ${fileName} — ${completedParts.length}/${totalParts} parts done`);
            }

            // ── 2. Fall back to enterprise API if no local state ───────────
            if (!uploadId) {
                const token = authManager.getToken();
                try {
                    const statusRes = await axios.post(
                        `${ENTERPRISE_URL}/api/files/multipart/status`,
                        { fileHash },
                        { headers: { Authorization: `Bearer ${token}` }, timeout: 10000 }
                    );
                    if (statusRes.data?.active) {
                        uploadId = statusRes.data.uploadId;
                        completedParts = statusRes.data.parts || [];
                        console.log(`[UploadManager] Resuming from enterprise API: ${fileName} — ${completedParts.length}/${totalParts} parts done`);
                    }
                } catch (e) {
                    console.warn(`[UploadManager] Could not check multipart status for ${fileName}:`, e.message);
                }
            }

            // ── 3. Initiate if no active upload found ──────────────────────
            if (!uploadId) {
                const credentials = await credentialManager.getCredentials(accountId);
                const s3 = this._buildS3Client(credentials, region);

                const initRes = await s3.send(new CreateMultipartUploadCommand({
                    Bucket: bucketName,
                    Key: s3Key,
                    ContentType: contentType,
                }));
                uploadId = initRes.UploadId;
                console.log(`[UploadManager] Initiated multipart upload: ${fileName} — uploadId: ${uploadId}`);
            }

            // Persist state immediately after we have an uploadId
            transferState.saveTransferState({
                id: stateId,
                type: 'upload',
                bucketId,
                s3Key,
                localPath: filePath,
                totalSize: stat.size,
                mimeType: contentType,
                configId: this.currentConfigId,
                syncJobId: this.currentSyncJobId,
                userId: authManager.getCurrentUserId(),
            });
            transferState.updateTransferState(stateId, {
                status: 'active',
                uploadId,
                completedParts,
            });

            // ── 4. Upload remaining parts ──────────────────────────────────
            const completedPartNumbers = new Set(completedParts.map(p => p.PartNumber));
            const remainingParts = Array.from({ length: totalParts }, (_, i) => i + 1)
                .filter(n => !completedPartNumbers.has(n));

            // Restore progress for already-completed parts
            if (completedParts.length > 0) {
                const pct = Math.round((completedParts.length / totalParts) * 100);
                statusManager.updateProgress(transferId, pct, completedParts.length * partSize);
                for (const p of completedParts) {
                    statusManager.updateChunk(transferId, p.PartNumber, 'done', 100);
                }
            }

            const uploadPart = async (partNumber) => {
                const start = (partNumber - 1) * partSize;
                const end = Math.min(start + partSize, stat.size);
                const chunkSize = end - start;

                statusManager.updateChunk(transferId, partNumber, 'active', 0);

                for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
                    try {
                        const credentials = await credentialManager.getCredentials(accountId);
                        const s3 = this._buildS3Client(credentials, region);

                        const buffer = Buffer.allocUnsafe(chunkSize);
                        const fd = await fsPromises.open(filePath, 'r');
                        await fd.read(buffer, 0, chunkSize, start);
                        await fd.close();

                        // Pass buffer directly — AWS SDK v3 cannot hash a pre-ended
                        // PassThrough stream. Progress is updated per-part on completion.
                        const alreadyDone = completedParts.length * partSize;

                        const result = await s3.send(new UploadPartCommand({
                            Bucket: bucketName,
                            Key: s3Key,
                            UploadId: uploadId,
                            PartNumber: partNumber,
                            Body: buffer,
                            ContentLength: chunkSize,
                        }));

                        // Update progress after successful part upload
                        const totalLoaded = alreadyDone + chunkSize;
                        const overallPct = Math.min(99, (totalLoaded / stat.size) * 100);
                        statusManager.updateProgress(transferId, overallPct, totalLoaded);
                        statusManager.updateChunk(transferId, partNumber, 'active', 100);

                        const etag = result.ETag?.replace(/"/g, '');
                        if (!etag) throw new Error(`No ETag returned for part ${partNumber}`);

                        completedParts.push({ PartNumber: partNumber, ETag: etag });

                        // Persist updated parts list after each successful part
                        transferState.updateTransferState(stateId, {
                            completedParts,
                            bytesTransferred: completedParts.length * partSize,
                        });

                        const pct = Math.round((completedParts.length / totalParts) * 100);
                        statusManager.updateProgress(transferId, pct, completedParts.length * partSize);
                        statusManager.updateChunk(transferId, partNumber, 'done', 100);
                        return;

                    } catch (err) {
                        // If S3 says the upload no longer exists, clear state and throw to restart
                        if (err.name === 'NoSuchUpload') {
                            console.warn(`[UploadManager] NoSuchUpload for ${fileName} — clearing state, will restart`);
                            transferState.deleteTransferState(stateId);
                            throw err;
                        }
                        console.warn(`[UploadManager] Part ${partNumber} attempt ${attempt}/${MAX_RETRIES} failed:`, err.message);
                        if (attempt >= MAX_RETRIES) {
                            statusManager.updateChunk(transferId, partNumber, 'error', 0);
                            throw err;
                        }
                        await new Promise(r => setTimeout(r, 1000 * Math.pow(2, attempt)));
                    }
                }
            };

            for (const partNum of remainingParts) {
                const terminated = await statusManager.checkPauseSignal(transferId);
                if (terminated) throw new Error('Transfer terminated by user');
                await uploadPart(partNum);
            }

            // ── 5. Complete multipart upload ───────────────────────────────
            completedParts.sort((a, b) => a.PartNumber - b.PartNumber);

            const credentials = await credentialManager.getCredentials(accountId);
            const s3 = this._buildS3Client(credentials, region);

            await s3.send(new CompleteMultipartUploadCommand({
                Bucket: bucketName,
                Key: s3Key,
                UploadId: uploadId,
                MultipartUpload: { Parts: completedParts },
            }));

            statusManager.completeTransfer(transferId, 'done');
            transferState.deleteTransferState(stateId);
            await syncHistory.logActivity('UPLOAD', s3Key, 'SUCCESS', null, this.currentConfigId, this.currentSyncJobId);
            console.log(`[UploadManager] Multipart upload complete: ${fileName} (${totalParts} parts)`);

        } catch (error) {
            console.error('[UploadManager] Multipart upload error:', error.message);
            const isTerminated = error.message === 'Transfer terminated by user';
            statusManager.completeTransfer(transferId, isTerminated ? 'terminated' : 'error');

            if (isTerminated) {
                // User explicitly cancelled — clean up S3 orphan and local state
                transferState.deleteTransferState(stateId);
                if (uploadId) {
                    try {
                        const credentials = await credentialManager.getCredentials(accountId).catch(() => null);
                        if (credentials) {
                            const s3 = this._buildS3Client(credentials, region);
                            await s3.send(new AbortMultipartUploadCommand({ Bucket: bucketName, Key: s3Key, UploadId: uploadId }));
                            console.log(`[UploadManager] Aborted cancelled multipart upload: ${uploadId}`);
                        }
                    } catch (abortErr) {
                        console.warn('[UploadManager] Failed to abort multipart upload:', abortErr.message);
                    }
                }
            } else {
                // Network/transient error — persist state for resume, do NOT abort S3 upload
                if (uploadId) {
                    transferState.updateTransferState(stateId, {
                        status: 'failed',
                        uploadId,
                        completedParts,
                        error: error.message,
                    });
                    console.log(`[UploadManager] Preserved multipart state for resume: ${stateId} (${completedParts.length} parts saved)`);
                }
                await syncHistory.logActivity('UPLOAD', s3Key, 'FAILED', error.message, this.currentConfigId, this.currentSyncJobId);
            }

            throw error;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // HELPERS
    // ─────────────────────────────────────────────────────────────────────────

    _buildS3Client(credentials, region) {
        return new S3Client({
            region: credentials.region || region || 'us-east-1',
            credentials: {
                accessKeyId: credentials.accessKeyId,
                secretAccessKey: credentials.secretAccessKey,
                sessionToken: credentials.sessionToken,
            },
        });
    }
}

module.exports = new UploadManager();
