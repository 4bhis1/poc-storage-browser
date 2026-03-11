const { S3Client, GetObjectCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { pipeline } = require('stream/promises');
const statusManager = require('./status');
const transferState = require('./transferState');
const authManager = require('../auth');

class DownloadManager {
    constructor() {
        // Tracks in-flight downloads by stateId to prevent duplicate concurrent downloads
        this._inFlight = new Set();
    }

    /**
     * Download from S3 using short-lived credentials, resuming from a partial
     * .part file if one exists.
     */
    async downloadFromS3(s3Client, bucketName, s3Key, localPath, totalSize = 0, stateId = null) {
        const fileName = path.basename(s3Key);
        const partPath = localPath + '.part';
        const transferId = `dl-${Date.now()}-${fileName}`;

        // ── Determine resume offset ──────────────────────────────────────────
        let resumeOffset = 0;
        if (fs.existsSync(partPath)) {
            const partStat = fs.statSync(partPath);
            if (partStat.size > 0) {
                // Trust the .part file on disk — it is the ground truth.
                // The saved state may lag by up to 5MB (throttled persistence),
                // so we always use the actual file size as the resume point.
                resumeOffset = partStat.size;
                console.log(`[DownloadManager] Resuming ${fileName} from byte ${resumeOffset} (part file)`);
                // Sync the saved state to match reality
                if (stateId) {
                    transferState.updateTransferState(stateId, { bytesTransferred: resumeOffset });
                }
            }
        }

        // ── Synthesize virtual chunks for progress display ───────────────────
        const CHUNK_SIZE = 20 * 1024 * 1024;
        const totalChunks = totalSize > 0 ? Math.max(1, Math.ceil(totalSize / CHUNK_SIZE)) : 0;

        statusManager.startTransfer(transferId, fileName, 'download', totalSize, totalChunks);

        // Restore progress for already-downloaded bytes
        if (resumeOffset > 0 && totalSize > 0) {
            statusManager.updateProgress(transferId, (resumeOffset / totalSize) * 100, resumeOffset);
        }

        const abortCtrl = new AbortController();
        statusManager.registerAbortController(transferId, abortCtrl);

        // Persist / update state
        if (stateId) {
            transferState.updateTransferState(stateId, { status: 'active', bytesTransferred: resumeOffset });
        }

        try {
            const cmdParams = { Bucket: bucketName, Key: s3Key };
            if (resumeOffset > 0) {
                cmdParams.Range = `bytes=${resumeOffset}-`;
            }

            const data = await s3Client.send(
                new GetObjectCommand(cmdParams),
                { abortSignal: abortCtrl.signal }
            );

            // If we got a Content-Range back (206 Partial), extract the real total size
            // e.g. "bytes 500-999/1000" → totalSize = 1000
            if (resumeOffset > 0 && data.ContentRange) {
                const match = data.ContentRange.match(/\/(\d+)$/);
                if (match) {
                    const realTotal = parseInt(match[1], 10);
                    if (realTotal > totalSize) totalSize = realTotal;
                }
            }

            let downloaded = resumeOffset;

            const progressPassThrough = new (require('stream').PassThrough)();
            progressPassThrough.on('data', async (chunk) => {
                downloaded += chunk.length;
                if (totalSize > 0) {
                    const progress = (downloaded / totalSize) * 100;
                    statusManager.updateProgress(transferId, progress, downloaded);

                    if (totalChunks > 0) {
                        const currentChunkIndex = Math.min(totalChunks, Math.floor(downloaded / CHUNK_SIZE) + 1);
                        for (let i = 1; i < currentChunkIndex; i++) {
                            statusManager.updateChunk(transferId, i, 'done', 100);
                        }
                        const chunkStart = (currentChunkIndex - 1) * CHUNK_SIZE;
                        const chunkProgress = Math.min(100, ((downloaded - chunkStart) / CHUNK_SIZE) * 100);
                        statusManager.updateChunk(transferId, currentChunkIndex, 'active', chunkProgress);
                    }
                }

                // Throttled state persistence — every 5MB
                if (stateId && downloaded - resumeOffset > 0 && (downloaded % (5 * 1024 * 1024)) < chunk.length) {
                    transferState.updateTransferState(stateId, { bytesTransferred: downloaded });
                }

                // Pause support
                if (statusManager.isPaused(transferId)) {
                    progressPassThrough.pause();
                    await statusManager.checkPauseSignal(transferId);
                    progressPassThrough.resume();
                }
            });

            // Append to .part file (flag 'a' for resume, 'w' for fresh start)
            const writeFlag = resumeOffset > 0 ? 'a' : 'w';
            await pipeline(
                data.Body,
                progressPassThrough,
                fs.createWriteStream(partPath, { flags: writeFlag }),
                { signal: abortCtrl.signal }
            );

            // Atomic rename: .part → final path
            fs.renameSync(partPath, localPath);

            statusManager.completeTransfer(transferId, 'done');
            if (stateId) transferState.deleteTransferState(stateId);
            return true;

        } catch (error) {
            const isTerminated = statusManager.isTerminated(transferId);
            console.error('[DownloadManager] S3 Error:', isTerminated ? 'terminated by user' : error.message);
            statusManager.completeTransfer(transferId, isTerminated ? 'terminated' : 'error');

            // Persist failure so we can resume later — don't delete the .part file
            if (stateId && !isTerminated) {
                transferState.updateTransferState(stateId, { status: 'failed', error: error.message });
            }
            if (isTerminated) {
                // User explicitly cancelled — clean up
                if (stateId) transferState.deleteTransferState(stateId);
                try { if (fs.existsSync(partPath)) fs.unlinkSync(partPath); } catch {}
            }

            if (!isTerminated) throw error;
            return false;
        }
    }

    /**
     * Download from HTTP URL (no resume — HTTP servers vary in Range support)
     */
    async downloadFromUrl(url, targetDir) {
        const fileName = path.basename(url);
        const destination = path.join(targetDir, fileName);
        const transferId = `dl-${Date.now()}-${fileName}`;

        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(destination);
            https.get(url, (response) => {
                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlink(destination, () => {});
                    reject(`Server responded with ${response.statusCode}`);
                    return;
                }

                const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
                statusManager.startTransfer(transferId, fileName, 'download', totalBytes);
                let receivedBytes = 0;

                response.on('data', (chunk) => {
                    receivedBytes += chunk.length;
                    if (totalBytes > 0) {
                        statusManager.updateProgress(transferId, (receivedBytes / totalBytes) * 100, receivedBytes);
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close(() => {
                        statusManager.completeTransfer(transferId, 'done');
                        resolve({ success: true, path: destination });
                    });
                });

                file.on('error', (err) => {
                    fs.unlink(destination, () => {});
                    statusManager.completeTransfer(transferId, 'error');
                    reject(err.message);
                });
            }).on('error', (err) => {
                fs.unlink(destination, () => {});
                statusManager.completeTransfer(transferId, 'error');
                reject(err.message);
            });
        });
    }

    /**
     * Download from S3 by bucket ID (fetches credentials automatically).
     * Generates a deterministic stateId for resume tracking.
     */
    async downloadWithBucketId(bucketId, s3Key, localPath, totalSize = 0) {
        const credentialManager = require('../aws-credentials');
        const database = require('../database');

        const dbRes = await database.query(`
            SELECT b.region, b.name FROM "Bucket" b WHERE b.id = $1
        `, [bucketId]);

        if (dbRes.rows.length === 0) throw new Error('Bucket not found');

        const { region, name } = dbRes.rows[0];
        const credentials = await credentialManager.getCredentialsForBucket(bucketId);

        const s3 = new S3Client({
            region: credentials.region || region,
            credentials: {
                accessKeyId: credentials.accessKeyId,
                secretAccessKey: credentials.secretAccessKey,
                sessionToken: credentials.sessionToken,
            },
        });

        // Deterministic state ID — same file + bucket always maps to same record
        const stateId = `dl-${bucketId}-${Buffer.from(s3Key).toString('base64')}`;

        // Guard: if this exact file is already downloading, skip
        if (this._inFlight.has(stateId)) {
            console.log(`[DownloadManager] Already in-flight, skipping duplicate: ${s3Key}`);
            return true;
        }

        // If the file already exists locally and is complete (no .part file), skip entirely
        const partPath = localPath + '.part';
        const existingState = transferState.getTransferState(stateId);
        if (fs.existsSync(localPath) && !fs.existsSync(partPath)) {
            if (existingState) transferState.deleteTransferState(stateId);
            console.log(`[DownloadManager] Skipping already-downloaded file: ${s3Key}`);
            return true;
        }

        this._inFlight.add(stateId);
        try {
            // Ensure a TransferState row exists (idempotent)
            transferState.saveTransferState({
                id: stateId,
                type: 'download',
                bucketId,
                s3Key,
                localPath,
                totalSize,
                userId: authManager.getCurrentUserId(),
            });

            return await this.downloadFromS3(s3, name, s3Key, localPath, totalSize, stateId);
        } finally {
            this._inFlight.delete(stateId);
        }
    }
}

module.exports = new DownloadManager();
