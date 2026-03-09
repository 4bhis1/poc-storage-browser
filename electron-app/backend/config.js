/**
 * backend/config.js
 * Centralized config — separates build-time constants from runtime secrets.
 * All backend modules should import from here instead of reading process.env directly.
 *
 * SECURITY MODEL:
 *   - Public Cognito config (pool ID, client ID, region) → hardcoded (safe to embed)
 *   - ENTERPRISE_URL → hardcoded per environment
 *   - ENCRYPTION_KEY → generated per-machine on first launch, stored via safeStorage
 *   - COGNITO_CLIENT_SECRET → still read from env (dev) or should be removed from Cognito config
 *   - ROOT_PATH → defaults to Documents/CloudVault, overridable via env in dev
 */

const path = require('path');
const crypto = require('crypto');
const fs = require('fs');

// ── Detect environment ────────────────────────────────────────────────────────
let _app = null;
function getApp() {
  if (_app) return _app;
  try {
    _app = require('electron').app;
    return _app;
  } catch {
    return null;
  }
}

const isDev = (() => {
  const app = getApp();
  if (app) return !app.isPackaged;
  return process.env.NODE_ENV !== 'production';
})();

// ── Build-time constants (safe to hardcode — public client config) ────────────
const COGNITO_USER_POOL_ID = 'ap-south-1_LDgq3ayzF';
const COGNITO_CLIENT_ID    = '2tstbe7suat4m124f06selfpul';
const AWS_REGION           = 'ap-south-1';

// ── Enterprise URL ────────────────────────────────────────────────────────────
const ENTERPRISE_URL = isDev
  ? (process.env.ENTERPRISE_URL || 'http://localhost:3000')
  : 'http://app-alb-b9be2ea-273491884.ap-south-1.elb.amazonaws.com';

// ── Root sync path ────────────────────────────────────────────────────────────
function getRootPath() {
  if (process.env.ROOT_PATH) return process.env.ROOT_PATH;
  const app = getApp();
  if (app) return path.join(app.getPath('documents'), 'CloudVault');
  return path.join(require('os').homedir(), 'CloudVault');
}

// ── Per-machine encryption key via safeStorage ────────────────────────────────
// Falls back to env var in dev, generates a random key on first launch in prod.
let _encryptionKey = null;

function getEncryptionKey() {
  if (_encryptionKey) return _encryptionKey;

  // Dev: use .env value
  if (isDev && process.env.ENCRYPTION_KEY) {
    _encryptionKey = process.env.ENCRYPTION_KEY;
    return _encryptionKey;
  }

  const app = getApp();
  if (!app) {
    // Fallback for non-Electron context (tests, etc.)
    _encryptionKey = process.env.ENCRYPTION_KEY || 'cloudvault-default-key';
    return _encryptionKey;
  }

  const keyPath = path.join(app.getPath('userData'), '.enc-key');

  try {
    const { safeStorage } = require('electron');

    if (fs.existsSync(keyPath)) {
      const raw = fs.readFileSync(keyPath);
      if (safeStorage.isEncryptionAvailable()) {
        _encryptionKey = safeStorage.decryptString(raw);
      } else {
        _encryptionKey = raw.toString('utf8');
      }
    } else {
      // First launch — generate and persist
      const newKey = crypto.randomBytes(32).toString('hex');
      if (safeStorage.isEncryptionAvailable()) {
        fs.writeFileSync(keyPath, safeStorage.encryptString(newKey));
      } else {
        fs.writeFileSync(keyPath, newKey, 'utf8');
      }
      _encryptionKey = newKey;
    }
  } catch (err) {
    console.warn('[Config] safeStorage unavailable, using fallback key:', err.message);
    _encryptionKey = process.env.ENCRYPTION_KEY || 'cloudvault-default-key';
  }

  return _encryptionKey;
}

// ── Cognito client secret (still env-driven — ideally remove from Cognito config) ──
const COGNITO_CLIENT_SECRET = process.env.COGNITO_CLIENT_SECRET || '';

module.exports = {
  isDev,
  COGNITO_USER_POOL_ID,
  COGNITO_CLIENT_ID,
  COGNITO_CLIENT_SECRET,
  AWS_REGION,
  ENTERPRISE_URL,
  getRootPath,
  getEncryptionKey,
};
