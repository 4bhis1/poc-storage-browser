/**
 * SyncHistory Logger
 * ------------------
 * Two-phase sync history:
 *   Phase 1: Every upload/download activity is written immediately to the LOCAL Postgres DB
 *            (LocalSyncActivity table) — this is instant and works offline.
 *   Phase 2: When runSync() completes, it calls flush() which reads all unsynced rows from
 *            local DB, POSTs them as a single SyncHistory record to the Global DB (Next.js),
 *            then marks them as synced=true locally.
 *
 * Usage:
 *   syncHistory.logActivity('UPLOAD', 'myfile.txt', 'SUCCESS');
 *   syncHistory.logActivity('DOWNLOAD', 'photo.png', 'FAILED', 'HTTP 404');
 *   await syncHistory.flush();  // called at end of runSync()
 */

const axios = require('axios');
const { v4: uuidv4 } = require('uuid');
const database = require('./database');

const API_URL = process.env.API_URL || 'http://localhost:3000/api';

class SyncHistoryLogger {
    constructor() {
        this.authToken = null;
    }

    init(token) {
        this.authToken = token;
        console.log('[SyncHistory] Logger initialized');
    }

    stop() {
        this.authToken = null;
    }

    /**
     * Phase 1: Write activity to LOCAL DB immediately.
     * Deduplicates: if the same action+fileName+status was logged in the last 30 min, skip it.
     * @param {'UPLOAD'|'DOWNLOAD'|'DELETE'} action
     * @param {string} fileName
     * @param {'SUCCESS'|'FAILED'} status
     * @param {string} [error]
     */
    async logActivity(action, fileName, status, error = null, configId = null, syncJobId = null) {
        // Never log SKIPs — they are noise (file already exists locally)
        if (action === 'SKIP') return;

        const id = uuidv4();
        try {
            // Dedup: don't insert if same file+action+status was logged in the last 30 minutes
            let dedupQuery = `SELECT id FROM "LocalSyncActivity"
                 WHERE action = $1 AND "fileName" = $2 AND status = $3
                   AND "createdAt" > NOW() - INTERVAL '30 minutes'`;
            let params = [action, fileName, status];
            if (configId) {
                dedupQuery += ` AND "configId" = $4`;
                params.push(configId);
            }
            dedupQuery += ` LIMIT 1`;

            const recent = await database.query(dedupQuery, params);
            if (recent.rows.length > 0) {
                console.log(`[SyncHistory] Dedup skipped: ${action} ${fileName} → ${status}`);
                return;
            }

            await database.query(
                `INSERT INTO "LocalSyncActivity" (id, action, "fileName", status, error, synced, "configId", "syncJobId")
                 VALUES ($1, $2, $3, $4, $5, false, $6, $7)`,
                [id, action, fileName, status, error, configId, syncJobId]
            );
            console.log(`[SyncHistory] Local log: ${action} ${fileName} → ${status}`);
        } catch (err) {
            console.error('[SyncHistory] Failed to write local activity:', err.message);
        }
    }


    /**
     * Phase 2: Read all unsynced local activities → POST to Global DB → mark as synced.
     * Called at the end of SyncManager.runSync().
     */
    async flush() {
        if (!this.authToken) {
            console.warn('[SyncHistory] No token — skipping flush to Global DB');
            return;
        }

        let rows = [];
        try {
            const result = await database.query(
                `SELECT * FROM "LocalSyncActivity" WHERE synced = false ORDER BY "createdAt" ASC`
            );
            rows = result.rows;
        } catch (err) {
            console.error('[SyncHistory] Failed to read local activities:', err.message);
            return;
        }

        if (rows.length === 0) {
            console.log('[SyncHistory] No unsynced activities to flush');
            return;
        }

        // Build the payload for Global DB
        const activities = rows.map(r => ({
            action: r.action,
            fileName: r.fileName,
            status: r.status,
            error: r.error,
        }));

        const successCount = activities.filter(a => a.status === 'SUCCESS' && a.action !== 'SKIP').length;
        const failedCount = activities.filter(a => a.status === 'FAILED').length;
        const totalCount = activities.filter(a => a.action !== 'SKIP').length;
        const overallStatus = failedCount > 0 ? 'FAILED' : totalCount > 0 ? 'SUCCESS' : 'SUCCESS';

        const payload = {
            status: overallStatus,
            startedAt: rows[0].createdAt,
            completedAt: rows[rows.length - 1].createdAt,
            totalFiles: totalCount,
            syncedFiles: successCount,
            failedFiles: failedCount,
            activities,
        };

        try {
            const res = await axios.post(`${API_URL}/agent/sync-history`, payload, {
                headers: { Authorization: `Bearer ${this.authToken}` },
                timeout: 15000,
            });

            if (res.status === 200 || res.status === 201) {
                // Mark all flushed rows as synced in local DB
                const ids = rows.map(r => r.id);
                await database.query(
                    `UPDATE "LocalSyncActivity" SET synced = true WHERE id = ANY($1::text[])`,
                    [ids]
                );
                console.log(`[SyncHistory] Flushed ${rows.length} activities to Global DB ✓`);
            }
        } catch (err) {
            console.error('[SyncHistory] Failed to flush to Global DB:', err.response?.data || err.message);
            // Activities remain unsynced in local DB and will be retried next cycle
        }
    }
}

module.exports = new SyncHistoryLogger();
