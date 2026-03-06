const database = require('./database');
const axios = require('axios');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const syncHistory = require('./syncHistory');

const ROOT_PATH = process.env.ROOT_PATH || "/home/abhishek/FMS";
const API_URL = process.env.API_URL || "http://localhost:3000/api";
const SYNC_INTERVAL = 1000 * 60 * 5; // 5 minutes

class SyncManager {
    constructor() {
        this.syncIntervalId = null;
        this.authToken = null;
        this.isSyncing = false;
        this.onAuthExpired = null;
        /**
         * Shared reference to the Set in main.js.
         * Files added here are SKIPPED by the watcher's 'add' handler
         * so they are NOT re-uploaded after being downloaded by sync.
         */
        this.downloadingPaths = new Set();
    }

    /**
     * @param {string} token - JWT auth token
     * @param {Function} onAuthExpired - called when 401 is received
     * @param {Set<string>} downloadingPaths - shared Set with the watcher in main.js
     */
    init(token, onAuthExpired, downloadingPaths) {
        this.authToken = token;
        this.onAuthExpired = onAuthExpired;
        if (downloadingPaths) this.downloadingPaths = downloadingPaths;

        // Initialize the shared sync history logger with this token
        syncHistory.init(token);

        if (this.syncIntervalId) clearInterval(this.syncIntervalId);

        this.runSync(); // Immediate first sync
        this.syncIntervalId = setInterval(() => this.runSync(), 60000); // check every 1 min
        console.log('[SyncManager] Started config-based sync 1min clock');
    }

    reloadConfigs() {
        console.log('[SyncManager] Requested reload of configs. Running immediately.');
        this.runSync();
    }

