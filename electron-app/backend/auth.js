/**
 * backend/auth.js
 * Full AuthManager — persists tokens in electron-store across app restarts
 * and proactively refreshes the IdToken 5 minutes before it expires.
 */

const Store = require('electron-store');
const cognito = require('./cognito');

const store = new Store({
  name: 'cloudvault-auth',
  encryptionKey: process.env.ENCRYPTION_KEY || 'cloudvault-default-key',
  schema: {
    accessToken:  { type: 'string', default: '' },
    idToken:      { type: 'string', default: '' },
    refreshToken: { type: 'string', default: '' },
    username:     { type: 'string', default: '' },
    email:        { type: 'string', default: '' },
  },
});

class AuthManager {
  constructor() {
    this._refreshTimer = null;
    // Kick off proactive refresh if we already have tokens from a prior session
    const session = this.getSession();
    if (session && session.idToken) {
      this._scheduleRefresh(session.idToken);
    }
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /**
   * Persist tokens returned by cognito.js and schedule a proactive refresh.
   * @param {{ accessToken, idToken, refreshToken, username, email? }} result
   */
  login(result) {
    store.set('accessToken',  result.accessToken  || '');
    store.set('idToken',      result.idToken      || '');
    store.set('refreshToken', result.refreshToken || '');
    store.set('username',     result.username     || result.email || '');
    store.set('email',        result.email        || result.username || '');
    console.log('[AuthManager] Tokens saved to store for:', store.get('email'));
    this._scheduleRefresh(result.idToken);
  }
  /**
   * Use the stored refreshToken to get a new accessToken + idToken from Cognito.
   * @returns {{ success, accessToken, idToken }}
   */
  async refreshTokens() {
    const refreshToken = store.get('refreshToken');
    const username     = store.get('username');
    if (!refreshToken || !username) {
      return { success: false, error: 'No refresh token stored' };
    }
    try {
      const result = await cognito.refreshCognitoToken(refreshToken, username);
      store.set('accessToken', result.accessToken);
      store.set('idToken',     result.idToken);
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
    store.set('accessToken',  '');
    store.set('idToken',      '');
    store.set('refreshToken', '');
    store.set('username',     '');
    store.set('email',        '');
    console.log('[AuthManager] Logged out — store cleared');
  }

  /**
   * Return the current session from the store.
   * @returns {{ accessToken, idToken, refreshToken, username, email } | null}
   */
  getSession() {
    const accessToken = store.get('accessToken');
    if (!accessToken) return null;
    return {
      accessToken,
      idToken:      store.get('idToken'),
      refreshToken: store.get('refreshToken'),
      username:     store.get('username'),
      email:        store.get('email'),
    };
  }

  /** Decode the IdToken JWT and check if it is expired. */
  isTokenExpired() {
    const idToken = store.get('idToken');
    if (!idToken) return true;
    const exp = this._decodeExp(idToken);
    if (!exp) return true;
    return Date.now() >= exp * 1000;
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
