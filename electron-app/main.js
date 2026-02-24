require('dotenv').config();
const { app, BrowserWindow } = require('electron');
const path = require('path');
const chokidar = require('chokidar');
const si = require('systeminformation');
const backend = require('./backend');
const { registerIpcHandlers } = require('./main/ipcHandlers');

const ROOT_PATH = process.env.ROOT_PATH || path.join(app.getPath('home'), 'FMS');

let mainWindow;
let watcher;
let statsIntervals = [];

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Cloud Vault',
    width: 1200, height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      sandbox: true,
    },
    backgroundColor: '#0f172a',
    show: false,
  });

  mainWindow.loadURL('http://localhost:5173');
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.maximize(); 
  });

  // Initialize status manager with main window
  backend.status.init(mainWindow);

  startMonitoring();
  mainWindow.on('closed', () => {
    stopMonitoring();
    mainWindow = null;
  });
}

function startMonitoring() {
  // Network Stats
  statsIntervals.push(setInterval(async () => {
    try {
      const stats = await si.networkStats();
      const up = stats.find(i => i.operstate === 'up') || stats[0];
      if (mainWindow && up) {
        mainWindow.webContents.send('network-stats', { rx_sec: up.rx_sec, tx_sec: up.tx_sec });
      }
    } catch (e) {}
  }, 1000));

  // Disk Stats
  statsIntervals.push(setInterval(async () => {
    try {
      const disks = await si.fsSize();
      const main = disks.find(d => d.mount === '/' || d.mount === 'C:') || disks[0];
      if (mainWindow && main) {
        mainWindow.webContents.send('disk-stats', { total: main.size, used: main.used, available: main.available, use_percent: main.use });
      }
    } catch (e) {}
  }, 10000));
}

function stopMonitoring() {
  statsIntervals.forEach(clearInterval);
  statsIntervals = [];
}

app.whenReady().then(async () => {
  // 1. Init Database
  await backend.db.initDB();
  
  // 2. Ensure Root Folder
  const fs = require('fs');
  if (!fs.existsSync(ROOT_PATH)) fs.mkdirSync(ROOT_PATH, { recursive: true });

  // 3. Setup File Watcher
  watcher = chokidar.watch(ROOT_PATH, { 
    ignored: /(^|[\/\\])\../, 
    persistent: true, 
    ignoreInitial: true,
    awaitWriteFinish: {
      // Wait until file size is stable for 2s before firing 'add'
      stabilityThreshold: 2000,
      pollInterval: 500
    }
  });

  // Shared guard sets
  const uploadInProgress = new Set(); // prevent concurrent re-upload of same file
  const downloadingPaths = new Set(); // files being downloaded by SyncManager — watcher must skip these

  backend.sync.addWatcherPath = (folderPath) => {
    if (watcher) {
        console.log('[Watcher] Adding path to watch:', folderPath);
        watcher.add(folderPath);
    }
  };

  watcher
    .on('add', async (filePath) => {
      if (mainWindow) mainWindow.webContents.send('file-add', filePath);

      // Skip files that the SyncManager is actively downloading — they were NOT user-added
      if (downloadingPaths.has(filePath)) {
        console.log(`[Watcher] Skipping sync-download file (not re-uploading): ${path.basename(filePath)}`);
        return;
      }

      // Skip if already uploading (duplicate watcher event)
      if (uploadInProgress.has(filePath)) {
        console.log(`[Watcher] Skipping duplicate upload for: ${path.basename(filePath)}`);
        return;
      }

      uploadInProgress.add(filePath);
      try {
        await backend.onLocalFileAdded(filePath, ROOT_PATH);
      } catch(e) {
        console.error('[Watcher] Upload error:', e.message);
      } finally {
        uploadInProgress.delete(filePath);
      }
    })
    .on('change', (filePath) => {
      // Just notify UI — awaitWriteFinish means 'add' already handled the stable version
      if (mainWindow) mainWindow.webContents.send('file-change', filePath);
    })
    .on('unlink', async (filePath) => {
      if (mainWindow) mainWindow.webContents.send('file-unlink', filePath);
      try { await backend.onLocalFileRemoved(filePath, ROOT_PATH); } catch(e) {}
    })
    .on('addDir', (filePath) => {
      if (mainWindow) mainWindow.webContents.send('file-addDir', filePath);
    })
    .on('unlinkDir', async (filePath) => {
      if (mainWindow) mainWindow.webContents.send('file-unlinkDir', filePath);
      try { await backend.onLocalDirRemoved(filePath, ROOT_PATH); } catch(e) {}
    })
    .on('error', (error) => {
      console.error(`Watcher error: ${error}`);
      if(mainWindow) mainWindow.webContents.send('sync-error', error.message);
    });

  // 4. Create Window
  createWindow();

  // 5. Register IPC (pass downloadingPaths so SyncManager can be initialized with it)
  registerIpcHandlers(mainWindow, ROOT_PATH, downloadingPaths);
});

app.on('window-all-closed', async () => {
  if (watcher) watcher.close();
  stopMonitoring();
  await backend.db.closeDB();
  if (process.platform !== 'darwin') app.quit();
});
