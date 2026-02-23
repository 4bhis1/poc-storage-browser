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
}

module.exports = { registerIpcHandlers };
