const database = require('./database');
const axios = require('axios');
const fs = require('fs');
const fsPromises = require('fs/promises');
const path = require('path');
const crypto = require('crypto');
const syncHistory = require('./syncHistory');

let ROOT_PATH;
try {
  const { app } = require('electron');
  const { getRootPath } = require('./config');
  ROOT_PATH = getRootPath();
} catch {
  ROOT_PATH = require('./config').getRootPath();
}
const { ENTERPRISE_URL } = require('./config');
const API_URL = ENTERPRISE_URL + '/api';
const SYNC_INTERVAL = 1000 * 60 * 5; // 5 minutes

class SyncManager {
    constructor() {
        this.syncIntervalId = null;
        this.authToken = null;
        this.isSyncing = false;
        this.isSyncingConfigs = false; // separate guard so uploads aren't blocked by slow syncAll
        this.onAuthExpired = null;
        this.userId = null;
        this.botId = null;
        /** Generation counter — incremented on every init(). Stale cycles check this
         *  to bail out early if a new identity has taken over mid-flight. */
        this._generation = 0;
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
     * @param {string} [userId] - user email/id for scoping history
     * @param {string} [botId] - bot id for scoping history
     */
    init(token, onAuthExpired, downloadingPaths, userId = null, botId = null) {
        // Prevent duplicate init with the same token — avoids stacking intervals
        if (this.syncIntervalId && this.authToken === token && this.userId === userId) {
            console.log('[SyncManager] Already initialized with same token/user — skipping duplicate init');
            return false;
        }

        // Full stop: kill interval, abort any in-flight sync, reset state
        this.stop();
        this._generation++;

        this.authToken = token;
        this.onAuthExpired = onAuthExpired;
        this.userId = userId;
        this.botId = botId;
        if (downloadingPaths) this.downloadingPaths = downloadingPaths;

        // Initialize the shared sync history logger with this token + identity
        syncHistory.init(token, userId, botId);

        this.runSync(); // Immediate first sync
        this.syncIntervalId = setInterval(() => this.runSync(), 60000); // check every 1 min
        console.log('[SyncManager] Started config-based sync 1min clock');
        return true;
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
        this.userId = null;
        this.botId = null;
        this.isSyncing = false;
        console.log('[SyncManager] Stopped');
    }

    // ─────────────────────────────────────────────────────────────────────────
    // RUN SYNC CYCLE
    // ─────────────────────────────────────────────────────────────────────────

    async runSync() {
        if (this.isSyncing || !this.authToken) return;
        this.isSyncing = true;
        const gen = this._generation;

        try {
            await this.syncAll();
            // If identity changed mid-cycle, don't continue with stale context
            if (gen !== this._generation) return;
            await this.syncConfigs();
        } catch (error) {
            if (gen !== this._generation) return; // stale cycle, ignore errors
            console.error('[SyncManager] Cycle Error:', error.message);
            if (error.response?.status === 401) {
                this.stop();
                if (this.onAuthExpired) this.onAuthExpired();
            }
        } finally {
            if (gen === this._generation) {
                // Only flush/reset for the CURRENT generation
                await syncHistory.flush();
                this.isSyncing = false;
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // MAIN SYNC ENTRY POINT — fetches from Global DB and downloads missing files
    // ─────────────────────────────────────────────────────────────────────────

    async syncAll() {
        // Refresh userId AND token from auth store — ensures we always use the
        // freshest identity, especially when called directly by sync-buckets-now
        try {
            const authManager = require('./auth');
            const session = authManager.getSession();
            const freshUserId = session?.email || session?.username || null;
            const freshToken = session?.idToken || session?.accessToken || null;
            if (freshUserId && freshUserId !== this.userId) {
                console.log(`[SyncManager] Refreshed userId: ${this.userId} → ${freshUserId}`);
                this.userId = freshUserId;
            }
            if (freshToken && freshToken !== this.authToken) {
                console.log(`[SyncManager] Refreshed authToken for user: ${freshUserId}`);
                this.authToken = freshToken;
            }
        } catch (err) {
            console.warn('[SyncManager] Could not refresh userId from auth store:', err.message);
        }

        // Guard: refuse to sync without a userId — prevents orphaned rows
        if (!this.userId) {
            console.warn('[SyncManager] syncAll aborted — no userId available. Data would be orphaned.');
            return;
        }

        // Build incremental sync param — use user-scoped KVStore key
        const kvKey = this.userId ? `lastFullSyncAt:${this.userId}` : 'lastFullSyncAt';
        let lastSyncRow = { rows: [] };
        try {
            lastSyncRow = database.query(
                `SELECT value FROM "KVStore" WHERE key = $1 LIMIT 1`,
                [kvKey]
            );
        } catch (err) {
            console.warn('[SyncManager] Could not fetch lastFullSyncAt:', err.message);
        }
        const lastSyncAt = lastSyncRow.rows[0]?.value || null;

        const params = lastSyncAt ? `?updatedSince=${encodeURIComponent(lastSyncAt)}` : '';
        let response;
        try {
            response = await axios.get(`${API_URL}/agent/sync${params}`, {
                headers: { Authorization: `Bearer ${this.authToken}` }
            });
        } catch (err) {
            throw err;
        }

        const { tenants, accounts, buckets, syncedAt } = response.data;

        console.log(`[SyncManager] syncAll response — tenants: ${(tenants||[]).length}, accounts: ${(accounts||[]).length}, buckets: ${(buckets||[]).length}, syncedAt: ${syncedAt}`);

        // 1. Sync Tenants into local DB (scoped to current user)
        for (const tenant of (tenants || [])) {
            try {
                database.query(`
                    INSERT INTO "Tenant" (id, name, "userId", "updatedAt")
                    VALUES ($1, $2, $3, $4)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        "userId" = EXCLUDED."userId",
                        "updatedAt" = EXCLUDED."updatedAt"
                `, [tenant.id, tenant.name, this.userId, tenant.updatedAt || new Date().toISOString()]);
                console.log(`[SyncManager] Tenant upserted: ${tenant.name} (${tenant.id})`);
            } catch (err) {
                console.error(`[SyncManager] Tenant upsert failed for "${tenant.name}":`, err.message);
            }
        }

        // 2. Sync Accounts (scoped to current user)
        for (const account of (accounts || [])) {
            try {
                const tenantExists = database.query(`SELECT id FROM "Tenant" WHERE id = $1`, [account.tenantId]);
                if (tenantExists.rows.length === 0) {
                    database.query(`
                        INSERT INTO "Tenant" (id, name, "userId", "updatedAt") VALUES ($1, $2, $3, $4)
                        ON CONFLICT (id) DO NOTHING
                    `, [account.tenantId, account.tenantId, this.userId, new Date().toISOString()]);
                }
                database.query(`
                    INSERT INTO "Account" (id, name, "tenantId", "userId", "updatedAt")
                    VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        "userId" = EXCLUDED."userId",
                        "updatedAt" = EXCLUDED."updatedAt"
                `, [account.id, account.name, account.tenantId, this.userId, account.updatedAt || new Date().toISOString()]);
                console.log(`[SyncManager] Account upserted: ${account.name}`);
            } catch (err) {
                console.error(`[SyncManager] Account upsert failed for "${account.name}":`, err.message);
            }
        }

        // 3. Sync top-level buckets — reconcile only for THIS user's data
        if (!lastSyncAt && Array.isArray(buckets)) {
            const returnedIds = buckets.map(b => b.id).filter(Boolean);
            if (this.userId) {
                if (returnedIds.length > 0) {
                    // Delete this user's buckets that are no longer in the API response
                    database.queryWithArrayParam(
                        `DELETE FROM "Bucket" WHERE "userId" = $1 AND id NOT IN (${returnedIds.map((_, i) => `$${i + 2}`).join(', ')})`,
                        returnedIds,
                        [this.userId]
                    );
                } else {
                    database.query(`DELETE FROM "Bucket" WHERE "userId" = $1`, [this.userId]);
                }
            }
            console.log(`[SyncManager] Reconciled local buckets for user ${this.userId} — kept IDs: [${returnedIds.join(', ')}]`);
        }

        for (const bucket of (buckets || [])) {
            try {
                const accountId = bucket.awsAccountId || bucket.accountId || bucket.tenantId;

                // Ensure a matching Account row exists (synthetic if needed)
                const accountExists = database.query(`SELECT id FROM "Account" WHERE id = $1`, [accountId]);
                if (accountExists.rows.length === 0) {
                    const tenantId = bucket.tenantId;
                    if (tenantId) {
                        database.query(`
                            INSERT INTO "Tenant" (id, name, "userId", "updatedAt") VALUES ($1, $2, $3, $4)
                            ON CONFLICT (id) DO NOTHING
                        `, [tenantId, tenantId, this.userId, new Date().toISOString()]);
                    }
                    database.query(`
                        INSERT INTO "Account" (id, name, "tenantId", "userId", "updatedAt")
                        VALUES ($1, $2, $3, $4, $5)
                        ON CONFLICT (id) DO NOTHING
                    `, [accountId, accountId, tenantId || accountId, this.userId, new Date().toISOString()]);
                    console.log(`[SyncManager] Synthetic account created for bucket "${bucket.name}": ${accountId}`);
                }

                bucket.accountId = accountId;
                await this.upsertBucketMetadata(bucket);
                console.log(`[SyncManager] Bucket upserted: ${bucket.name} (${bucket.id})`);
            } catch (err) {
                console.error(`[SyncManager] Bucket upsert failed for "${bucket.name}":`, err.message);
            }
        }

        // 4. Persist the server-returned syncedAt under user-scoped key
        if (syncedAt) {
            try {
                database.query(`
                    INSERT INTO "KVStore" (key, value) VALUES ($1, $2)
                    ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
                `, [kvKey, syncedAt]);
            } catch (err) {
                console.warn('[SyncManager] Could not persist lastFullSyncAt — KVStore table missing?');
            }
        }
    }

    /**
     * Fetch live remote file listing from Parent DB API for a specific bucket.
     * Returns array of { key, size, eTag, ... } objects.
     * Returns null on failure (network error, 401) to signal fallback to local DB.
     */
    async fetchRemoteFiles(bucketId) {
        try {
            const response = await axios.get(`${API_URL}/agent/sync?bucketId=${bucketId}`, {
                headers: { Authorization: `Bearer ${this.authToken}` }
            });

            if (response.data && response.data.buckets && response.data.buckets.length > 0) {
                const bucket = response.data.buckets[0];
                return bucket.files || [];
            }

            return []; // Bucket exists but has no files
        } catch (err) {
            console.warn(`[SyncManager] Parent DB API unreachable for bucket ${bucketId}:`, err.message);
            return null; // Signal fallback to local DB
        }
    }

    async syncConfigs() {
        // Auto-release stale locks: if isSyncing=1 but lastSync is >30 min ago,
        // the app likely crashed mid-sync. Force-release to unblock.
        database.query(`
            UPDATE "SyncConfig"
            SET "isSyncing" = 0
            WHERE "isSyncing" = 1
              AND "lastSync" IS NOT NULL
              AND "lastSync" < datetime('now', '-30 minutes')
        `);

        // Read configs that need sync (respecting interval)
        const configQuery = this.userId
            ? `SELECT * FROM "SyncConfig" 
               WHERE "isActive" = 1 AND "isSyncing" = 0 AND
               ("userId" = $1 OR "userId" IS NULL) AND
               ("lastSync" IS NULL OR "lastSync" < datetime('now', '-' || "intervalMinutes" || ' minutes'))`
            : `SELECT * FROM "SyncConfig" 
               WHERE "isActive" = 1 AND "isSyncing" = 0 AND
               ("lastSync" IS NULL OR "lastSync" < datetime('now', '-' || "intervalMinutes" || ' minutes'))`;
        const configParams = this.userId ? [this.userId] : [];
        const configs = database.query(configQuery, configParams);

        for (const config of configs.rows) {
            // Per-config lock — double-check it's still unlocked before acquiring
            const preCheck = database.query(
                `SELECT id FROM "SyncConfig" WHERE id = $1 AND "isSyncing" = 0`,
                [config.id]
            );
            if (preCheck.rows.length === 0) {
                console.log(`[SyncManager] Config "${config.name}" is already syncing, skipping.`);
                continue;
            }
            database.query(
                `UPDATE "SyncConfig" SET "isSyncing" = 1 WHERE id = $1 AND "isSyncing" = 0`,
                [config.id]
            );

            const direction = config.direction || 'DOWNLOAD';
            console.log(`[SyncManager] Running scheduled sync config: ${config.name} (direction: ${direction})`);
            
            const jobId = 'job-' + Date.now();
            database.query(
                `INSERT INTO "SyncJob" (id, "configId", status, "startTime") VALUES ($1, $2, $3, datetime('now'))`,
                [jobId, config.id, 'RUNNING']
            );

            let filesHandled = 0;
            try {
                const mappings = database.query('SELECT * FROM "SyncMapping" WHERE "configId" = $1', [config.id]);
                for (const map of mappings.rows) {
                    const bucketNameResult = database.query('SELECT name FROM "Bucket" WHERE id = $1', [map.bucketId]);
                    const bucketName = bucketNameResult.rows[0]?.name;
                    if (!bucketName) continue;

                    let bucketFiles;
                    if (direction === 'UPLOAD') {
                        // UPLOAD mode: fetch live remote listing from Parent DB API
                        bucketFiles = await this.fetchRemoteFiles(map.bucketId);
                        if (bucketFiles === null) {
                            // Fallback to local DB on API failure
                            console.warn(`[SyncManager] Parent DB API unreachable, falling back to local DB for bucket ${map.bucketId}`);
                            const filesQuery = database.query('SELECT * FROM "FileObject" WHERE "bucketId" = $1', [map.bucketId]);
                            bucketFiles = filesQuery.rows;
                        }
                    } else {
                        // DOWNLOAD mode: use local DB (unchanged)
                        const filesQuery = database.query('SELECT * FROM "FileObject" WHERE "bucketId" = $1', [map.bucketId]);
                        bucketFiles = filesQuery.rows;
                    }

                    const bucketMock = {
                        id: map.bucketId,
                        name: bucketName,
                        files: bucketFiles
                    };

                    if (direction === 'DOWNLOAD') {
                        // Download mode: mirror + preserve (never delete local files)
                        const dl = await this.syncBucketToLocal(bucketMock, map.localPath, config.id, jobId);
                        filesHandled += dl;
                    } else if (direction === 'UPLOAD') {
                        // Upload mode: scan local → push to cloud (zip if mapping requests it)
                        const shouldZip = map.shouldZip === 1 || map.shouldZip === true;
                        const ul = await this.syncLocalToBucket(bucketMock, map.localPath, config.id, jobId, shouldZip);
                        filesHandled += ul;
                    }
                }
                database.query(
                    `UPDATE "SyncJob" SET status = $1, "endTime" = datetime('now'), "filesHandled" = $2 WHERE id = $3`,
                    ['COMPLETED', filesHandled, jobId]
                );
            } catch (err) {
                console.error(`[SyncManager] SyncJob ${jobId} failed:`, err);
                database.query(
                    `UPDATE "SyncJob" SET status = $1, "endTime" = datetime('now'), error = $2 WHERE id = $3`,
                    ['FAILED', err.message, jobId]
                );
            } finally {
                // Always release the lock
                database.query(`UPDATE "SyncConfig" SET "isSyncing" = 0, "lastSync" = datetime('now') WHERE id = $1`, [config.id]);
            }
        }
    }

    // ─────────────────────────────────────────────────────────────────────────
    // PER-BUCKET SYNC: upsert metadata + download missing files
    // ─────────────────────────────────────────────────────────────────────────

    async upsertBucketMetadata(bucket) {
        // Upsert bucket record into local DB (scoped to current user)
        database.query(`
            INSERT INTO "Bucket" (id, name, region, "accountId", "awsAccountId", "userId", "updatedAt")
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO UPDATE SET
                name = EXCLUDED.name,
                region = EXCLUDED.region,
                "awsAccountId" = EXCLUDED."awsAccountId",
                "userId" = EXCLUDED."userId",
                "updatedAt" = EXCLUDED."updatedAt"
        `, [bucket.id, bucket.name, bucket.region, bucket.accountId, bucket.awsAccountId || null, this.userId, bucket.updatedAt || new Date().toISOString()]);

        const files = bucket.files || [];
        for (const file of files) {
            if (!file.key) continue;
            try {
                database.query(`
                    INSERT INTO "FileObject" (id, name, key, "isFolder", size, "mimeType", "bucketId", "userId", "updatedAt", "isSynced", "lastSyncedAt", "remoteEtag")
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1, datetime('now'), $10)
                    ON CONFLICT (id) DO UPDATE SET
                        name = EXCLUDED.name,
                        key = EXCLUDED.key,
                        "isFolder" = EXCLUDED."isFolder",
                        size = EXCLUDED.size,
                        "mimeType" = EXCLUDED."mimeType",
                        "userId" = EXCLUDED."userId",
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
                    this.userId,
                    file.updatedAt || new Date().toISOString(),
                    file.eTag || file.etag || null
                ]);
            } catch (err) {
                console.error(`[SyncManager] FileObject upsert failed for key "${file.key}":`, err.message);
            }
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
            database.query(`
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
                const dbFile = database.query('SELECT "localEtag" FROM "FileObject" WHERE key = $1 AND "bucketId" = $2', [file.key, bucket.id]);
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
                                database.query('UPDATE "FileObject" SET "localEtag" = $1 WHERE key = $2 AND "bucketId" = $3', [newLocalHash, file.key, bucket.id]);
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

    async syncLocalToBucket(bucket, rootFolder, configId, syncJobId = null, shouldZip = false) {
        if (!fs.existsSync(rootFolder)) return 0;

        const uploadQueue = require('./transfers/queue');

        // ── ZIP MODE: zip the whole folder, upload a single .zip ─────────────
        if (shouldZip) {
            const os = require('os');
            const archiver = require('archiver');
            const folderName = path.basename(rootFolder);
            const zipName = `${folderName}.zip`;
            const tempZip = path.join(os.tmpdir(), `fms_sync_${Date.now()}_${zipName}`);

            const statusManager = require('./transfers/status');
            const transferId = `zip-${Date.now()}-${zipName}`;
            statusManager.startTransfer(transferId, zipName, 'zip');

            // Compute total size for progress
            let totalBytes = 0;
            const walkSize = async (dir) => {
                const entries = await fsPromises.readdir(dir, { withFileTypes: true });
                for (const e of entries) {
                    const full = path.join(dir, e.name);
                    if (e.isDirectory()) await walkSize(full);
                    else { try { totalBytes += (await fsPromises.stat(full)).size; } catch {} }
                }
            };
            try { await walkSize(rootFolder); } catch {}

            try {
                await new Promise((resolve, reject) => {
                    const output = fs.createWriteStream(tempZip);
                    const archive = archiver('zip', { zlib: { level: 6 } });
                    let processedBytes = 0;

                    archive.on('entry', (entry) => {
                        processedBytes += entry.stats?.size || 0;
                        if (totalBytes > 0) {
                            const pct = Math.min(99, (processedBytes / totalBytes) * 100);
                            statusManager.updateProgress(transferId, pct, processedBytes);
                        }
                    });

                    output.on('close', resolve);
                    archive.on('error', reject);
                    archive.pipe(output);
                    archive.directory(rootFolder, folderName);
                    archive.finalize();
                });

                statusManager.completeTransfer(transferId, 'done');
                console.log(`[SyncManager] Zipped "${folderName}" → ${tempZip}`);
                await syncHistory.logActivity('ZIP', zipName, 'SUCCESS', null, configId, syncJobId);

                // Check if remote zip exists and has same size — skip if unchanged
                const remoteZip = (bucket.files || []).find(f => f.key === zipName);
                const localZipSize = fs.statSync(tempZip).size;
                const remoteSize = remoteZip?.size ? parseInt(remoteZip.size) : null;

                if (remoteSize !== null && remoteSize === localZipSize) {
                    console.log(`[SyncManager] Zip unchanged, skipping upload: ${zipName}`);
                    fs.unlinkSync(tempZip);
                    return 0;
                }

                uploadQueue.addUploadTask(bucket.id, tempZip, zipName, 'application/zip', configId, syncJobId);
                console.log(`[SyncManager] Queued zip upload: ${zipName} → s3://${bucket.name}/${zipName}`);
                return 1;

            } catch (err) {
                statusManager.completeTransfer(transferId, 'error');
                console.error(`[SyncManager] Zip failed for "${folderName}":`, err.message);
                await syncHistory.logActivity('ZIP', zipName, 'FAILED', err.message, configId, syncJobId);
                return 0;
            }
        }

        // ── NORMAL MODE: walk files, upload changed/missing ones ─────────────
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
        const remoteFiles = bucket.files || [];
        const remoteFileMap = new Map(remoteFiles.map(f => [f.key, f]));

        let uploadCount = 0;

        for (const localPath of localFiles) {
            const relativePath = path.relative(rootFolder, localPath);
            const s3Key = relativePath.split(path.sep).join('/');

            let shouldUpload = false;

            const remoteFile = remoteFileMap.get(s3Key);
            if (!remoteFile) {
                shouldUpload = true;
            } else {
                try {
                    const localStat = fs.statSync(localPath);
                    const remoteSize = remoteFile.size ? parseInt(remoteFile.size) : null;
                    if (remoteSize !== null && localStat.size !== remoteSize) {
                        shouldUpload = true;
                    }
                } catch(e) {}
            }

            if (shouldUpload) {
                console.log(`[SyncManager] Queueing upload: ${s3Key}`);
                uploadQueue.addUploadTask(bucket.id, localPath, s3Key, null, configId, syncJobId);
                uploadCount++;
            }
        }

        if (uploadCount > 0) {
            console.log(`[SyncManager] Bucket "${bucket.name}": Queued ${uploadCount} files from ${rootFolder}`);
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
                database.query(
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

