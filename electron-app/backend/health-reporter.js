/**
 * backend/health-reporter.js
 * Pushes heartbeat logs + last diagnostics to the enterprise backend every 5 minutes.
 */

const os = require('os');
const axios = require('axios');
const authManager = require('./auth');
const heartbeat = require('./heartbeat');
const doctor = require('./doctor');

const API_URL = require('./config').ENTERPRISE_URL;
const REPORT_INTERVAL = 5 * 60 * 1000; // 5 minutes

class HealthReporter {
  constructor() {
    this._timer = null;
    this._rootPath = null;
  }

  start(rootPath) {
    this.stop();
    this._rootPath = rootPath;
    this._timer = setInterval(() => this._report(), REPORT_INTERVAL);
    if (this._timer.unref) this._timer.unref();
    console.log('[HealthReporter] Started (interval=5min)');
  }

  stop() {
    if (this._timer) {
      clearInterval(this._timer);
      this._timer = null;
    }
  }

  // Manual trigger for testing
  async triggerReport() {
    console.log('[HealthReporter] Manual trigger requested');
    await this._report();
  }

  async _report() {
    const session = authManager.getSession();
    if (!session?.idToken) {
      console.log('[HealthReporter] No session, skipping report');
      return;
    }

    try {
      const [heartbeatLogs, diagnostics] = await Promise.all([
        heartbeat.getHeartbeatHistory(60),
        doctor.getLastDiagnostics(),
      ]);

      console.log(`[HealthReporter] Fetched ${heartbeatLogs.length} heartbeat logs, ${diagnostics.length} diagnostics`);

      let currentStatus = 'UNKNOWN';
      if (heartbeatLogs.length > 0) {
        const latest = heartbeatLogs[heartbeatLogs.length - 1];
        const isRecent = Date.now() - new Date(latest.timestamp).getTime() < 2 * 60 * 1000;
        currentStatus = isRecent && latest.status === 'SUCCESS' ? 'ACTIVE' : 'OFFLINE';
      }

      // Collect machine info
      const machineInfo = this._collectMachineInfo();

      const payload = { heartbeatLogs, diagnostics, currentStatus, machineInfo };

      await axios.post(
        `${API_URL}/api/agent/health`,
        payload,
        { headers: { Authorization: `Bearer ${session.idToken}` }, timeout: 15000 }
      );

      console.log(`[HealthReporter] ✓ Pushed health data (status=${currentStatus}, beats=${heartbeatLogs.length}, diags=${diagnostics.length})`);
    } catch (err) {
      
      console.error('[HealthReporter] Failed:', err.message);
      if (err.response) {
        console.error('[HealthReporter] Response status:', err.response.status);
        console.error('[HealthReporter] Response data:', err.response.data);
      }
    }
  }

  _collectMachineInfo() {
    const networkInterfaces = os.networkInterfaces();
    let ipAddress = null;
    let macAddress = null;

    // Find first non-internal IPv4 address
    for (const [name, interfaces] of Object.entries(networkInterfaces)) {
      if (!interfaces) continue;
      for (const iface of interfaces) {
        if (iface.family === 'IPv4' && !iface.internal) {
          ipAddress = iface.address;
          macAddress = iface.mac;
          break;
        }
      }
      if (ipAddress) break;
    }

    const cpus = os.cpus();
    const totalMem = os.totalmem();
    const freeMem = os.freemem();

    return {
      hostname: os.hostname(),
      os: `${os.type()} ${os.release()}`,
      arch: os.arch(),
      cpuModel: cpus[0]?.model || 'Unknown',
      cpuCores: cpus.length,
      totalMemory: `${(totalMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
      freeMemory: `${(freeMem / 1024 / 1024 / 1024).toFixed(2)} GB`,
      ipAddress,
      macAddress,
      agentVersion: require('../package.json').version || '1.0.0',
    };
  }
}

module.exports = new HealthReporter();
