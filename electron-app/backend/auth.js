/**
 * backend/auth.js
 * Full AuthManager — persists tokens in electron-store across app restarts
 * and proactively refreshes the IdToken 5 minutes before it expires.
 */

const Store = require('electron-store');
const cognito = require('./cognito');
const { getEncryptionKey } = require('./config');

let store = null;

function getStore() {
  if (store) return store;
  
  try {
    store = new Store({
      name: 'cloudvault-auth',
      encryptionKey: getEncryptionKey(),
      schema: {
        accessToken:  { type: 'string', default: '' },
        idToken:      { type: 'string', default: '' },
        refreshToken: { type: 'string', default: '' },
        username:     { type: 'string', default: '' },
        email:        { type: 'string', default: '' },
      },
    });
  } catch (err) {
    console.warn('[AuthManager] Store initialization failed, attempting recovery:', err.message);
    
    // Clear corrupted store file and retry
    try {
      const path = require('path');
      const fs = require('fs');
      const app = require('electron').app;
      const storeFile = path.join(app.getPath('userData'), 'cloudvault-auth.json');
      
      if (fs.existsSync(storeFile)) {
        fs.unlinkSync(storeFile);
        console.log('[AuthManager] Removed corrupted store file, retrying...');
      }
      
      // Retry store initialization
      store = new Store({
        name: 'cloudvault-auth',
        encryptionKey: getEncryptionKey(),
        schema: {
          accessToken:  { type: 'string', default: '' },
          idToken:      { type: 'string', default: '' },
          refreshToken: { type: 'string', default: '' },
          username:     { type: 'string', default: '' },
          email:        { type: 'string', default: '' },
        },
      });
      console.log('[AuthManager] Store recovered successfully');
    } catch (retryErr) {
      console.error('[AuthManager] Store recovery failed:', retryErr.message);
      throw retryErr;
    }
  }
  
  return store;
}

