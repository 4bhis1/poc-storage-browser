# CloudVault Electron App — Production Deployment Workflow

## Table of Contents
1. [Current State Audit](#1-current-state-audit)
2. [Critical Issues to Fix Before Packaging](#2-critical-issues-to-fix-before-packaging)
3. [Electron Best Practices Checklist](#3-electron-best-practices-checklist)
4. [Build Tooling Setup (electron-builder)](#4-build-tooling-setup-electron-builder)
5. [Code Changes Required](#5-code-changes-required)
6. [Environment & Configuration Management](#6-environment--configuration-management)
7. [Platform-Specific Packaging](#7-platform-specific-packaging)
8. [Auto-Update System](#8-auto-update-system)
9. [Code Signing](#9-code-signing)
10. [Cloud VM Deployment (Headless)](#10-cloud-vm-deployment-headless)
11. [CI/CD Pipeline](#11-cicd-pipeline)
12. [Security Hardening](#12-security-hardening)
13. [Testing Before Release](#13-testing-before-release)
14. [File-by-File Change List](#14-file-by-file-change-list)

---

## 1. Current State Audit

### What you have
- Electron 34 app with a Vite + React renderer
- Main process: CommonJS (`require()`) — `main.js`, `preload.js`, `backend/*.js`
- Renderer: ESM (Vite) — `src/*.jsx`
- Native module: `better-sqlite3` (requires rebuild per platform/arch)
- Auth: Cognito direct + SSO (PKCE loopback) + Bot auth (Ed25519)
- File sync engine: S3 uploads/downloads with local SQLite mirror
- Deep-link protocol: `cloudvault://`

### What's broken for production
| Issue | Severity | Why |
|-------|----------|-----|
| `mainWindow.loadURL('http://localhost:5173')` | 🔴 Critical | Production must load the built HTML, not a dev server |
| `.env` file with hardcoded secrets | 🔴 Critical | Secrets ship in the binary if bundled as-is |
| No build/package scripts | 🔴 Critical | No way to produce distributable installers |
| `--no-sandbox` flag in start script | 🟡 High | Disables Chromium sandbox — security risk |
| No code signing | 🟡 High | OS will flag the app as untrusted (macOS Gatekeeper, Windows SmartScreen) |
| `ROOT_PATH` hardcoded to `/home/abhishek/FMS` | 🟡 High | Won't work on other machines |
| No auto-updater | 🟠 Medium | Users must manually download new versions |
| `electron-store` encryption key in `.env` | 🟡 High | Key is visible in plaintext |
| No app icon | 🟠 Medium | Default Electron icon on all platforms |
| Window not resizable/maximizable | 🟠 Medium | Unusual UX — consider making it resizable for different screen sizes |

---

## 2. Critical Issues to Fix Before Packaging

### 2.1 — Renderer Loading (Dev vs Production)

**Current** (`main.js` line ~82):
```js
mainWindow.loadURL('http://localhost:5173');
```

**Fix**: Detect environment and load accordingly:
```js
const isDev = !app.isPackaged;

if (isDev) {
  mainWindow.loadURL('http://localhost:5173');
} else {
  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
}
```

Vite must build the renderer into `dist/` and the `base` in `vite.config.js` must be `'./'` (relative paths) so the built HTML works from `file://`.

### 2.2 — Vite Config for Production

```js
// vite.config.js
export default defineConfig({
  base: './',  // ← CRITICAL for file:// protocol in packaged app
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
```

### 2.3 — Environment Variables & Secrets

**Problem**: `.env` contains `ENCRYPTION_KEY`, `COGNITO_CLIENT_SECRET`, AWS credentials. If you package the app with this file, anyone can extract them from the `.asar` archive.

**Solution — Tiered approach**:

| Variable | Where it should live | Why |
|----------|---------------------|-----|
| `COGNITO_USER_POOL_ID` | Hardcoded in build config or fetched from API | Public info, safe to embed |
| `COGNITO_CLIENT_ID` | Hardcoded in build config | Public info (client ID is not secret for public clients) |
| `COGNITO_CLIENT_SECRET` | ⚠️ **Remove entirely** | Electron is a public client — you should NOT use a client secret. Reconfigure your Cognito app client to be a "public client" (no secret). If you must keep it, fetch it from your enterprise backend at runtime. |
| `ENCRYPTION_KEY` | Generate per-machine on first launch using `crypto.randomBytes(32)` and store in OS keychain via `keytar` or `safeStorage` | Unique per install |
| `AWS_REGION` | Hardcoded in build config | Not sensitive |
| `ENTERPRISE_URL` | Build-time config or runtime config file | Varies per environment |
| `ROOT_PATH` | Remove from `.env`, use `app.getPath('documents') + '/CloudVault'` as default | Per-machine |

**Implementation**: Create a `config.js` module:
```js
// backend/config.js
const { app, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const isDev = !app.isPackaged;

// Build-time constants (injected via electron-builder extraMetadata or hardcoded)
const config = {
  COGNITO_USER_POOL_ID: 'ap-south-1_LDgq3ayzF',
  COGNITO_CLIENT_ID: '2tstbe7suat4m124f06selfpul',
  AWS_REGION: 'ap-south-1',
  ENTERPRISE_URL: isDev ? 'http://localhost:3000' : 'https://your-production-url.com',
  ROOT_PATH: process.env.ROOT_PATH || path.join(app.getPath('documents'), 'CloudVault'),
};

// Per-machine encryption key using Electron's safeStorage
function getEncryptionKey() {
  const keyPath = path.join(app.getPath('userData'), '.enc-key');
  if (fs.existsSync(keyPath)) {
    const encrypted = fs.readFileSync(keyPath);
    if (safeStorage.isEncryptionAvailable()) {
      return safeStorage.decryptString(encrypted);
    }
    return encrypted.toString('hex');
  }
  // First launch — generate and persist
  const key = crypto.randomBytes(32).toString('hex');
  if (safeStorage.isEncryptionAvailable()) {
    fs.writeFileSync(keyPath, safeStorage.encryptString(key));
  } else {
    fs.writeFileSync(keyPath, key);
  }
  return key;
}

config.ENCRYPTION_KEY = null; // Lazy — call getEncryptionKey() after app.whenReady()

module.exports = { config, getEncryptionKey };
```

### 2.4 — Remove `--no-sandbox` Flag

The `"start": "electron . --no-sandbox"` script disables Chromium's process sandbox. This is a significant security risk in production.

**Why it was probably added**: On some Linux distros, Electron fails to launch without `--no-sandbox` due to missing kernel features (unprivileged user namespaces).

**Production fix**:
- Remove `--no-sandbox` from the start script
- For Linux packaging, electron-builder automatically sets the correct SUID sandbox helper
- If targeting Linux VMs where user namespaces are disabled, the AppImage format handles this automatically
- Never ship `--no-sandbox` in production — it allows renderer exploits to escape the sandbox

### 2.5 — Native Module Rebuilding (`better-sqlite3`)

`better-sqlite3` is a C++ addon compiled against a specific Node.js ABI. Electron uses a different ABI than system Node.js, so the module must be rebuilt for Electron's version.

**Current**: You have `@electron/rebuild` and a `postinstall` script — good.

**For packaging**: electron-builder handles native module rebuilding automatically during the build process. No extra config needed as long as `better-sqlite3` is in `dependencies` (not `devDependencies`).

**Cross-compilation caveat**: You cannot cross-compile native modules. To build for macOS, you need a macOS machine. To build for Windows, you need Windows (or use CI). Linux can be built from Linux or Docker.

---

## 3. Electron Best Practices Checklist

These are the things that separate a "dev project" from a "real desktop app". Your app violates several of these — all fixable.

### Security
| Practice | Your Status | Action |
|----------|-------------|--------|
| `contextIsolation: true` | ✅ Done | — |
| `sandbox: true` | ✅ Done | — |
| `nodeIntegration: false` (default) | ✅ Done | — |
| No `--no-sandbox` flag | ❌ | Remove from start script |
| No remote module | ✅ Done | — |
| Validate all IPC inputs | ⚠️ Partial | Add input validation to IPC handlers (see Section 12) |
| CSP (Content Security Policy) | ❌ Missing | Add CSP meta tag to `index.html` |
| No `shell.openExternal` with untrusted URLs | ⚠️ | Validate URLs before opening |
| `webSecurity: true` (default) | ✅ Done | — |

### Performance
| Practice | Your Status | Action |
|----------|-------------|--------|
| Lazy-load heavy modules | ❌ | `systeminformation` is loaded at startup — lazy-load it |
| Minimize main process blocking | ⚠️ | `fs.statSync` in watcher handler — use async version |
| Throttle IPC messages | ✅ Done | Transfer status already throttled at 50ms |
| Use `show: false` + `ready-to-show` | ✅ Done | — |

### UX
| Practice | Your Status | Action |
|----------|-------------|--------|
| App icon for all platforms | ❌ Missing | Need icon.icns (macOS), icon.ico (Windows), icon.png (Linux) |
| Proper app name & metadata | ❌ | `package.json` missing `description`, `author`, `homepage` |
| Graceful error handling | ⚠️ | Add `unhandledRejection` and `uncaughtException` handlers |
| Single instance lock | ⚠️ Partial | You handle `second-instance` but don't call `app.requestSingleInstanceLock()` |
| Remember window position | ❌ | Use `electron-window-state` or manual save/restore |

---

## 4. Build Tooling Setup (electron-builder)

### Why electron-builder
- Most mature Electron packaging tool
- Handles native module rebuilding, code signing, auto-update, and all platform formats
- Supports `.dmg`, `.exe`/`.msi`, `.AppImage`, `.deb`, `.rpm`, `.snap`

### Install
```bash
npm install --save-dev electron-builder
```

### package.json additions
```json
{
  "name": "cloudvault",
  "version": "1.0.0",
  "description": "CloudVault — Enterprise S3 File Sync Agent",
  "author": "Your Company <[email]>",
  "homepage": "https://your-company.com",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "dev": "concurrently -k \"vite\" \"wait-on tcp:5173 && electron .\"",
    "build:renderer": "vite build",
    "build:win": "npm run build:renderer && electron-builder --win",
    "build:mac": "npm run build:renderer && electron-builder --mac",
    "build:linux": "npm run build:renderer && electron-builder --linux",
    "build:all": "npm run build:renderer && electron-builder -mwl",
    "rebuild": "electron-rebuild",
    "postinstall": "electron-rebuild"
  },
  "build": {
    "appId": "com.yourcompany.cloudvault",
    "productName": "CloudVault",
    "copyright": "Copyright © 2025 Your Company",
    "directories": {
      "output": "release",
      "buildResources": "build-resources"
    },
    "files": [
      "main.js",
      "preload.js",
      "main/**/*",
      "backend/**/*",
      "dist/**/*",
      "node_modules/**/*",
      "!node_modules/.cache",
      "!**/*.map"
    ],
    "extraResources": [],
    "asar": true,
    "asarUnpack": [
      "node_modules/better-sqlite3/**"
    ],
    "protocols": [
      {
        "name": "CloudVault",
        "schemes": ["cloudvault"]
      }
    ],
    "win": {
      "target": [
        { "target": "nsis", "arch": ["x64", "arm64"] }
      ],
      "icon": "build-resources/icon.ico",
      "artifactName": "${productName}-Setup-${version}-${arch}.${ext}"
    },
    "nsis": {
      "oneClick": false,
      "perMachine": false,
      "allowToChangeInstallationDirectory": true,
      "createDesktopShortcut": true,
      "createStartMenuShortcut": true,
      "shortcutName": "CloudVault"
    },
    "mac": {
      "target": [
        { "target": "dmg", "arch": ["x64", "arm64"] }
      ],
      "icon": "build-resources/icon.icns",
      "category": "public.app-category.productivity",
      "hardenedRuntime": true,
      "gatekeeperAssess": false,
      "entitlements": "build-resources/entitlements.mac.plist",
      "entitlementsInherit": "build-resources/entitlements.mac.plist",
      "artifactName": "${productName}-${version}-${arch}.${ext}"
    },
    "linux": {
      "target": [
        { "target": "AppImage", "arch": ["x64", "arm64"] },
        { "target": "deb", "arch": ["x64"] },
        { "target": "rpm", "arch": ["x64"] }
      ],
      "icon": "build-resources/icon.png",
      "category": "Utility",
      "artifactName": "${productName}-${version}-${arch}.${ext}",
      "desktop": {
        "Name": "CloudVault",
        "Comment": "Enterprise S3 File Sync Agent",
        "Categories": "Utility;FileManager;Network"
      }
    },
    "appImage": {
      "artifactName": "${productName}-${version}-${arch}.${ext}"
    },
    "publish": {
      "provider": "github",
      "owner": "your-org",
      "repo": "cloudvault-releases"
    }
  }
}
```

### Key `build` config decisions explained

- `asar: true` — Bundles your app into an archive (faster loading, harder to tamper with)
- `asarUnpack: ["node_modules/better-sqlite3/**"]` — Native modules can't be loaded from inside an asar archive, so they're extracted alongside it
- `protocols` — Registers `cloudvault://` deep links at the OS level during installation
- `files` — Only includes what's needed: main process code, preload, backend, and the Vite build output (`dist/`). Source files (`src/`) are NOT included since they're compiled into `dist/`
- `publish.provider: "github"` — For auto-update. Can also use S3, generic server, etc.

### Directory structure after setup
```
electron-app/
├── build-resources/          ← NEW: icons, entitlements
│   ├── icon.ico              (256x256 minimum, Windows)
│   ├── icon.icns             (macOS, generate from 1024x1024 PNG)
│   ├── icon.png              (512x512, Linux)
│   └── entitlements.mac.plist
├── dist/                     ← Vite build output (renderer)
├── release/                  ← electron-builder output (installers)
├── backend/
├── main/
├── src/                      ← Source (not shipped)
├── main.js
├── preload.js
├── vite.config.js
└── package.json
```

---

## 5. Code Changes Required

### 5.1 — `main.js` (Major Changes)

Here's every change needed in `main.js`:

```js
// ── TOP OF FILE ──────────────────────────────────────────────────────────

// REMOVE: require('dotenv').config();
// REPLACE WITH:
const isDev = !require('electron').app.isPackaged;
if (isDev) require('dotenv').config();

// ADD: Single instance lock (prevents multiple app windows)
const gotTheLock = app.requestSingleInstanceLock();
if (!gotTheLock) {
  app.quit();
  return;
}

// ── IN createWindow() ────────────────────────────────────────────────────

// REMOVE:
//   mainWindow.loadURL('http://localhost:5173');
// REPLACE WITH:
if (isDev) {
  mainWindow.loadURL('http://localhost:5173');
  mainWindow.webContents.openDevTools({ mode: 'detach' });
} else {
  mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
}

// ── ROOT_PATH ────────────────────────────────────────────────────────────

// REMOVE:
//   const ROOT_PATH = process.env.ROOT_PATH || path.join(app.getPath('home'), 'FMS');
// REPLACE WITH:
const ROOT_PATH = process.env.ROOT_PATH || path.join(app.getPath('documents'), 'CloudVault');

// ── ADD: Global error handlers (before app.whenReady) ────────────────────

process.on('uncaughtException', (error) => {
  console.error('[Main] Uncaught Exception:', error);
  // In production, log to file. Don't crash silently.
});

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled Rejection:', reason);
});

// ── ADD: macOS dock behavior ─────────────────────────────────────────────

app.on('activate', () => {
  // macOS: re-create window when dock icon is clicked and no windows exist
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});

// ── CONSIDER: Making window resizable ────────────────────────────────────
// Fixed 1400x800 is unusual for desktop apps. Users with smaller/larger
// screens will have a bad experience. Recommendation:
//   maximizable: true,
//   resizable: true,
//   minWidth: 1024,
//   minHeight: 600,
```

### 5.2 — `vite.config.js`

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  base: './',  // ← CRITICAL: relative paths for file:// protocol
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,  // Don't ship sourcemaps in production
  },
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: true,
  },
});
```

### 5.3 — `index.html` — Add Content Security Policy

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta http-equiv="Content-Security-Policy"
      content="default-src 'self';
               script-src 'self';
               style-src 'self' 'unsafe-inline';
               connect-src 'self' https://*.amazonaws.com https://*.amazoncognito.com https://your-enterprise-url.com;
               img-src 'self' data:;
               font-src 'self';" />
    <title>CloudVault</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

### 5.4 — `backend/database.js` — Fix DB Path for Packaged App

The current `getDbPath()` is fine but add a fallback for the asar-unpacked scenario:

```js
function getDbPath() {
  if (process.env.DB_PATH) return process.env.DB_PATH;
  try {
    const { app } = require('electron');
    // userData is the correct location — persists across updates
    // Windows: %APPDATA%/CloudVault/cloudvault.db
    // macOS:   ~/Library/Application Support/CloudVault/cloudvault.db
    // Linux:   ~/.config/CloudVault/cloudvault.db
    return path.join(app.getPath('userData'), 'cloudvault.db');
  } catch {
    return path.join(__dirname, '..', 'cloudvault.db');
  }
}
```
This is already correct in your code. No change needed here.

### 5.5 — `backend/sync.js` — Remove Hardcoded Path

```js
// REMOVE:
//   const ROOT_PATH = process.env.ROOT_PATH || "/home/abhishek/FMS";
// REPLACE WITH:
const { app } = require('electron');
const ROOT_PATH = process.env.ROOT_PATH || path.join(app.getPath('documents'), 'CloudVault');
```

### 5.6 — `backend/cognito.js` — Remove Client Secret Dependency

For a desktop (public) client, Cognito should be configured without a client secret. If you can't change the Cognito config, at minimum don't hardcode the secret:

```js
// Option A (recommended): Reconfigure Cognito app client as "public" (no secret)
// Then remove computeSecretHash() entirely and remove SECRET_HASH from all auth params.

// Option B (if you must keep the secret): Fetch it from your enterprise backend
// at runtime, never embed it in the app binary.
```

### 5.7 — `backend/upload.js` — Remove Hardcoded Encryption Key

```js
// REMOVE:
//   const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY || "", "hex");
// REPLACE WITH:
const { getEncryptionKey } = require('./config');
// Call getEncryptionKey() lazily when needed, not at module load time
```

---

## 6. Environment & Configuration Management

### Build-time vs Runtime config

| Config Type | Mechanism | Example |
|-------------|-----------|---------|
| Build-time constants | `electron-builder` `extraMetadata` or hardcoded | App version, Cognito pool ID, region |
| Per-environment URLs | Build profiles or runtime config file | Enterprise URL (staging vs prod) |
| Per-machine secrets | Generated on first launch, stored in OS keychain | Encryption key |
| User preferences | `electron-store` | Theme, sync interval, root path |

### Recommended: Runtime config file

For deployments where the enterprise URL varies (e.g., on-prem vs cloud), ship a `config.json` alongside the app:

```json
// Placed in: app.getPath('userData')/config.json
// Or shipped as extraResource and copied on first launch
{
  "enterpriseUrl": "https://cloudvault.yourcompany.com",
  "region": "ap-south-1"
}
```

The app reads this at startup. Admins can edit it without rebuilding.

---

## 7. Platform-Specific Packaging

### 7.1 — Windows

**Format**: NSIS installer (`.exe`) — most familiar to Windows users

**Requirements**:
- Must be built on Windows (or CI with Windows runner)
- Code signing certificate (see Section 9)
- `icon.ico` — 256x256 minimum, multi-resolution recommended

**Deep links**: The NSIS installer registers `cloudvault://` in the Windows registry automatically via the `protocols` config.

**Build command**:
```bash
npm run build:win
```

**Output**: `release/CloudVault-Setup-1.0.0-x64.exe`

### 7.2 — macOS

**Format**: DMG (drag-to-Applications)

**Requirements**:
- Must be built on macOS
- Apple Developer certificate for code signing
- Notarization (required since macOS 10.15)
- `icon.icns` — generate from 1024x1024 PNG using `iconutil` or online tools

**Entitlements file** (`build-resources/entitlements.mac.plist`):
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
  <key>com.apple.security.cs.allow-dyld-environment-variables</key>
  <true/>
  <key>com.apple.security.network.client</key>
  <true/>
  <key>com.apple.security.files.user-selected.read-write</key>
  <true/>
</dict>
</plist>
```

**Build command**:
```bash
npm run build:mac
```

### 7.3 — Linux

**Formats**: AppImage (universal), .deb (Debian/Ubuntu), .rpm (Fedora/RHEL)

**AppImage** is the best choice for broad compatibility:
- Single file, no installation needed
- Works on any Linux distro with FUSE support
- Handles the sandbox helper automatically
- Perfect for cloud VMs

**Build command**:
```bash
npm run build:linux
```

**Output**:
```
release/CloudVault-1.0.0-x64.AppImage
release/cloudvault_1.0.0_amd64.deb
release/cloudvault-1.0.0-1.x86_64.rpm
```

---

## 8. Auto-Update System

### Setup with `electron-updater`

electron-builder includes `electron-updater` which works with GitHub Releases, S3, or a generic server.

**Install**:
```bash
npm install electron-updater
```

**Add to `main.js`**:
```js
// Only in production
if (app.isPackaged) {
  const { autoUpdater } = require('electron-updater');

  autoUpdater.logger = require('electron-log');
  autoUpdater.logger.transports.file.level = 'info';

  autoUpdater.on('update-available', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-available', info.version);
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) {
      mainWindow.webContents.send('update-downloaded', info.version);
    }
  });

  // Check for updates 10 seconds after launch, then every 4 hours
  app.whenReady().then(() => {
    setTimeout(() => autoUpdater.checkForUpdatesAndNotify(), 10000);
    setInterval(() => autoUpdater.checkForUpdatesAndNotify(), 4 * 60 * 60 * 1000);
  });
}
```

**Add IPC for user-triggered install**:
```js
ipcMain.handle('install-update', () => {
  autoUpdater.quitAndInstall();
});
```

### Release flow
1. Bump version in `package.json`
2. Build for target platform
3. Push to GitHub Releases (or your update server)
4. Running apps detect the update and prompt the user

---

## 9. Code Signing

### Why it matters
- Without signing, Windows shows "Unknown Publisher" warnings and SmartScreen may block the installer
- macOS Gatekeeper will refuse to open unsigned apps entirely (since Catalina)
- Linux doesn't enforce signing but it's good practice for enterprise

### Windows
1. Purchase an EV or OV code signing certificate (DigiCert, Sectigo, etc.)
2. Set environment variables before building:
```bash
export CSC_LINK=/path/to/certificate.pfx
export CSC_KEY_PASSWORD=your-password
```
3. electron-builder signs automatically when these are set

### macOS
1. Enroll in Apple Developer Program ($99/year)
2. Create a "Developer ID Application" certificate
3. Set up notarization:
```bash
export APPLE_ID=your@email.com
export APPLE_APP_SPECIFIC_PASSWORD=xxxx-xxxx-xxxx-xxxx
export APPLE_TEAM_ID=XXXXXXXXXX
```
4. Add to `package.json` build config:
```json
"afterSign": "scripts/notarize.js"
```
5. Create `scripts/notarize.js`:
```js
const { notarize } = require('@electron/notarize');

exports.default = async function notarizing(context) {
  if (process.platform !== 'darwin') return;
  const appName = context.packager.appInfo.productFilename;
  return await notarize({
    appBundleId: 'com.yourcompany.cloudvault',
    appPath: `${context.appOutDir}/${appName}.app`,
    appleId: process.env.APPLE_ID,
    appleIdPassword: process.env.APPLE_APP_SPECIFIC_PASSWORD,
    teamId: process.env.APPLE_TEAM_ID,
  });
};
```

---

## 10. Cloud VM Deployment (Headless)

This is the most unique part of your setup — running an Electron app on a cloud VM (EC2, Azure VM, GCP Compute) where there's no physical display.

### 10.1 — Why it works

Your app has a "bot auth" mode (`bot-auth.js`) that doesn't require a browser UI for login. The sync engine runs in the main process. The renderer is only needed for the management UI. On a cloud VM, you can:

1. Run the app with a virtual framebuffer (Xvfb) — the app thinks it has a display
2. Or run headless if you only need the sync engine (requires refactoring)

### 10.2 — Option A: Xvfb (Virtual Display) — Easiest

Run the full Electron app with a virtual display. The UI renders but nobody sees it. The sync engine works normally.

**Setup on Ubuntu/Debian VM**:
```bash
# Install dependencies
sudo apt-get update
sudo apt-get install -y xvfb libgtk-3-0 libnotify4 libnss3 libxss1 \
  libxtst6 xdg-utils libatspi2.0-0 libdrm2 libgbm1 libasound2

# Download the AppImage
chmod +x CloudVault-1.0.0-x64.AppImage

# Run with virtual display
xvfb-run --auto-servernum --server-args="-screen 0 1280x720x24" \
  ./CloudVault-1.0.0-x64.AppImage --no-sandbox
```

**Note**: `--no-sandbox` is acceptable here because the VM itself is the security boundary. The app isn't exposed to untrusted web content.

**Systemd service** (`/etc/systemd/system/cloudvault.service`):
```ini
[Unit]
Description=CloudVault Sync Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=cloudvault
Group=cloudvault
Environment=DISPLAY=:99
ExecStartPre=/usr/bin/Xvfb :99 -screen 0 1280x720x24 -nolisten tcp &
ExecStart=/opt/cloudvault/CloudVault-1.0.0-x64.AppImage --no-sandbox
Restart=on-failure
RestartSec=10
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

### 10.3 — Option B: Headless Sync Service (Recommended for Production VMs)

Extract the sync engine into a standalone Node.js service that doesn't need Electron at all. This is cleaner for server deployments.

**Architecture**:
```
electron-app/          ← Desktop app (with UI)
cloudvault-agent/      ← Headless sync service (Node.js only, no Electron)
  ├── index.js         ← Entry point
  ├── backend/         ← Symlink or copy of electron-app/backend/
  └── package.json     ← Only Node.js deps (no electron, no react)
```

**What needs to change for headless mode**:
- Replace `electron-store` with a file-based config store (e.g., `conf` npm package)
- Replace `app.getPath('userData')` with a configurable path (e.g., `/opt/cloudvault/data`)
- Remove all `mainWindow.webContents.send()` calls (or make them no-ops)
- Remove `dialog`, `shell`, `BrowserWindow` imports
- The sync engine, database, auth, and S3 transfer code are all pure Node.js — they work without Electron

**This is a bigger refactor** but gives you a proper server-grade agent. I'd recommend this as a Phase 2 after you ship the desktop app.

### 10.4 — VM Deployment Checklist

| Step | Command/Action |
|------|---------------|
| 1. Provision VM | Ubuntu 22.04+ LTS, t3.small or equivalent |
| 2. Install deps | `apt-get install xvfb libgtk-3-0 libnss3 libgbm1 libasound2` |
| 3. Create service user | `useradd -r -m -s /bin/bash cloudvault` |
| 4. Copy AppImage | `scp CloudVault-*.AppImage vm:/opt/cloudvault/` |
| 5. Make executable | `chmod +x /opt/cloudvault/CloudVault-*.AppImage` |
| 6. Create config | Place `config.json` in `/home/cloudvault/.config/CloudVault/` |
| 7. Bot registration | Run once interactively to generate keypair and register with enterprise backend |
| 8. Install systemd service | Copy the service file, `systemctl enable cloudvault` |
| 9. Start | `systemctl start cloudvault` |
| 10. Monitor | `journalctl -u cloudvault -f` |

### 10.5 — Docker (Alternative for Cloud)

```dockerfile
FROM ubuntu:22.04

RUN apt-get update && apt-get install -y \
    xvfb libgtk-3-0 libnotify4 libnss3 libxss1 \
    libxtst6 xdg-utils libatspi2.0-0 libdrm2 \
    libgbm1 libasound2 libfuse2 \
    && rm -rf /var/lib/apt/lists/*

COPY CloudVault-*-x64.AppImage /opt/cloudvault/cloudvault
RUN chmod +x /opt/cloudvault/cloudvault

# Extract AppImage (avoids FUSE requirement in containers)
RUN /opt/cloudvault/cloudvault --appimage-extract && \
    mv squashfs-root /opt/cloudvault/app && \
    rm /opt/cloudvault/cloudvault

ENV DISPLAY=:99

ENTRYPOINT ["sh", "-c", "Xvfb :99 -screen 0 1280x720x24 -nolisten tcp & exec /opt/cloudvault/app/cloudvault --no-sandbox"]
```

---

## 11. CI/CD Pipeline

### GitHub Actions (recommended)

Create `.github/workflows/build.yml`:

```yaml
name: Build & Release

on:
  push:
    tags: ['v*']

jobs:
  build-linux:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install dependencies
        run: npm ci
        working-directory: electron-app
      - name: Build
        run: npm run build:linux
        working-directory: electron-app
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
      - uses: actions/upload-artifact@v4
        with:
          name: linux-builds
          path: electron-app/release/*.AppImage

  build-windows:
    runs-on: windows-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install dependencies
        run: npm ci
        working-directory: electron-app
      - name: Build
        run: npm run build:win
        working-directory: electron-app
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CSC_LINK: ${{ secrets.WIN_CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.WIN_CSC_KEY_PASSWORD }}
      - uses: actions/upload-artifact@v4
        with:
          name: windows-builds
          path: electron-app/release/*.exe

  build-macos:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
      - name: Install dependencies
        run: npm ci
        working-directory: electron-app
      - name: Build
        run: npm run build:mac
        working-directory: electron-app
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}
          CSC_LINK: ${{ secrets.MAC_CSC_LINK }}
          CSC_KEY_PASSWORD: ${{ secrets.MAC_CSC_KEY_PASSWORD }}
          APPLE_ID: ${{ secrets.APPLE_ID }}
          APPLE_APP_SPECIFIC_PASSWORD: ${{ secrets.APPLE_APP_SPECIFIC_PASSWORD }}
          APPLE_TEAM_ID: ${{ secrets.APPLE_TEAM_ID }}
      - uses: actions/upload-artifact@v4
        with:
          name: macos-builds
          path: electron-app/release/*.dmg

  release:
    needs: [build-linux, build-windows, build-macos]
    runs-on: ubuntu-latest
    steps:
      - uses: actions/download-artifact@v4
      - uses: softprops/action-gh-release@v2
        with:
          files: |
            linux-builds/*
            windows-builds/*
            macos-builds/*
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

### Release process
```bash
# 1. Bump version
npm version patch  # or minor, major

# 2. Push tag
git push origin main --tags

# 3. CI builds all platforms and creates a GitHub Release
# 4. electron-updater picks up the new release automatically
```

---

## 12. Security Hardening

### 12.1 — IPC Input Validation

Every `ipcMain.handle` should validate its inputs. Currently, your handlers trust whatever the renderer sends. Example fix for `db-query`:

```js
// DANGEROUS — current code allows arbitrary SQL from renderer:
ipcMain.handle('db-query', async (event, args) => {
  const queryText = args.sql || args.text;
  const result = await backend.db.query(queryText, args.params);
  return { rows: result.rows, rowCount: result.rowCount };
});

// SAFER — whitelist allowed queries or remove raw SQL access entirely:
const ALLOWED_QUERIES = new Map([
  ['get-buckets', 'SELECT * FROM "Bucket" ORDER BY name'],
  ['get-files', 'SELECT * FROM "FileObject" WHERE "bucketId" = $1'],
  // ... enumerate all queries the renderer needs
]);

ipcMain.handle('db-query', async (event, { queryId, params }) => {
  const sql = ALLOWED_QUERIES.get(queryId);
  if (!sql) throw new Error(`Unknown query: ${queryId}`);
  const result = await backend.db.query(sql, params || []);
  return { rows: result.rows, rowCount: result.rowCount };
});
```

This is a significant refactor but critical for security. The current `db-query` handler is essentially a SQL injection vector from the renderer process.

### 12.2 — Validate File Paths

Your `main/utils.js` has `validatePath()` but it's not used in most IPC handlers. Add it:

```js
ipcMain.handle('list-path-content', async (event, { folderPath, ...opts }) => {
  if (!validatePath(folderPath, rootPath)) {
    throw new Error('Access denied: path outside root directory');
  }
  return await backend.local.listContent(folderPath, opts.sortBy, opts.filterBy, opts.search);
});
```

### 12.3 — Don't Ship DevTools in Production

```js
// In createWindow():
if (isDev) {
  mainWindow.webContents.openDevTools({ mode: 'detach' });
}

// Also prevent opening via keyboard shortcut in production:
if (!isDev) {
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.key === 'F12' || (input.control && input.shift && input.key === 'I')) {
      event.preventDefault();
    }
  });
}
```

### 12.4 — Logging in Production

Replace `console.log` with a proper logger that writes to files:

```bash
npm install electron-log
```

```js
const log = require('electron-log');

// In production, logs go to:
// Linux:   ~/.config/CloudVault/logs/main.log
// macOS:   ~/Library/Logs/CloudVault/main.log
// Windows: %APPDATA%/CloudVault/logs/main.log

// Replace console.log/error throughout:
log.info('[SyncManager] Started');
log.error('[SyncManager] Failed:', err.message);
```

---

## 13. Testing Before Release

### Pre-release checklist

| # | Test | How |
|---|------|-----|
| 1 | App launches from installer | Install on a clean machine (no Node.js, no dev tools) |
| 2 | Login works (Cognito + SSO + Bot) | Test all three auth flows |
| 3 | Deep link `cloudvault://` works | Click a deep link in browser, verify app opens |
| 4 | Sync engine downloads files | Create a sync config, verify files appear locally |
| 5 | Sync engine uploads files | Drop a file in watched folder, verify it appears in S3 |
| 6 | SQLite DB persists across restarts | Login, quit, relaunch — data should still be there |
| 7 | Auto-update works | Publish a newer version, verify the app detects and installs it |
| 8 | Crash recovery | Kill the process, relaunch — app should recover gracefully |
| 9 | Network interruption | Disconnect WiFi during sync — should retry, not crash |
| 10 | Clean uninstall | Uninstall the app, verify no orphaned files (except userData) |

### Platform-specific tests

| Platform | Extra Tests |
|----------|-------------|
| Windows | SmartScreen doesn't block (requires signing), deep link registry works |
| macOS | Gatekeeper allows launch (requires notarization), dock icon correct |
| Linux | AppImage runs without FUSE errors, .deb installs cleanly, systemd service starts |
| Cloud VM | Xvfb mode works, bot auth + sync runs unattended, survives VM restart |

---

## 14. File-by-File Change List

### Files to MODIFY

| File | Changes |
|------|---------|
| `package.json` | Add `build` config, `electron-builder` devDep, `electron-updater` dep, update scripts, add metadata (author, description, homepage) |
| `main.js` | Dev/prod URL loading, single instance lock, remove dotenv in prod, fix ROOT_PATH, add error handlers, add auto-updater, add macOS activate handler |
| `vite.config.js` | Add `base: './'`, add `build.outDir`, disable sourcemaps in prod |
| `index.html` | Add CSP meta tag |
| `backend/sync.js` | Remove hardcoded `/home/abhishek/FMS` path |
| `backend/upload.js` | Remove hardcoded `ENCRYPTION_KEY` from env, use config module |
| `backend/cognito.js` | Remove client secret (reconfigure Cognito) or fetch at runtime |
| `preload.js` | Add `installUpdate` IPC for auto-updater |
| `.env` | Remove secrets, keep only dev-time overrides |
| `.gitignore` | Add `release/`, `dist/`, `build-resources/*.p12` |

### Files to CREATE

| File | Purpose |
|------|---------|
| `backend/config.js` | Centralized config with per-machine encryption key generation |
| `build-resources/icon.ico` | Windows app icon |
| `build-resources/icon.icns` | macOS app icon |
| `build-resources/icon.png` | Linux app icon (512x512) |
| `build-resources/entitlements.mac.plist` | macOS entitlements for hardened runtime |
| `scripts/notarize.js` | macOS notarization after-sign hook |
| `.github/workflows/build.yml` | CI/CD pipeline for multi-platform builds |

### Files to DELETE or EXCLUDE from build

| File | Reason |
|------|--------|
| `.env` | Must NOT be packaged — excluded by `files` config |
| `docker-compose.yml` | Dev-only |
| `test-sync.js` | Dev-only |
| `notes.md` | Dev-only |
| `electon-temp.txt` | Dev-only |
| `prisma/` | Empty directory, leftover |
| `src/` | Not shipped — compiled into `dist/` by Vite |

---

## Quick Start — Minimum Viable Build

If you want to get a working build ASAP, here's the absolute minimum:

```bash
# 1. Install electron-builder
cd electron-app
npm install --save-dev electron-builder
npm install electron-updater

# 2. Fix main.js (dev/prod URL loading)
# See Section 5.1

# 3. Fix vite.config.js (add base: './')
# See Section 5.2

# 4. Add build config to package.json
# See Section 4

# 5. Create icon placeholder
mkdir -p build-resources
# Place your icon files here (or use a placeholder)

# 6. Build renderer
npx vite build

# 7. Build for your current platform
npx electron-builder --linux  # or --win or --mac

# 8. Find your installer in release/
ls release/
```

That gets you a distributable binary. Everything else (signing, auto-update, CI/CD, security hardening) is incremental improvement.