    stop() {
        if (this.syncIntervalId) {
            clearInterval(this.syncIntervalId);
            this.syncIntervalId = null;
        }
        syncHistory.stop();
        this.authToken = null;
        this.isSyncing = false;
        console.log('[SyncManager] Stopped');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RUN SYNC CYCLE
    // ─────────────────────────────────────────────────────────────────────────

    async runSync() {
        if (this.isSyncing || !this.authToken) return;
        this.isSyncing = true;

        try {
            await this.syncAll();
            await this.syncConfigs();
        } catch (error) {
            console.error('[SyncManager] Cycle Error:', error.message);
            if (error.response?.status === 401) {
                this.stop();
                if (this.onAuthExpired) this.onAuthExpired();
            }
        } finally {
            // Flush all buffered activities (downloads + skips from this cycle)
            await syncHistory.flush();
            this.isSyncing = false;
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MAIN SYNC ENTRY POINT — fetches from Global DB and downloads missing files
    // ─────────────────────────────────────────────────────────────────────────

    async syncAll() {
        // Build incremental sync param — pass lastSyncedAt if we have one
        const lastSyncRow = await database.query(
            `SELECT value FROM "KVStore" WHERE key = 'lastFullSyncAt' LIMIT 1`
        ).catch(() => ({ rows: [] }));
        const lastSyncAt = lastSyncRow.rows[0]?.value || null;

        const params = lastSyncAt ? `?updatedSince=${encodeURIComponent(lastSyncAt)}` : '';
        const response = await axios.get(`${API_URL}/agent/sync${params}`, {
            headers: { Authorization: `Bearer ${this.authToken}` }
        });

        const { tenants, accounts, syncedAt } = response.data;

        // 1. Sync Tenants into local DB
        for (const tenant of (tenants || [])) {
            await database.query(`
                INSERT INTO "Tenant" (id, name, "updatedAt")
                VALUES ($1, $2, $3)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    "updatedAt" = EXCLUDED."updatedAt"
            `, [tenant.id, tenant.name, tenant.updatedAt || new Date().toISOString()]);
        }

        // 2. Sync Accounts — NO raw IAM credentials stored locally.
        //    Agent uses /api/agent/credentials for short-lived STS tokens.
        for (const account of (accounts || [])) {
            await database.query(`
                INSERT INTO "Account" (id, name, "tenantId", "updatedAt")
                VALUES ($1, $2, $3, $4)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    "updatedAt" = EXCLUDED."updatedAt"
            `, [
                account.id, account.name,
                account.tenantId,
                account.updatedAt || new Date().toISOString()
            ]);

            console.log(`[SyncManager] Account synced: ${account.name}`);

            // 3. For each bucket — upsert metadata to local DB
            for (const bucket of (account.buckets || [])) {
                await this.upsertBucketMetadata(bucket);
            }
        }

        // 4. Persist the server-returned syncedAt for next incremental sync
        if (syncedAt) {
            await database.query(`
                INSERT INTO "KVStore" (key, value) VALUES ('lastFullSyncAt', $1)
                ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
            `, [syncedAt]).catch(() => {
                // KVStore table may not exist on older installs — non-fatal
                console.warn('[SyncManager] Could not persist lastFullSyncAt — KVStore table missing?');
            });
        }
    }

    async syncConfigs() {
        // Auto-release stale locks: if isSyncing=1 but lastSync is >30 min ago,
        // the app likely crashed mid-sync. Force-release to unblock.
        await database.query(`
            UPDATE "SyncConfig"
            SET "isSyncing" = 0
            WHERE "isSyncing" = 1
              AND "lastSync" IS NOT NULL
              AND "lastSync" < datetime('now', '-30 minutes')
        `);

        // Read configs that need sync (respecting interval)
        const configs = await database.query(`
            SELECT * FROM "SyncConfig" 
            WHERE "isActive" = 1 AND "isSyncing" = 0 AND
            ("lastSync" IS NULL OR "lastSync" < datetime('now', '-' || "intervalMinutes" || ' minutes'))
        `);

        for (const config of configs.rows) {
            // Per-config lock — double-check it's still unlocked before acquiring
            const preCheck = await database.query(
                `SELECT id FROM "SyncConfig" WHERE id = $1 AND "isSyncing" = 0`,
                [config.id]
            );
            if (preCheck.rows.length === 0) {
                console.log(`[SyncManager] Config "${config.name}" is already syncing, skipping.`);
                continue;
            }
            await database.query(
                `UPDATE "SyncConfig" SET "isSyncing" = 1 WHERE id = $1 AND "isSyncing" = 0`,
                [config.id]
            );

            const direction = config.direction || 'DOWNLOAD';
            console.log(`[SyncManager] Running scheduled sync config: ${config.name} (direction: ${direction})`);
            
            const jobId = 'job-' + Date.now();
            await database.query(
                `INSERT INTO "SyncJob" (id, "configId", status, "startTime") VALUES ($1, $2, $3, datetime('now'))`,
                [jobId, config.id, 'RUNNING']
            );

            let filesHandled = 0;
            try {
                const mappings = await database.query('SELECT * FROM "SyncMapping" WHERE "configId" = $1', [config.id]);
                for (const map of mappings.rows) {
                    const filesQuery = await database.query('SELECT * FROM "FileObject" WHERE "bucketId" = $1', [map.bucketId]);
                    const bucketMock = {
                        id: map.bucketId,
                        name: (await database.query('SELECT name FROM "Bucket" WHERE id = $1', [map.bucketId])).rows[0]?.name,
                        files: filesQuery.rows
                    };
                    if (!bucketMock.name) continue;

                    if (direction === 'DOWNLOAD') {
                        // Download mode: mirror + preserve (never delete local files)
                        const dl = await this.syncBucketToLocal(bucketMock, map.localPath, config.id, jobId);
                        filesHandled += dl;
                    } else if (direction === 'UPLOAD') {
                        // Upload mode: scan local → push to cloud
                        const ul = await this.syncLocalToBucket(bucketMock, map.localPath, config.id, jobId);
                        filesHandled += ul;
                    }
                }
                await database.query(
                    `UPDATE "SyncJob" SET status = $1, "endTime" = datetime('now'), "filesHandled" = $2 WHERE id = $3`,
                    ['COMPLETED', filesHandled, jobId]
                );
            } catch (err) {
                console.error(`[SyncManager] SyncJob ${jobId} failed:`, err);
                await database.query(
                    `UPDATE "SyncJob" SET status = $1, "endTime" = datetime('now'), error = $2 WHERE id = $3`,
                    ['FAILED', err.message, jobId]
                );
            } finally {
                // Always release the lock
                await database.query(`UPDATE "SyncConfig" SET "isSyncing" = 0, "lastSync" = datetime('now') WHERE id = $1`, [config.id]);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PER-BUCKET SYNC: upsert metadata + download missing files
    // ─────────────────────────────────────────────────────────────────────────

    async upsertBucketMetadata(bucket) {
        // Upsert bucket record into local DB
        await database.query(`
            INSERT INTO "Bucket" (id, name, region, "accountId", "updatedAt")
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                region = EXCLUDED.region,
                "updatedAt" = EXCLUDED."updatedAt"
        `, [bucket.id, bucket.name, bucket.region, bucket.accountId, bucket.updatedAt || new Date().toISOString()]);

        const files = bucket.files || [];
        for (const file of files) {
            if (!file.key) continue;

            // Upsert FileObject into local DB so search works
            await database.query(`
                INSERT INTO "FileObject" (id, name, key, "isFolder", size, "mimeType", "bucketId", "updatedAt", "isSynced", "lastSyncedAt", "remoteEtag")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, datetime('now'), $9)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    key = EXCLUDED.key,
                    "isFolder" = EXCLUDED."isFolder",
                    size = EXCLUDED.size,
                    "mimeType" = EXCLUDED."mimeType",
                    "updatedAt" = EXCLUDED."updatedAt",
                    "remoteEtag" = EXCLUDED."remoteEtag",
                    "isSynced" = 1,
                    "lastSyncedAt" = datetime('now')
            `, [
                file.id || `${bucket.id}-${file.key}`,
                file.name || file.key.split('/').pop() || file.key,
                file.key,
                file.isFolder ? 1 : 0,
                file.size || null,
                file.mimeType || null,
                bucket.id,
                file.updatedAt || new Date().toISOString(),
                file.eTag || file.etag || null
            ]);
        }
    }

    async syncBucketToLocal(bucket, rootFolder, configId, syncJobId = null) {
        // Ensure local root folder exists
        if (!fs.existsSync(rootFolder)) {
            fs.mkdirSync(rootFolder, { recursive: true });
        }

        const files = bucket.files || [];
        let downloadCount = 0;
        let skippedCount = 0;

        for (const file of files) {
            if (!file.key) continue;

            // Upsert FileObject into local DB so search works
            await database.query(`
                INSERT INTO "FileObject" (id, name, key, "isFolder", size, "mimeType", "bucketId", "updatedAt", "isSynced", "lastSyncedAt", "remoteEtag")
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 1, datetime('now'), $9)
                ON CONFLICT (id) DO UPDATE SET
                    name = EXCLUDED.name,
                    key = EXCLUDED.key,
                    "isFolder" = EXCLUDED."isFolder",
                    size = EXCLUDED.size,
                    "mimeType" = EXCLUDED."mimeType",
                    "updatedAt" = EXCLUDED."updatedAt",
                    "remoteEtag" = EXCLUDED."remoteEtag",
                    "isSynced" = 1,
                    "lastSyncedAt" = datetime('now')
            `, [
                file.id || `${bucket.id}-${file.key}`,
                file.name || file.key.split('/').pop() || file.key,
                file.key,
                file.isFolder ? 1 : 0,
                file.size || null,
                file.mimeType || null,
                bucket.id,
                file.updatedAt || new Date().toISOString(),
                file.eTag || file.etag || null
            ]);

            if (file.isFolder) {
                // Ensure the local directory exists
                const dirPath = path.join(rootFolder, file.key.replace(/\/$/, ''));
                if (!fs.existsSync(dirPath)) {
                    fs.mkdirSync(dirPath, { recursive: true });
                }
                continue;
            }

            // Build the expected local path for this file
            const localFilePath = path.join(rootFolder, file.key);

            // Check if the file already exists locally with matching size/ETag
            const existsLocally = fs.existsSync(localFilePath);
            if (existsLocally) {
                const localStat = fs.statSync(localFilePath);
                
                // Get the DB record for the local file's known ETag
                const dbFile = await database.query('SELECT "localEtag" FROM "FileObject" WHERE key = $1 AND "bucketId" = $2', [file.key, bucket.id]);
                const localEtagSaved = dbFile.rows[0]?.localEtag;
                
                const rawRemoteEtag = file.eTag || file.etag;
                const remoteEtag = rawRemoteEtag ? rawRemoteEtag.replace(/"/g, '') : null;
                
                let isMatch = false;
                
                if (remoteEtag && localEtagSaved && remoteEtag === localEtagSaved) {
                    isMatch = true;
                } else if (file.size && localStat.size === parseInt(file.size)) {
                    // Fallback to size if ETags aren't fully populated yet, but compute and save localEtag for future if remote is present
                    if (remoteEtag && !remoteEtag.includes('-')) {
                        try {
                            const newLocalHash = await this._computeFileHash(localFilePath);
                            if (newLocalHash === remoteEtag) {
                                isMatch = true;
                                await database.query('UPDATE "FileObject" SET "localEtag" = $1 WHERE key = $2 AND "bucketId" = $3', [newLocalHash, file.key, bucket.id]);
                            } else {
                                isMatch = false; // Size matched but contents changed
                            }
                        } catch(e) {}
                    } else {
                        isMatch = true; // Fallback to purely size match (e.g. multipart S3 files)
                    }
                }
                
                if (isMatch) {
                    skippedCount++;
                    continue; // Already synced
                }
                console.log(`[SyncManager] File mismatched, re-downloading: ${file.key}`);
            }

            // File is missing or corrupted locally — download from S3 via presigned URL
            try {
                await this.downloadFile(bucket, file, localFilePath);
                downloadCount++;
                await syncHistory.logActivity('DOWNLOAD', file.key, 'SUCCESS', null, configId, syncJobId);
            } catch (err) {
                console.error(`[SyncManager] Failed to download ${file.key}:`, err.message);
                await syncHistory.logActivity('DOWNLOAD', file.key, 'FAILED', err.message, configId, syncJobId);
            }
        }

        if (files.length > 0) {
            console.log(`[SyncManager] Bucket "${bucket.name}": ${files.length} remote files, ${downloadCount} downloaded, ${skippedCount} already local`);
        }
        return downloadCount;
    }

    async syncLocalToBucket(bucket, rootFolder, configId, syncJobId = null) {
        if (!fs.existsSync(rootFolder)) return;

        // Recursively find all files in rootFolder
        const walk = async (dir) => {
            let results = [];
            const list = await fsPromises.readdir(dir, { withFileTypes: true });
            for (let e of list) {
                const fullPath = path.join(dir, e.name);
                if (e.isDirectory()) {
                    results = results.concat(await walk(fullPath));
                } else {
                    results.push(fullPath);
                }
            }
            return results;
        };

        const localFiles = await walk(rootFolder);
        const remoteKeys = new Set(bucket.files.map(f => f.key));

        let uploadCount = 0;
        const uploadQueue = require('./transfers/queue');

        for (const localPath of localFiles) {
            const relativePath = path.relative(rootFolder, localPath);
            const s3Key = relativePath.split(path.sep).join('/');

            let shouldUpload = false;

            if (!remoteKeys.has(s3Key)) {
                shouldUpload = true; // Missing from S3 entirely
            } else {
                // Check if local file has been modified since it was last synced
                try {
                    const localStat = fs.statSync(localPath);
                    const dbFile = await database.query('SELECT size, "updatedAt" FROM "FileObject" WHERE key = $1 AND "bucketId" = $2', [s3Key, bucket.id]);
                    const record = dbFile.rows[0];
                    if (record) {
                        const sizeMismatched = Array.isArray(record.size) || record.size ? parseInt(record.size) !== localStat.size : false;
                        const timeMismatched = record.updatedAt ? new Date(record.updatedAt).getTime() < localStat.mtime.getTime() : false;
                        
                        if (sizeMismatched || timeMismatched) {
                            shouldUpload = true;
                        }
                    } else {
                        shouldUpload = true; // Edge case: not in DB but exists
                    }
                } catch(e) {}
            }

            if (shouldUpload) {
                console.log(`[SyncManager] Local file missing in S3 or modified locally, queueing upload: ${s3Key}`);
                uploadQueue.addUploadTask(bucket.id, localPath, s3Key, null, configId, syncJobId);
                uploadCount++;
            }
        }

        if (uploadCount > 0) {
            console.log(`[SyncManager] Bucket "${bucket.name}": Queued ${uploadCount} missing/modified files from local folder ${rootFolder}`);
        }
        return uploadCount;
    }

    // ─────────────────────────────────────────────────────────────────────────
    // DOWNLOAD A SINGLE FILE (with watcher guard to prevent re-upload loop)
    // Uses DownloadManager.downloadWithBucketId() which fetches short-lived
    // STS credentials via /api/agent/credentials — same cross-account flow as uploads.
    // ─────────────────────────────────────────────────────────────────────────

    async downloadFile(bucket, file, localFilePath) {
        // Ensure parent directory exists
        const dir = path.dirname(localFilePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Register in watcher guard BEFORE writing so the watcher skips re-uploading
        this.downloadingPaths.add(localFilePath);

        try {
            console.log(`[SyncManager] Downloading via STS: ${file.key} → ${path.basename(localFilePath)}`);

            // Use DownloadManager which fetches cross-account STS credentials
            const downloadManager = require('./transfers/download');
            await downloadManager.downloadWithBucketId(bucket.id, file.key, localFilePath, file.size || 0);

            // Calculate local ETag after download for future sync comparisons
            try {
                const downloadedHash = await this._computeFileHash(localFilePath);
                await database.query(
                    'UPDATE "FileObject" SET "localEtag" = $1 WHERE key = $2 AND "bucketId" = $3',
                    [downloadedHash, file.key, bucket.id]
                );
            } catch(e) {
                console.error(`[SyncManager] Failed to compute ETag for ${file.key}:`, e.message);
            }

            console.log(`[SyncManager] Downloaded: ${file.key}`);

        } catch (err) {
            throw err;
        } finally {
            // Remove from watcher guard after chokidar's awaitWriteFinish stability window
            setTimeout(() => {
                this.downloadingPaths.delete(localFilePath);
            }, 3000);
        }
    }


    _computeFileHash(filePath) {
        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5');
            const stream = fs.createReadStream(filePath);
            stream.on('data', data => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }
}

module.exports = new SyncManager();

        return new Promise((resolve, reject) => {
            const hash = crypto.createHash('md5');
            const stream = fs.createReadStream(filePath);
            stream.on('data', data => hash.update(data));
            stream.on('end', () => resolve(hash.digest('hex')));
            stream.on('error', reject);
        });
    }
}

module.exports = new SyncManager();
