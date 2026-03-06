/**
 * backend/agent-heartbeat.js
 * Agent heartbeat — validates agent health every 30 seconds.
 * Tracks agent process status, memory, and connectivity.
 */

const { v4: uuidv4 } = require('uuid');
const database = require('./database');

const INTERVAL_MS = 30 * 1000; // 30 seconds

class AgentHeartbeatManager {
  constructor() {
    this._timer = null;
    this._onExpired = null;
  }

  /**
   * Start the agent heartbeat.
   * @param {Function} onExpired — called when agent is definitively dead
   */
  start(onExpired) {
    this.stop();
    this._onExpired = onExpired;
    this._timer = setInterval(() => this._beat(), INTERVAL_MS);
    if (this._timer.unref) this._timer.unref();
    console.log(`[AgentHeartbeat] Started (interval=30s)`);
    
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
    const startTime = Date.now();
    let logStatus = 'SUCCESS';
    let logError = null;

    try {
      // Check if agent process is alive and responsive
      const isHealthy = await this._checkAgentHealth();
      
      if (!isHealthy) {
        logStatus = 'FAILED';
        logError = 'Agent process unhealthy';
      }

      const latencyMs = Date.now() - startTime;
      await this._logAgentHeartbeat(logStatus, latencyMs, logError);

      if (!isHealthy && this._onExpired) {
        this._onExpired('Agent health check failed');
      }
    } catch (err) {
      const latencyMs = Date.now() - startTime;
      logStatus = 'FAILED';
      logError = err.message || 'Unknown error';
      await this._logAgentHeartbeat(logStatus, latencyMs, logError);
      console.error('[AgentHeartbeat] Error:', err.message);
    }
  }

  async _checkAgentHealth() {
    // Placeholder for agent health check logic
    // In production, this would check:
    // - Agent process is running
    // - Memory usage is acceptable
    // - Agent is responsive to pings
    // - No critical errors in logs
    return true;
  }

  async _logAgentHeartbeat(status, latencyMs, error) {
    try {
      await database.query(
        `INSERT INTO "AgentHeartbeatLog" (id, status, "latencyMs", error)
         VALUES ($1, $2, $3, $4)`,
        [uuidv4(), status, latencyMs, error]
      );
    } catch (err) {
      console.error('[AgentHeartbeat] Failed to log heartbeat:', err.message);
    }
  }

  /**
   * Get agent heartbeat history for the last N minutes
   * @param {number} minutes - Number of minutes to fetch (default: 60)
   * @returns {Promise<Array>} Array of agent heartbeat logs
   */
  async getAgentHeartbeatHistory(minutes = 60) {
    try {
      const result = await database.query(
        `SELECT * FROM "AgentHeartbeatLog"
         WHERE "timestamp" > datetime('now', '-${minutes} minutes')
         ORDER BY "timestamp" ASC`
      );
      return result.rows;
    } catch (err) {
      console.error('[AgentHeartbeat] Failed to fetch history:', err.message);
      return [];
    }
  }
}

module.exports = new AgentHeartbeatManager();
