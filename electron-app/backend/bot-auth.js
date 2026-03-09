/**
 * backend/bot-auth.js
 * Bot (machine) identity management for the Electron agent.
 *
 * Uses lazy Store initialization (same pattern as database.js) to avoid
 * calling app.getPath() before the Electron app is fully ready.
 */

const crypto = require('crypto');
const axios  = require('axios');
const os     = require('os');

const { ENTERPRISE_URL, getEncryptionKey } = require('./config');
const API_URL = ENTERPRISE_URL;

// ── Machine-specific encryption key ──────────────────────────────────────────
function getMachineKey() {
  const hostname = os.hostname();
  const userInfo = os.userInfo();
  const machineId = `${hostname}-${userInfo.username}`;
  return crypto.createHash('sha256').update(machineId).digest();
}

function encryptPrivateKey(privateKeyPem) {
  const machineKey = getMachineKey();
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipher('aes-256-cbc', machineKey);
  let encrypted = cipher.update(privateKeyPem, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return iv.toString('hex') + ':' + encrypted;
}

function decryptPrivateKey(encryptedData) {
  const machineKey = getMachineKey();
  const [ivHex, encrypted] = encryptedData.split(':');
  const decipher = crypto.createDecipher('aes-256-cbc', machineKey);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

// ── Lazy store ────────────────────────────────────────────────────────────────
let _store = null;

function getStore() {
  if (_store) return _store;
  const Store = require('electron-store');
  try {
    _store = new Store({
      name: 'cloudvault-bot',
      encryptionKey: getEncryptionKey(),
      schema: {
        privateKeyPem: { type: 'string', default: '' },
        publicKeyPem:  { type: 'string', default: '' },
        botId:         { type: 'string', default: '' },
      },
    });
  } catch (err) {
    console.warn('[BotAuth] Store initialization failed, attempting recovery:', err.message);
    // Clear corrupted store file and retry
    try {
      const path = require('path');
      const app = require('electron').app;
      const storeDir = path.join(app.getPath('userData'), 'cloudvault-bot.json');
      const fs = require('fs');
      if (fs.existsSync(storeDir)) {
        fs.unlinkSync(storeDir);
        console.log('[BotAuth] Removed corrupted store file, retrying...');
      }
      _store = new Store({
        name: 'cloudvault-bot',
        encryptionKey: getEncryptionKey(),
        schema: {
          privateKeyPem: { type: 'string', default: '' },
          publicKeyPem:  { type: 'string', default: '' },
          botId:         { type: 'string', default: '' },
        },
      });
    } catch (retryErr) {
      console.error('[BotAuth] Store recovery failed:', retryErr.message);
      throw retryErr;
    }
  }
  return _store;
}

// ── Key Generation ────────────────────────────────────────────────────────────

/**
 * Generate a new Ed25519 key pair and persist it.
 * Returns the public key PEM (safe to share).
 */
function generateKeyPair() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync('ed25519', {
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding:  { type: 'spki',  format: 'pem' },
  });

  const store = getStore();
  // Encrypt private key with machine-specific key
  const encryptedPrivateKey = encryptPrivateKey(privateKey);
  store.set('privateKeyPem', encryptedPrivateKey);
  store.set('publicKeyPem',  publicKey);
  store.set('botId', '');

  console.log('[BotAuth] New Ed25519 key pair generated and stored (machine-encrypted)');
  return publicKey; // standard PEM with newlines — safe to paste
}

function getPublicKey() {
  return getStore().get('publicKeyPem') || null;
}

function hasKeyPair() {
  return !!getStore().get('privateKeyPem');
}

function saveBotId(botId) {
  getStore().set('botId', botId);
}

function getBotId() {
  return getStore().get('botId') || null;
}

function clearBotIdentity() {
  const store = getStore();
  store.set('privateKeyPem', '');
  store.set('publicKeyPem',  '');
  store.set('botId', '');
  console.log('[BotAuth] Bot identity cleared');
}

// ── JWT Signing ───────────────────────────────────────────────────────────────

function signClaim(botId) {
  const encryptedPrivateKey = getStore().get('privateKeyPem');
  if (!encryptedPrivateKey) throw new Error('No private key found — generate a key pair first');

  let privateKeyPem;
  try {
    // Try to decrypt with machine key first
    privateKeyPem = decryptPrivateKey(encryptedPrivateKey);
  } catch (err) {
    // Fallback for legacy unencrypted keys
    console.warn('[BotAuth] Using legacy unencrypted private key');
    privateKeyPem = encryptedPrivateKey;
  }

  const storedBotId = getStore().get('botId');
  console.log('[BotAuth] signClaim — botId arg:', botId, '| stored botId:', storedBotId);
  console.log('[BotAuth] publicKey (first 60):', (getStore().get('publicKeyPem') || '').substring(0, 60));

  const header  = Buffer.from(JSON.stringify({ alg: 'EdDSA', typ: 'JWT' })).toString('base64url');
  const now     = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(JSON.stringify({
    bot_id: botId,
    iat:    now,
    exp:    now + 300,
  })).toString('base64url');

  const signingInput = `${header}.${payload}`;
  const privateKey   = crypto.createPrivateKey(privateKeyPem);
  const signature    = crypto.sign(null, Buffer.from(signingInput), privateKey).toString('base64url');

  const jwt = `${signingInput}.${signature}`;
  console.log('[BotAuth] signed JWT (first 80):', jwt.substring(0, 80));
  return jwt;
}

// ── Handshake ─────────────────────────────────────────────────────────────────

async function performHandshake(botId) {
  const signedJwt = signClaim(botId);
  console.log('[BotAuth] performHandshake — posting to:', `${API_URL}/api/bot/verify`);
  try {
    const response  = await axios.post(`${API_URL}/api/bot/verify`, { botId, signedJwt });
    return response.data;
  } catch (err) {
    const body = err.response?.data;
    console.error('[BotAuth] handshake HTTP error:', err.response?.status, JSON.stringify(body));
    throw new Error(body?.error || err.message);
  }
}

async function refreshBotTokens(refreshToken) {
  const response = await axios.post(`${API_URL}/api/bot/refresh`, { refreshToken });
  return response.data;
}

module.exports = {
  generateKeyPair,
  getPublicKey,
  hasKeyPair,
  saveBotId,
  getBotId,
  clearBotIdentity,
  signClaim,
  performHandshake,
  refreshBotTokens,
};
