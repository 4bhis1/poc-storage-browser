const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const backend = require('../backend');
const cognito = require('../backend/cognito');
const authManager = require('../backend/auth');
const botAuth = require('../backend/bot-auth');

function registerIpcHandlers(mainWindow, rootPath, downloadingPaths) {
    // 1. Local File Handling
    ipcMain.handle('list-path-content', async (event, { folderPath, sortBy, filterBy, search }) => {
        return await backend.local.listContent(folderPath, sortBy, filterBy, search);
    });

    ipcMain.handle('create-folder', async (event, folderPath) => {
        try {
            const fs = require('fs/promises');
            await fs.mkdir(folderPath, { recursive: true });
            return true;
        } catch (error) {
            console.error('[IPC] Create Folder Error:', error);
            return false;
        }
    });

    ipcMain.handle('open-file', async (event, filePath) => {
        try {
            await shell.openPath(filePath);
            return true;
        } catch (error) {
            return false;
        }
    });

    // 2. Transfers (Upload/Download)
    ipcMain.handle('select-file', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile', 'multiSelections']
        });
        return canceled ? null : filePaths;
    });

    ipcMain.handle('select-folder-upload', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory', 'multiSelections']
        });
        return canceled ? null : filePaths;
    });

    ipcMain.handle('upload-items', async (event, { items, currentPath, shouldZip }) => {
        return await backend.uploadItems(items, currentPath, shouldZip);
    });

    ipcMain.handle('download-file', async (event, { url, targetPath }) => {
        return await backend.download.downloadFromUrl(url, targetPath);
    });

    // 3. Status
    ipcMain.handle('get-active-transfers', () => {
        return backend.status.getTransfers();
    });

    // 4. Database (accepts both { sql, params } from preload and legacy { text, params })
    ipcMain.handle('db-query', async (event, args) => {
        try {
            const queryText = args.sql || args.text;
            const result = await backend.db.query(queryText, args.params);
            return { rows: result.rows, rowCount: result.rowCount };
        } catch (error) {
            throw error;
        }
    });

    // 5. Sync
    ipcMain.handle('init-sync', (event, token) => {
        backend.sync.init(token, () => {
            if (mainWindow) mainWindow.webContents.send('auth-expired');
        }, downloadingPaths);
        return true;
    });

    ipcMain.handle('stop-sync', () => {
        backend.sync.stop();
        return true;
    });

    ipcMain.handle('force-sync', () => {
        backend.sync.runSync();
        return true;
    });

    // Awaitable initial bucket sync — called after login to populate local DB before UI needs it
    ipcMain.handle('sync-buckets-now', async () => {
        try {
            await backend.sync.syncAll();
            const bucketCount = await backend.db.query('SELECT COUNT(*) as count FROM "Bucket"');
            const count = parseInt(bucketCount.rows[0]?.count || 0);
            console.log(`[IPC] sync-buckets-now completed: ${count} buckets in local DB`);
            return { success: true, bucketCount: count };
        } catch (err) {
            console.error('[IPC] sync-buckets-now error:', err.message);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('sync-config-now', async (event, configId) => {
        try {
            // Check if already syncing
            const check = await backend.db.query('SELECT "isSyncing" FROM "SyncConfig" WHERE id = $1', [configId]);
            if (check.rows[0]?.isSyncing) {
                return { success: false, error: 'Sync is already in progress for this config' };
            }
            // Reset lastSync to null so the config is picked up immediately
            await backend.db.query('UPDATE "SyncConfig" SET "lastSync" = NULL WHERE id = $1', [configId]);
            // Run the sync cycle which will pick up this config
            backend.sync.runSync();
            return { success: true };
        } catch (err) {
            console.error('[IPC] sync-config-now error:', err.message);
            return { success: false, error: err.message };
        }
    });

    // 6. Full-text search across all local FileObjects
    ipcMain.handle('search-files', async (event, { query }) => {
        if (!query || query.trim().length < 1) return [];
        try {
            const result = await backend.db.query(
                `SELECT fo.id, fo.name, fo.key, fo."isFolder", fo.size, fo."mimeType", fo."bucketId", b.name AS "bucketName"
                 FROM "FileObject" fo
                 JOIN "Bucket" b ON fo."bucketId" = b.id
                 WHERE fo.name LIKE $1
                 ORDER BY fo."isFolder" DESC, fo.name ASC
                 LIMIT 30`,
                [`%${query.trim()}%`]
            );
            return result.rows;
        } catch (err) {
            console.error('[IPC] search-files error:', err.message);
            return [];
        }
    });

    // 7. Read local sync activities directly from local DB
    ipcMain.handle('get-local-sync-activities', async (event, configId) => {
        try {
            let query = `SELECT * FROM "LocalSyncActivity"`;
            let params = [];
            if (configId) {
                query += ` WHERE "configId" = $1`;
                params.push(configId);
            }
            query += ` ORDER BY "createdAt" DESC LIMIT 200`;
            const result = await backend.db.query(query, params);
            return result.rows;
        } catch (err) {
            console.error('[IPC] get-local-sync-activities error:', err.message);
            return [];
        }
    });

    ipcMain.handle('retry-failed-sync', async (event, syncActivityId) => {
        try {
            const query = await backend.db.query('SELECT "configId" FROM "LocalSyncActivity" WHERE id = $1', [syncActivityId]);
            if (query.rows.length > 0 && query.rows[0].configId) {
                if (backend.sync.reloadConfigs) {
                    backend.sync.reloadConfigs();
                }
                return { success: true };
            }
            return { success: false, error: 'Config not found for this activity' };
        } catch (err) {
            console.error('[IPC] retry-failed-sync error:', err.message);
            return { success: false, error: err.message };
        }
    });
    
    ipcMain.handle('get-sync-jobs', async (event, configId) => {
        try {
            const jobs = await backend.db.query(
                `SELECT * FROM "SyncJob" WHERE "configId" = $1 ORDER BY "startTime" DESC LIMIT 50`,
                [configId]
            );
            return jobs.rows;
        } catch (err) {
            console.error('[IPC] get-sync-jobs error:', err.message);
            return [];
        }
    });

    // 8. Configurable Sync
    ipcMain.handle('get-sync-configs', async () => {
        try {
            const configs = await backend.db.query(`SELECT * FROM "SyncConfig" ORDER BY "createdAt" DESC`);
            const configsData = configs.rows;
            for (let config of configsData) {
                const mappings = await backend.db.query(`SELECT * FROM "SyncMapping" WHERE "configId" = $1`, [config.id]);
                config.mappings = mappings.rows;
            }
            return configsData;
        } catch (err) {
            console.error('[IPC] get-sync-configs error:', err);
            return [];
        }
    });

    ipcMain.handle('create-sync-config', async (event, { name, intervalMinutes, mappings, direction, useWatcher }) => {
        try {
            const id = 'cfg-' + Date.now();
            const dir = direction || 'DOWNLOAD';
            const watcher = dir === 'UPLOAD' ? (useWatcher !== false ? 1 : 0) : 0;
            
            await backend.db.query(
                `INSERT INTO "SyncConfig" (id, name, "intervalMinutes", "direction", "useWatcher") VALUES ($1, $2, $3, $4, $5)`,
                [id, name, intervalMinutes, dir, watcher]
            );
            
            for (const map of mappings) {
                const mapId = 'map-' + Date.now() + Math.random().toString(36).substring(7);
                await backend.db.query(
                    `INSERT INTO "SyncMapping" (id, "configId", "localPath", "bucketId") VALUES ($1, $2, $3, $4)`,
                    [mapId, id, map.localPath, map.bucketId]
                );
                
                // Only add to watcher for UPLOAD configs with watcher enabled
                if (dir === 'UPLOAD' && watcher && backend.sync.addWatcherPath) {
                   backend.sync.addWatcherPath(map.localPath, true);
                }
            }
            
            // Reload configs into active sync queue
            if (backend.sync.reloadConfigs) {
                backend.sync.reloadConfigs();
            }

            return { success: true, id };
        } catch (err) {
            console.error('[IPC] create-sync-config error:', err);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('delete-sync-config', async (event, configId) => {
        try {
            await backend.db.query(`DELETE FROM "SyncConfig" WHERE id = $1`, [configId]);
            if (backend.sync.reloadConfigs) {
                backend.sync.reloadConfigs();
            }
            return { success: true };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('select-sync-folder', async () => {
        const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
            properties: ['openDirectory']
        });
        return canceled ? null : filePaths[0];
    });

    // ── 9. Cognito Auth handlers ────────────────────────────────────────────

    ipcMain.handle('auth:login', async (event, { email, password }) => {
        try {
            const result = await cognito.authenticateCognitoUser(email, password);
            if (result.challengeName === 'NEW_PASSWORD_REQUIRED') {
                return { success: true, challengeName: result.challengeName, session: result.session, username: result.username };
            }
            authManager.login(result);
            return { success: true, accessToken: result.accessToken, idToken: result.idToken };
        } catch (err) {
            console.error('[IPC] auth:login error:', err.message);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('auth:new-password', async (event, { username, newPassword, session }) => {
        try {
            const result = await cognito.respondToNewPasswordChallenge(username, newPassword, session);
            authManager.login(result);
            return { success: true, accessToken: result.accessToken, idToken: result.idToken };
        } catch (err) {
            console.error('[IPC] auth:new-password error:', err.message);
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('auth:refresh', async () => {
        try {
            return await authManager.refreshTokens();
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('auth:logout', () => {
        try {
            backend.db.wipeAllData();
        } catch (e) {
            console.error('[IPC] wipe on logout failed:', e.message);
        }
        authManager.logout();
        return { success: true };
    });

    ipcMain.handle('auth:get-session', () => {
        return authManager.getSession();
    });

    ipcMain.handle('auth:forgot-password', async (event, { email }) => {
        try {
            return await cognito.forgotPassword(email);
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('auth:confirm-password', async (event, { email, code, newPassword }) => {
        try {
            return await cognito.confirmForgotPassword(email, code, newPassword);
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    // ── SSO: PKCE loopback flow ─────────────────────────────────────────────
    ipcMain.handle('auth:open-browser-sso', async () => {
        const { generatePKCE, startLoopbackServer } = require('../backend/pkce');
        const axios = require('axios');
        const enterpriseUrl = process.env.ENTERPRISE_URL || 'http://localhost:3000';

        try {
            const { verifier, challenge } = generatePKCE();
            const { port, codePromise }   = await startLoopbackServer();
            const redirectUri = `http://127.0.0.1:${port}`;

            const ssoUrl = `${enterpriseUrl}/api/auth/agent-sso?challenge=${challenge}&redirect_uri=${encodeURIComponent(redirectUri)}`;
            await shell.openExternal(ssoUrl);

            // Wait for the loopback to receive the auth code
            const code = await codePromise;

            // Exchange code + verifier for tokens
            const { data } = await axios.post(`${enterpriseUrl}/api/auth/token-exchange`, {
                code,
                verifier,
            });

            const { accessToken, refreshToken, email } = data;
            authManager.login({
                accessToken,
                idToken:      accessToken,
                refreshToken,
                username:     email,
                email,
            });

            // Start heartbeat in SSO mode
            const heartbeat = require('../backend/heartbeat');
            heartbeat.start('sso', () => {
                if (mainWindow) mainWindow.webContents.send('auth-expired');
            });

            // Start health reporter
            backend.healthReporter.start(rootPath);

            if (mainWindow) {
                mainWindow.webContents.send('sso-auth-result', { idToken: accessToken, refreshToken, email });
                if (mainWindow.isMinimized()) mainWindow.restore();
                mainWindow.focus();
            }

            return { success: true };
        } catch (err) {
            console.error('[IPC] auth:open-browser-sso error:', err.message);
            return { success: false, error: err.message };
        }
    });

    // ── Bot auth handlers ───────────────────────────────────────────────────

    ipcMain.handle('bot:generate-keypair', () => {
        try {
            const publicKey = botAuth.generateKeyPair();
            return { success: true, publicKey };
        } catch (err) {
            return { success: false, error: err.message };
        }
    });

    ipcMain.handle('bot:get-public-key', () => {
        return { publicKey: botAuth.getPublicKey(), hasKeyPair: botAuth.hasKeyPair() };
    });

    ipcMain.handle('bot:save-bot-id', (event, { botId }) => {
        botAuth.saveBotId(botId);
        return { success: true };
    });

    ipcMain.handle('bot:get-bot-id', () => {
        return { botId: botAuth.getBotId() };
    });

    ipcMain.handle('bot:handshake', async (event, { botId }) => {
        try {
            const result = await botAuth.performHandshake(botId);
            authManager.login({
                accessToken:  result.accessToken,
                idToken:      result.accessToken,
                refreshToken: result.refreshToken,
                username:     result.email,
                email:        result.email,
            });

            // Start heartbeat in bot mode
            const heartbeat = require('../backend/heartbeat');
            heartbeat.start('bot', () => {
                if (mainWindow) mainWindow.webContents.send('auth-expired');
            });

            // Start health reporter and immediately push machine info on first login
            backend.healthReporter.start(rootPath);
            backend.healthReporter.triggerReport();

            return { success: true, accessToken: result.accessToken, email: result.email };
        } catch (err) {
            console.error('[IPC] bot:handshake error:', err.message);
            return { success: false, error: err.message };
        }
    });

    // Auto-login attempt on startup
    ipcMain.handle('bot:attempt-auto-login', async () => {
        try {
            if (!botAuth.hasKeyPair() || !botAuth.getBotId()) {
                return { success: false, reason: 'no_credentials' };
            }

            const botId = botAuth.getBotId();
            const result = await botAuth.performHandshake(botId);
            
            authManager.login({
                accessToken:  result.accessToken,
                idToken:      result.accessToken,
                refreshToken: result.refreshToken,
                username:     result.email,
                email:        result.email,
            });

            // Start heartbeat in bot mode
            const heartbeat = require('../backend/heartbeat');
            heartbeat.start('bot', () => {
                if (mainWindow) mainWindow.webContents.send('auth-expired');
            });

            // Start health reporter and immediately push machine info on login
            backend.healthReporter.start(rootPath);
            backend.healthReporter.triggerReport();

            console.log('[IPC] Auto-login successful for bot:', botId);
            return { 
                success: true, 
                accessToken: result.accessToken, 
                email: result.email,
                botId,
                isAutoLogin: true
            };
        } catch (err) {
            console.error('[IPC] Auto-login failed:', err.message);
            return { success: false, error: err.message, reason: 'handshake_failed' };
        }
    });

    ipcMain.handle('bot:deregister', () => {
        botAuth.clearBotIdentity();
        authManager.logout();
        const heartbeat = require('../backend/heartbeat');
        heartbeat.stop();
        return { success: true };
    });

    // ── 10. Doctor Diagnostics ──────────────────────────────────────────────

    ipcMain.handle('doctor:get-heartbeat-history', async (event, minutes = 60) => {
        return await backend.heartbeat.getHeartbeatHistory(minutes);
    });

    ipcMain.handle('doctor:run-diagnostics', async () => {
        return await backend.doctor.runAll(rootPath);
    });

    ipcMain.handle('doctor:get-last-diagnostics', async () => {
        return await backend.doctor.getLastDiagnostics();
    });

    ipcMain.handle('doctor:run-single', async (event, diagnosticName) => {
        const methodMap = {
            'Clock Skew': () => backend.doctor.checkClockSkew(),
            'Disk I/O': () => backend.doctor.checkDiskIO(rootPath),
            'Multipart Handshake': async () => {
                const bucket = await backend.doctor._getFirstBucket();
                return bucket
                    ? backend.doctor.checkMultipartHandshake(bucket.id)
                    : backend.doctor._skipMultipart();
            },
            'Proxy Detection': () => backend.doctor.checkProxyDetection(),
            'Service Health': () => backend.doctor.checkServiceHealth(),
        };
        const method = methodMap[diagnosticName];
        return method ? await method() : { name: diagnosticName, status: 'fail', detail: 'Unknown diagnostic', durationMs: 0 };
    });
}


module.exports = { registerIpcHandlers };

