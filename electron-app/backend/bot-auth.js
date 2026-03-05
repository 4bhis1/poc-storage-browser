/**
 * backend/bot-auth.js
 * Bot (machine) identity management for the Electron agent.
 *
 * Uses lazy Store initialization (same pattern as database.js) to avoid
 * calling app.getPath() before the Electron app is fully ready.
 */

const crypto = require('crypto');
const axios  = require('axios');

const API_URL = process.env.ENTERPRISE_URL || 'http://localhost:3000';

// ── Lazy store ────────────────────────────────────────────────────────────────
let _store = null;

function getStore() {
  if (_store) return _store;
  const Store = require('electron-store');
  _store = new Store({
    name: 'cloudvault-bot',
    encryptionKey: process.env.ENCRYPTION_KEY || 'cloudvault-default-key',
    schema: {
      privateKeyPem: { type: 'string', default: '' },
      publicKeyPem:  { type: 'string', default: '' },
      botId:         { type: 'string', default: '' },
    },
  });
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
  store.set('privateKeyPem', privateKey);
  store.set('publicKeyPem',  publicKey);
  store.set('botId', '');

  console.log('[BotAuth] New Ed25519 key pair generated and stored');
  return publicKey;
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
  const privateKeyPem = getStore().get('privateKeyPem');
  if (!privateKeyPem) throw new Error('No private key found — generate a key pair first');

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

  return `${signingInput}.${signature}`;
}

// ── Handshake ─────────────────────────────────────────────────────────────────

async function performHandshake(botId) {
  const signedJwt = signClaim(botId);
  const response  = await axios.post(`${API_URL}/api/bot/verify`, { botId, signedJwt });
  return response.data;
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
