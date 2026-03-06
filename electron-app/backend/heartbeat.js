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
const { v4: uuidv4 } = require('uuid');
const authManager = require('./auth');
const botAuth = require('./bot-auth');
const database = require('./database');

const API_URL      = process.env.ENTERPRISE_URL || 'http://localhost:3000';
const INTERVAL_MS  = 30 * 1000; // 30 seconds

class HeartbeatManager {
  constructor() {
    this._timer       = null;
    this._onExpired   = null;
    this._authMode    = 'sso'; // 'sso' | 'bot'
    this._mainWindow  = null;
  }

  initUI(mainWindow) {
    this._mainWindow = mainWindow;
  }

  _emitStatus(status, latencyMs, serverTime) {
    if (this._mainWindow && !this._mainWindow.isDestroyed()) {
      this._mainWindow.webContents.send('heartbeat:status', { status, latencyMs, serverTime, timestamp: new Date().toISOString() });
    }
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
    console.log(`[Heartbeat] Started (mode=${authMode}, interval=30s)`);
    
    // Send first heartbeat immediately
    this._beat();
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

    const startTime = Date.now();
    let logStatus = 'SUCCESS';
    let logError = null;
    let serverTime = null;

    try {
      const response = await axios.get(`${API_URL}/api/heartbeat`, {
        headers: { Authorization: `Bearer ${session.idToken}` },
        timeout: 10000,
      });
      
      const latencyMs = Date.now() - startTime;
      serverTime = response.headers['date'] || response.data?.serverTime || new Date().toISOString();
      
      // Log successful heartbeat
      console.log(`[Heartbeat] ✓ OK — ${latencyMs}ms (server: ${serverTime})`);
      await this._logHeartbeat('SUCCESS', latencyMs, null, serverTime);
      this._emitStatus('SUCCESS', latencyMs, serverTime);
      
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      const status = err.response?.status;

      if (status === 401) {
        logStatus = 'FAILED';
        logError = '401 Unauthorized';
        await this._logHeartbeat(logStatus, latencyMs, logError, null);
        
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
        logStatus = 'FAILED';
        logError = '403 Bot Revoked';
        await this._logHeartbeat(logStatus, latencyMs, logError, null);
        
        // Bot revoked — kill switch
        console.warn('[Heartbeat] 403 — bot revoked, triggering kill switch');
        this._expire('Bot has been revoked by administrator');
      } else {
        logStatus = 'FAILED';
        logError = err.message || 'Network error';
        await this._logHeartbeat(logStatus, latencyMs, logError, null);
        
        // Network error or other — don't expire, just log
        console.warn('[Heartbeat] Non-fatal error:', err.message);
        this._emitStatus('FAILED', latencyMs, null);
      }
    }
  }

  async _logHeartbeat(status, latencyMs, error, serverTime) {
    try {
      await database.query(
        `INSERT INTO "HeartbeatLog" (id, status, "latencyMs", error, "serverTime")
         VALUES ($1, $2, $3, $4, $5)`,
        [uuidv4(), status, latencyMs, error, serverTime]
      );
    } catch (err) {
      console.error('[Heartbeat] Failed to log heartbeat:', err.message);
    }
  }

  /**
   * Get heartbeat history for the last N minutes
   * @param {number} minutes - Number of minutes to fetch (default: 60)
   * @returns {Promise<Array>} Array of heartbeat logs
   */
  async getHeartbeatHistory(minutes = 60) {
    try {
      const result = await database.query(
        `SELECT * FROM "HeartbeatLog"
         WHERE "timestamp" > datetime('now', '-${minutes} minutes')
         ORDER BY "timestamp" ASC`
      );
      return result.rows;
    } catch (err) {
      console.error('[Heartbeat] Failed to fetch history:', err.message);
      return [];
    }
  }

  async _attemptBotHandshake() {
    const botId = botAuth.getBotId();
    if (!botId) {
      this._expire('No bot ID stored');
      return;
    }
    
    console.log('[Heartbeat] Attempting bot re-handshake for:', botId);
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
      
      // Log successful recovery
      await this._logHeartbeat('SUCCESS', 0, 'Recovered via re-handshake', null);
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
