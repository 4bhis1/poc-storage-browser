const { ipcMain, dialog, shell } = require('electron');
const path = require('path');
const backend = require('../backend');

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

    // 4. Database
    ipcMain.handle('db-query', async (event, { text, params }) => {
        try {
            const result = await backend.db.query(text, params);
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

    // 6. Full-text search across all local FileObjects
    ipcMain.handle('search-files', async (event, { query }) => {
        if (!query || query.trim().length < 1) return [];
        try {
            const result = await backend.db.query(
                `SELECT fo.id, fo.name, fo.key, fo."isFolder", fo.size, fo."mimeType", fo."bucketId", b.name AS "bucketName"
                 FROM "FileObject" fo
                 JOIN "Bucket" b ON fo."bucketId" = b.id
                 WHERE fo.name ILIKE $1
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

    ipcMain.handle('create-sync-config', async (event, { name, intervalMinutes, mappings }) => {
        try {
            const id = 'cfg-' + Date.now();
            await backend.db.query(
                `INSERT INTO "SyncConfig" (id, name, "intervalMinutes") VALUES ($1, $2, $3)`,
                [id, name, intervalMinutes]
            );
            
            for (const map of mappings) {
                const mapId = 'map-' + Date.now() + Math.random().toString(36).substring(7);
                await backend.db.query(
                    `INSERT INTO "SyncMapping" (id, "configId", "localPath", "bucketId") VALUES ($1, $2, $3, $4)`,
                    [mapId, id, map.localPath, map.bucketId]
                );
                
                // Add to active watcher
                if (backend.sync.addWatcherPath) {
                   backend.sync.addWatcherPath(map.localPath);
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
}

module.exports = { registerIpcHandlers };
