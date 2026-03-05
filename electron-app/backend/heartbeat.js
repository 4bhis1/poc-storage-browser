/**
 * backend/heartbeat.js
 * Background heartbeat — validates the session every 5 minutes.
 *
 * Scenarios handled:
 *   - Token expired (401)  → attempt refresh
 *   - Refresh failed (SSO) → emit auth-expired, stop all processes
 *   - Bot revoked (403)    → attempt full handshake re-verification
 *   - Handshake fails      → emit auth-expired (kill switch triggered)
 */

const axios   = require('axios');
const authManager = require('./auth');
const botAuth = require('./bot-auth');

const API_URL      = process.env.ENTERPRISE_URL || 'http://localhost:3000';
const INTERVAL_MS  = 5 * 60 * 1000; // 5 minutes

class HeartbeatManager {
  constructor() {
    this._timer       = null;
    this._onExpired   = null;
    this._authMode    = 'sso'; // 'sso' | 'bot'
  }

  /**
   * Start the heartbeat.
   * @param {'sso'|'bot'} authMode
   * @param {Function} onExpired — called when the session is definitively dead
   */
  start(authMode, onExpired) {
    this.stop();
    this._authMode  = authMode;
    this._onExpired = onExpired;
    this._timer = setInterval(() => this._beat(), INTERVAL_MS);
    if (this._timer.unref) this._timer.unref();
    console.log(`[Heartbeat] Started (mode=${authMode}, interval=5min)`);
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  async _beat() {
    const session = authManager.getSession();
    if (!session?.idToken) {
      this.stop();
      return;
    }

    try {
      await axios.get(`${API_URL}/api/heartbeat`, {
        headers: { Authorization: `Bearer ${session.idToken}` },
        timeout: 10000,
      });
      // All good
    } catch (err) {
      const status = err.response?.status;

      if (status === 401) {
        // Token expired — try refresh
        console.warn('[Heartbeat] 401 — attempting token refresh');
        const refreshResult = await authManager.refreshTokens();
        if (!refreshResult.success) {
          if (this._authMode === 'bot') {
            await this._attemptBotHandshake();
          } else {
            this._expire('Token refresh failed');
          }
        }
      } else if (status === 403 && this._authMode === 'bot') {
        // Bot revoked — kill switch
        console.warn('[Heartbeat] 403 — bot revoked, triggering kill switch');
        this._expire('Bot has been revoked by administrator');
      } else {
        // Network error or other — don't expire, just log
        console.warn('[Heartbeat] Non-fatal error:', err.message);
      }
    }
  }

  async _attemptBotHandshake() {
    const botId = botAuth.getBotId();
    if (!botId) {
      this._expire('No bot ID stored');
      return;
    }
    try {
      const result = await botAuth.performHandshake(botId);
      authManager.login({
        accessToken:  result.accessToken,
        idToken:      result.accessToken,
        refreshToken: result.refreshToken,
        username:     result.email,
        email:        result.email,
      });
      console.log('[Heartbeat] Bot re-handshake successful');
    } catch (err) {
      console.error('[Heartbeat] Bot re-handshake failed:', err.message);
      this._expire('Bot handshake failed — key may have been revoked');
    }
  }

  _expire(reason) {
    console.warn('[Heartbeat] Session expired:', reason);
    this.stop();
    authManager.logout();
    if (this._onExpired) this._onExpired(reason);
  }
}

module.exports = new HeartbeatManager();