class AuthManager {
  constructor() {
    this._refreshTimer = null;
    // Kick off proactive refresh if we already have tokens from a prior session
    try {
      const session = this.getSession();
      if (session && session.idToken) {
        this._scheduleRefresh(session.idToken);
      }
    } catch (err) {
      console.warn('[AuthManager] Could not load session on startup:', err.message);
      // Non-fatal — user will need to log in
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Persist tokens returned by cognito.js and schedule a proactive refresh.
   * @param {{ accessToken, idToken, refreshToken, username, email? }} result
   */
  login(result) {
    const s = getStore();
    s.set('accessToken',  result.accessToken  || '');
    s.set('idToken',      result.idToken      || '');
    s.set('refreshToken', result.refreshToken || '');
    s.set('username',     result.username     || result.email || '');
    s.set('email',        result.email        || result.username || '');
    console.log('[AuthManager] Tokens saved to store for:', s.get('email'));
    this._scheduleRefresh(result.idToken);

    // Clear stale AWS credential cache on every login to prevent
    // cross-user credential leakage (fixes 403 errors after re-login)
    try {
      const credentialManager = require('./aws-credentials');
      credentialManager.clear();
    } catch (e) {
      console.warn('[AuthManager] Could not clear credential cache on login:', e.message);
    }
  }
  /**
   * Use the stored refreshToken to get a new accessToken + idToken from Cognito.
   * @returns {{ success, accessToken, idToken }}
   */
  async refreshTokens() {
    const s = getStore();
    const refreshToken = s.get('refreshToken');
    const username     = s.get('username');
    if (!refreshToken || !username) {
      return { success: false, error: 'No refresh token stored' };
    }
    try {
      const result = await cognito.refreshCognitoToken(refreshToken, username);
      s.set('accessToken', result.accessToken);
      s.set('idToken',     result.idToken);
      console.log('[AuthManager] Tokens refreshed silently');
      this._scheduleRefresh(result.idToken);
      return { success: true, accessToken: result.accessToken, idToken: result.idToken };
    } catch (err) {
      console.error('[AuthManager] Silent refresh failed:', err.message);
      return { success: false, error: err.message };
    }
  }

  /** Clear all stored tokens and cancel the refresh timer. */
  logout() {
    this._cancelRefresh();
    const s = getStore();
    s.set('accessToken',  '');
    s.set('idToken',      '');
    s.set('refreshToken', '');
    s.set('username',     '');
    s.set('email',        '');
    console.log('[AuthManager] Logged out — store cleared');
    
    // Clear AWS credential cache
    const credentialManager = require('./aws-credentials');
    credentialManager.clear();
  }

  /**
   * Return the current session from the store.
   * @returns {{ accessToken, idToken, refreshToken, username, email } | null}
   */
  getSession() {
    try {
      const s = getStore();
      const accessToken = s.get('accessToken');
      if (!accessToken) return null;
      return {
        accessToken,
        idToken:      s.get('idToken'),
        refreshToken: s.get('refreshToken'),
        username:     s.get('username'),
        email:        s.get('email'),
      };
    } catch (err) {
      console.warn('[AuthManager] getSession error:', err.message);
      return null;
    }
  }

  /** Get the current token (alias for backward compatibility) */
  getToken() {
    try {
      const s = getStore();
      return s.get('idToken') || null;
    } catch (err) {
      console.warn('[AuthManager] getToken error:', err.message);
      return null;
    }
  }

  /**
   * Returns the stable user identifier for the current session.
   * Uses email as the primary key (consistent with how userId is stored in DB).
   * @returns {string|null}
   */
  getCurrentUserId() {
    try {
      const session = this.getSession();
      return session?.email || session?.username || null;
    } catch (err) {
      console.warn('[AuthManager] getCurrentUserId error:', err.message);
      return null;
    }
  }

  /**
   * Returns both userId and botId for the current session.
   * @returns {{ userId: string|null, botId: string|null }}
   */
  getCurrentIdentity() {
    try {
      const userId = this.getCurrentUserId();
      let botId = null;
      try {
        const botAuth = require('./bot-auth');
        botId = botAuth.getBotId() || null;
      } catch {}
      return { userId, botId };
    } catch (err) {
      console.warn('[AuthManager] getCurrentIdentity error:', err.message);
      return { userId: null, botId: null };
    }
  }

  /** Decode the IdToken JWT and check if it is expired. */
  isTokenExpired() {
    try {
      const s = getStore();
      const idToken = s.get('idToken');
      if (!idToken) return true;
      const exp = this._decodeExp(idToken);
      if (!exp) return true;
      return Date.now() >= exp * 1000;
    } catch (err) {
      console.warn('[AuthManager] isTokenExpired error:', err.message);
      return true;
    }
  }

  // ─── Internal helpers ──────────────────────────────────────────────────────

  /** Decode the `exp` claim from a JWT without verifying the signature. */
  _decodeExp(jwt) {
    try {
      const payload = jwt.split('.')[1];
      const decoded = JSON.parse(Buffer.from(payload, 'base64').toString('utf8'));
      return decoded.exp || null;
    } catch {
      return null;
    }
  }

  /**
   * Set a timer to refresh tokens 5 minutes before the IdToken expires.
   * Cancels any existing timer first.
   */
  _scheduleRefresh(idToken) {
    this._cancelRefresh();
    if (!idToken) return;

    const exp = this._decodeExp(idToken);
    if (!exp) return;

    const msUntilExpiry = exp * 1000 - Date.now();
    const FIVE_MINUTES  = 5 * 60 * 1000;
    const msUntilRefresh = msUntilExpiry - FIVE_MINUTES;

    if (msUntilRefresh <= 0) {
      // Token already close to expiry — refresh immediately
      this.refreshTokens();
      return;
    }

    console.log(`[AuthManager] Proactive refresh scheduled in ${Math.round(msUntilRefresh / 60000)} min`);
    this._refreshTimer = setTimeout(async () => {
      await this.refreshTokens();
    }, msUntilRefresh);

    // Prevent this timer from keeping the Node process alive
    if (this._refreshTimer.unref) this._refreshTimer.unref();
  }

  _cancelRefresh() {
    if (this._refreshTimer) {
      clearTimeout(this._refreshTimer);
      this._refreshTimer = null;
    }
  }
}

module.exports = new AuthManager();
