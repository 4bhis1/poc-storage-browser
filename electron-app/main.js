
const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const fsPromises = require('fs/promises');
const https = require('https');
const chokidar = require('chokidar');
const si = require('systeminformation');

let mainWindow;
let watcher;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    backgroundColor: '#0f172a',
    show: false,
  });

  // Load the Vite dev server URL
  mainWindow.loadURL('http://localhost:5173');
  
  // Open DevTools for debugging
  // mainWindow.webContents.openDevTools();

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize(); // Make full screen
  });

  // Send network stats periodically
  setInterval(async () => {
      try {
          const stats = await si.networkStats();
          if (stats && stats.length > 0) {
              const mainInterface = stats.find(i => i.operstate === 'up') || stats[0];
              if (mainWindow) {
                mainWindow.webContents.send('network-stats', {
                    rx_sec: mainInterface.rx_sec, // Bytes per second received
                    tx_sec: mainInterface.tx_sec  // Bytes per second transmitted
                });
              }
          }
      } catch (e) {
          // console.error('Network stats error', e);
      }
  }, 1000);
  
  // Send disk stats periodically (every 10 seconds)
  setInterval(async () => {
    try {
        const disks = await si.fsSize();
        if (disks && disks.length > 0) {
            // Try to find the root volume or just take the first one
            const mainDisk = disks.find(d => d.mount === '/' || d.mount === 'C:') || disks[0];
            if (mainWindow) {
                mainWindow.webContents.send('disk-stats', {
                    total: mainDisk.size,
                    used: mainDisk.used,
                    available: mainDisk.available,
                    mount: mainDisk.mount,
                    use_percent: mainDisk.use
                });
            }
        }
    } catch (e) {
        console.error('Disk stats error', e);
    }
  }, 10000);
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', function () {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', function () {
  if (watcher) watcher.close();
  if (process.platform !== 'darwin') app.quit();
});

// Handle folder selection
ipcMain.handle('select-folder', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
  });
  if (canceled) {
    return null;
  }
  return filePaths[0];
});

// Start watching folder
ipcMain.handle('start-sync', async (event, folderPath) => {
  if (watcher) {
    await watcher.close();
  }

  console.log(`Starting sync for: ${folderPath}`);

  // Initialize watcher.
  watcher = chokidar.watch(folderPath, {
    ignored: /(^|[\/\\])\../, // ignore dotfiles
    persistent: true,
    ignoreInitial: false,
    depth: 99,
  });

  // Add event listeners.
  watcher
    .on('add', (path) => {
      if (mainWindow) mainWindow.webContents.send('file-added', path);
    })
    .on('change', (path) => {
      if (mainWindow) mainWindow.webContents.send('file-changed', path);
    })
    .on('unlink', (path) => {
      if (mainWindow) mainWindow.webContents.send('file-removed', path);
    })
    .on('addDir', (path) => {
        if (mainWindow) mainWindow.webContents.send('dir-added', path);
    })
    .on('unlinkDir', (path) => {
        if (mainWindow) mainWindow.webContents.send('dir-removed', path);
    })
    .on('error', (error) => {
        console.error(`Watcher error: ${error}`);
        if(mainWindow) mainWindow.webContents.send('sync-error', error.message);
    });
    
  return true;
});

// List content in a specific path
ipcMain.handle('list-path-content', async (event, folderPath) => {
  try {
    const entries = await fsPromises.readdir(folderPath, { withFileTypes: true });
    return entries.map(dirent => ({
      name: dirent.name,
      isDirectory: dirent.isDirectory()
    }));
  } catch (error) {
    console.error('Error listing path content:', error);
    return [];
  }
});

// Create folder
ipcMain.handle('create-folder', async (event, folderPath) => {
    try {
        await fsPromises.mkdir(folderPath, { recursive: true });
        return true;
    } catch (error) {
        console.error('Error creating folder:', error);
        return false;
    }

});

// Download File Handler
ipcMain.handle('download-file', async (event, { url, targetPath }) => {
    return new Promise((resolve, reject) => {
        const fileName = path.basename(url);
        const destination = path.join(targetPath, fileName);
        const file = fs.createWriteStream(destination);

        https.get(url, (response) => {
            if (response.statusCode !== 200) {
                file.close();
                fs.unlink(destination, () => {}); // Delete the file async
                reject(`Server responded with ${response.statusCode}: ${response.statusMessage}`);
                return;
            }

            const totalBytes = parseInt(response.headers['content-length'], 10);
            let receivedBytes = 0;

            response.on('data', (chunk) => {
                receivedBytes += chunk.length;
                if (totalBytes) {
                    const progress = (receivedBytes / totalBytes) * 100;
                    if (mainWindow) {
                        mainWindow.webContents.send('download-progress', {
                            filename: fileName,
                            progress: progress,
                            received: receivedBytes,
                            total: totalBytes
                        });
                    }
                }
            });

            response.pipe(file);

            file.on('finish', () => {
                file.close(() => {
                    resolve({ success: true, path: destination });
                });
            });

            file.on('error', (err) => {
                fs.unlink(destination, () => {}); // Delete the file async
                reject(err.message);
            });
        }).on('error', (err) => {
            fs.unlink(destination, () => {}); // Delete the file async
            reject(err.message);
        });
    });
});
