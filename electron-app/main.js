require('dotenv').config();
const { app, BrowserWindow } = require('electron');
const path = require('path');
const chokidar = require('chokidar');
const si = require('systeminformation');
const backend = require('./backend');
const authManager = require('./backend/auth');
const botAuth = require('./backend/bot-auth');
const { registerIpcHandlers } = require('./main/ipcHandlers');

// ── Deep-link / Protocol handler ──────────────────────────────────────────
// Register cloudvault:// as the app's custom protocol (must be done before
// app.whenReady and before any second-instance event fires).
app.setAsDefaultProtocolClient('cloudvault');

/**
 * Parse a cloudvault://auth?token=<idToken>&refresh=<refreshToken> URL,
 * persist the tokens, and notify the renderer so it can update the UI.
 */
function handleDeepLink(url) {
  if (!url || !url.startsWith('cloudvault://')) return;
  try {
    const parsed = new URL(url);
    const idToken      = parsed.searchParams.get('token');
    const refreshToken = parsed.searchParams.get('refresh');
    if (!idToken || !refreshToken) return;

    // Decode email/username from the IdToken payload (no signature verify needed)
    let email = '';
    try {
      const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64').toString());
      email = payload.email || payload['cognito:username'] || '';
    } catch {}

    authManager.login({ idToken, accessToken: idToken, refreshToken, username: email, email });

    if (mainWindow) {
      mainWindow.webContents.send('sso-auth-result', { idToken, refreshToken, email });
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  } catch (err) {
    console.error('[DeepLink] Parse error:', err.message);
  }
}

// macOS: fires when the OS passes a URL to the *already running* instance
app.on('open-url', (event, url) => {
  event.preventDefault();
  handleDeepLink(url);
});

// Windows/Linux: handle deep link from second-instance argv
app.on('second-instance', (_event, argv) => {
  const url = argv.find(a => a.startsWith('cloudvault://'));
  if (url) handleDeepLink(url);
  if (mainWindow) {
    if (mainWindow.isMinimized()) mainWindow.restore();
    mainWindow.focus();
  }
});

const ROOT_PATH = process.env.ROOT_PATH || path.join(app.getPath('home'), 'FMS');

let mainWindow;
let watcher;
let statsIntervals = [];

function createWindow() {
  mainWindow = new BrowserWindow({
    title: 'Cloud Vault',
    width: 1400, 
    height: 800,
    autoHideMenuBar: true,
    
    // 1. Disables the Maximize button (Windows/Linux) or Green Zoom button (macOS)
    maximizable: false, 
    
    // 2. Prevents users from dragging the edges to resize the window
    resizable: false,   
    
    // 3. Prevents the window from entering macOS Fullscreen mode
    fullscreenable: false, 

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
  });

  // Initialize status and history managers with main window
  backend.status.init(mainWindow);
  const syncHistory = require('./backend/syncHistory');
  syncHistory.initUI(mainWindow);

  // Initialize doctor with mainWindow for step-by-step progress events
  backend.doctor.initUI(mainWindow);

  // Initialize heartbeat with mainWindow for real-time status pushes
  backend.heartbeat.initUI(mainWindow);

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
  watcher = chokidar.watch([], { 
    ignored: /(^|[\/\\])\../, 
    persistent: true, 
    ignoreInitial: true,
    awaitWriteFinish: {
      // Wait until file size is stable for 2s before firing 'add'
      stabilityThreshold: 2000,
      pollInterval: 500
    }
  });

  // Query DB for active watch paths (only UPLOAD configs with watcher enabled)
  try {
     const watchConfigs = await backend.db.query('SELECT m."localPath" FROM "SyncMapping" m JOIN "SyncConfig" c ON m."configId" = c.id WHERE c."useWatcher" = 1 AND c."direction" = \'UPLOAD\'');
     watchConfigs.rows.forEach(r => watcher.add(r.localPath));
     console.log(`[Watcher] Initialized with ${watchConfigs.rows.length} active upload paths.`);
  } catch(e) {
     console.error('[Watcher] Failed to load active paths:', e.message);
  }

  // Shared guard sets
  const uploadInProgress = new Set(); // prevent concurrent re-upload of same file
  const downloadingPaths = new Set(); // files being downloaded by SyncManager — watcher must skip these

  backend.sync.addWatcherPath = (folderPath, useWatcher = true) => {
    if (watcher && useWatcher) {
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

  // 6. Auto-start heartbeat + health reporter if session already exists from prior login
  const existingSession = authManager.getSession();
  const botId = botAuth.getBotId();
  const hasBotIdentity = botAuth.hasKeyPair() && !!botId;

  if (hasBotIdentity) {
    // Bot identity exists — re-handshake to get fresh tokens before starting heartbeat
    console.log(`[Main] Bot identity found (${botId}), performing fresh handshake...`);
    try {
      const result = await botAuth.performHandshake(botId);
      authManager.login({
        accessToken:  result.accessToken,
        idToken:      result.accessToken,
        refreshToken: result.refreshToken,
        username:     result.email,
        email:        result.email,
      });
      const heartbeat = require('./backend/heartbeat');
      heartbeat.start('bot', () => {
        if (mainWindow) mainWindow.webContents.send('auth-expired');
      });
      backend.healthReporter.start(ROOT_PATH);
      console.log(`[Main] Bot re-handshake successful — heartbeat + health reporter started (mode=bot)`);
    } catch (err) {
      console.error(`[Main] Bot re-handshake failed on startup:`, err.message);
      // Fall through — renderer will handle login
    }
  } else if (existingSession?.idToken) {
    // SSO session — start heartbeat with existing tokens (will refresh if needed)
    const heartbeat = require('./backend/heartbeat');
    heartbeat.start('sso', () => {
      if (mainWindow) mainWindow.webContents.send('auth-expired');
    });
    backend.healthReporter.start(ROOT_PATH);
    console.log(`[Main] Resumed heartbeat + health reporter (mode=sso) from existing session`);
  }
});

app.on('window-all-closed', async () => {
  if (watcher) watcher.close();
  stopMonitoring();
  await backend.db.closeDB();
  if (process.platform !== 'darwin') app.quit();
});
