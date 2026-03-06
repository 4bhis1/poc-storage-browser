/**
 * backend/doctor.js
 * Enterprise-grade diagnostics with step-by-step progress reporting.
 * Each diagnostic emits granular sub-step events to the renderer.
 */

const fs = require('fs/promises');
const path = require('path');
const axios = require('axios');
const tls = require('tls');
const { v4: uuidv4 } = require('uuid');
const { S3Client, CreateMultipartUploadCommand, AbortMultipartUploadCommand } = require('@aws-sdk/client-s3');
const database = require('./database');
const authManager = require('./auth');
const credentialManager = require('./aws-credentials');

const API_URL = process.env.ENTERPRISE_URL || 'http://localhost:3000';

class DoctorManager {
  constructor() {
    this._mainWindow = null;
  }

  initUI(mainWindow) {
    this._mainWindow = mainWindow;
  }

  _emit(event) {
    if (this._mainWindow && !this._mainWindow.isDestroyed()) {
      this._mainWindow.webContents.send('doctor:progress', event);
    }
  }

  /**
   * Run all diagnostics sequentially so the UI can show step-by-step progress.
   */
  async runAll(rootPath) {
    const diagnostics = [];

    const checks = [
      () => this.checkDiskIO(rootPath),
      () => this.checkServiceHealth(),
      () => this.checkClockSkew(),
      () => this.checkProxyDetection(),
      async () => {
        const bucket = await this._getFirstBucket();
        return bucket ? this.checkMultipartHandshake(bucket.id) : this._skipMultipart();
      },
    ];

    for (const check of checks) {
      try {
        const result = await check();
        diagnostics.push(result);
      } catch (err) {
        diagnostics.push({
          name: 'Unknown',
          status: 'fail',
          detail: err.message,
          durationMs: 0,
          steps: [],
        });
      }
    }

    await this._persistDiagnostics(diagnostics);
    this._emit({ type: 'all-complete', diagnostics });
    return diagnostics;
  }

  // ── 1. Disk I/O ───────────────────────────────────────────────────────────
  async checkDiskIO(rootPath) {
    const name = 'Disk I/O';
    const start = Date.now();
    const steps = [];
    const testFile = path.join(rootPath, `.cloudvault-io-test-${Date.now()}.tmp`);
    const renamedFile = path.join(rootPath, `.cloudvault-io-renamed-${Date.now()}.tmp`);
    const testData = Buffer.alloc(1024, 'x');

    const step = (label, status, ms) => {
      const s = { label, status, ms };
      steps.push(s);
      this._emit({ type: 'step', diagnostic: name, step: s, steps: [...steps] });
      console.log(`[Doctor] ${name} → ${label}: ${status} (${ms}ms)`);
    };

    try {
      // Ensure dir
      this._emit({ type: 'start', diagnostic: name });
      await fs.mkdir(rootPath, { recursive: true });
      step('Ensure directory', 'pass', 0);

      // Write
      const w0 = Date.now();
      await fs.writeFile(testFile, testData);
      step('Write 1KB file', 'pass', Date.now() - w0);

      // Read
      const r0 = Date.now();
      await fs.readFile(testFile);
      step('Read file back', 'pass', Date.now() - r0);

      // Rename
      const rn0 = Date.now();
      await fs.rename(testFile, renamedFile);
      step('Rename file', 'pass', Date.now() - rn0);

      // Delete
      const d0 = Date.now();
      await fs.unlink(renamedFile);
      step('Delete file', 'pass', Date.now() - d0);

      const totalMs = Date.now() - start;
      return { name, status: 'pass', detail: steps.map(s => `${s.label}: ${s.ms}ms`).join(' → '), durationMs: totalMs, steps, data: { writeMs: steps[1].ms, readMs: steps[2].ms, renameMs: steps[3].ms, deleteMs: steps[4].ms } };
    } catch (err) {
      step(err.message, 'fail', 0);
      try { await fs.unlink(testFile).catch(() => {}); } catch {}
      try { await fs.unlink(renamedFile).catch(() => {}); } catch {}
      return { name, status: 'fail', detail: err.message, durationMs: Date.now() - start, steps };
    }
  }

  // ── 2. Service Health ─────────────────────────────────────────────────────
  async checkServiceHealth() {
    const name = 'Service Health';
    const start = Date.now();
    const steps = [];

    const step = (label, status, ms) => {
      const s = { label, status, ms };
      steps.push(s);
      this._emit({ type: 'step', diagnostic: name, step: s, steps: [...steps] });
      console.log(`[Doctor] ${name} → ${label}: ${status} (${ms}ms)`);
    };

    this._emit({ type: 'start', diagnostic: name });

    // Check auth
    const session = authManager.getSession();
    if (!session?.idToken) {
      step('Check authentication', 'fail', 0);
      return { name, status: 'fail', detail: 'Not authenticated', durationMs: 0, steps };
    }
    step('Check authentication', 'pass', 0);

    // Hit heartbeat
    try {
      const h0 = Date.now();
      const response = await axios.get(`${API_URL}/api/heartbeat`, {
        headers: { Authorization: `Bearer ${session.idToken}` },
        timeout: 10000,
      });
      step('Ping /api/heartbeat', 'pass', Date.now() - h0);

      // Parse response
      const data = response.data || {};
      step('Parse server response', data.ok ? 'pass' : 'warn', 0);

      // Check server time
      const serverTime = response.headers['date'] || data.serverTime;
      step(`Server time: ${serverTime}`, 'pass', 0);

      return {
        name, status: data.ok ? 'pass' : 'warn',
        detail: data.ok ? 'All services operational' : 'Service degraded',
        durationMs: Date.now() - start, steps,
        data: { serverTime: data.serverTime, type: data.type, ok: data.ok },
      };
    } catch (err) {
      step(`Ping failed: ${err.message}`, 'fail', Date.now() - start);
      return { name, status: 'fail', detail: err.message, durationMs: Date.now() - start, steps };
    }
  }

  // ── 3. Clock Skew ─────────────────────────────────────────────────────────
  async checkClockSkew() {
    const name = 'Clock Skew';
    const start = Date.now();
    const steps = [];

    const step = (label, status, ms) => {
      const s = { label, status, ms };
      steps.push(s);
      this._emit({ type: 'step', diagnostic: name, step: s, steps: [...steps] });
      console.log(`[Doctor] ${name} → ${label}: ${status} (${ms}ms)`);
    };

    this._emit({ type: 'start', diagnostic: name });

    const session = authManager.getSession();
    if (!session?.idToken) {
      step('Check authentication', 'fail', 0);
      return { name, status: 'fail', detail: 'Not authenticated', durationMs: 0, steps };
    }
    step('Check authentication', 'pass', 0);

    try {
      const h0 = Date.now();
      const response = await axios.get(`${API_URL}/api/heartbeat`, {
        headers: { Authorization: `Bearer ${session.idToken}` },
        timeout: 10000,
      });
      step('Fetch server time', 'pass', Date.now() - h0);

      const localTime = Date.now();
      const serverTimeStr = response.headers['date'] || response.data?.serverTime;
      const serverTime = new Date(serverTimeStr).getTime();
      step(`Local: ${new Date(localTime).toISOString()}`, 'pass', 0);
      step(`Server: ${serverTimeStr}`, 'pass', 0);

      const driftMs = Math.abs(localTime - serverTime);
      const driftSec = Math.round(driftMs / 1000);
      const status = driftMs < 5 * 60 * 1000 ? 'pass' : 'fail';
      step(`Drift: ${driftSec}s ${status === 'pass' ? '✓' : '✗ exceeds 5min'}`, status, 0);

      return { name, status, detail: `Drift: ${driftSec}s`, durationMs: Date.now() - start, steps, data: { driftMs, driftSec } };
    } catch (err) {
      step(`Error: ${err.message}`, 'fail', 0);
      return { name, status: 'fail', detail: err.message, durationMs: Date.now() - start, steps };
    }
  }

  // ── 4. Proxy Detection ────────────────────────────────────────────────────
  async checkProxyDetection() {
    const name = 'Proxy Detection';
    const start = Date.now();
    const steps = [];

    const step = (label, status, ms) => {
      const s = { label, status, ms };
      steps.push(s);
      this._emit({ type: 'step', diagnostic: name, step: s, steps: [...steps] });
      console.log(`[Doctor] ${name} → ${label}: ${status} (${ms}ms)`);
    };

    this._emit({ type: 'start', diagnostic: name });
    step('Connecting to s3.amazonaws.com:443', 'pass', 0);

    return new Promise((resolve) => {
      const c0 = Date.now();
      const socket = tls.connect({
        host: 's3.amazonaws.com', port: 443, servername: 's3.amazonaws.com',
        rejectUnauthorized: false,
      }, () => {
        step('TLS handshake complete', 'pass', Date.now() - c0);

        const cert = socket.getPeerCertificate();
        socket.end();

        const issuer = cert.issuer?.O || cert.issuer?.CN || 'Unknown';
        step(`Certificate issuer: ${issuer}`, 'pass', 0);

        const subject = cert.subject?.CN || 'Unknown';
        step(`Certificate subject: ${subject}`, 'pass', 0);

        const isAmazon = issuer.toLowerCase().includes('amazon') ||
                         issuer.toLowerCase().includes('aws') ||
                         subject.includes('amazonaws.com');

        const status = isAmazon ? 'pass' : 'warn';
        step(isAmazon ? 'Direct connection confirmed' : `Proxy detected: ${issuer}`, status, 0);

        resolve({ name, status, detail: isAmazon ? 'Direct connection to AWS S3' : `Proxy: ${issuer}`, durationMs: Date.now() - start, steps, data: { issuer, subject, directConnection: isAmazon } });
      });

      socket.on('error', (err) => {
        step(`Connection error: ${err.message}`, 'fail', Date.now() - c0);
        resolve({ name, status: 'fail', detail: err.message, durationMs: Date.now() - start, steps });
      });

      socket.setTimeout(10000, () => {
        socket.destroy();
        step('Connection timeout (10s)', 'fail', 10000);
        resolve({ name, status: 'fail', detail: 'Timeout', durationMs: Date.now() - start, steps });
      });
    });
  }

  // ── 5. Multipart Handshake ────────────────────────────────────────────────
  async checkMultipartHandshake(bucketId) {
    const name = 'Multipart Handshake';
    const start = Date.now();
    const steps = [];

    const step = (label, status, ms) => {
      const s = { label, status, ms };
      steps.push(s);
      this._emit({ type: 'step', diagnostic: name, step: s, steps: [...steps] });
      console.log(`[Doctor] ${name} → ${label}: ${status} (${ms}ms)`);
    };

    this._emit({ type: 'start', diagnostic: name });

    try {
      // Lookup bucket
      const b0 = Date.now();
      const bucketRes = await database.query('SELECT name, region FROM "Bucket" WHERE id = $1', [bucketId]);
      if (bucketRes.rows.length === 0) {
        step('Lookup bucket', 'fail', Date.now() - b0);
        return { name, status: 'fail', detail: 'Bucket not found', durationMs: Date.now() - start, steps };
      }
      const { name: bucketName, region } = bucketRes.rows[0];
      step(`Lookup bucket: ${bucketName}`, 'pass', Date.now() - b0);

      // Get credentials
      const cr0 = Date.now();
      const credentials = await credentialManager.getCredentialsForBucket(bucketId);
      step('Fetch STS credentials', 'pass', Date.now() - cr0);

      // Build S3 client
      const s3 = new S3Client({
        region: credentials.region || region,
        credentials: { accessKeyId: credentials.accessKeyId, secretAccessKey: credentials.secretAccessKey, sessionToken: credentials.sessionToken },
      });
      step('Initialize S3 client', 'pass', 0);

      // Create multipart upload
      const testKey = `.cloudvault-multipart-test-${Date.now()}.tmp`;
      const cm0 = Date.now();
      const createRes = await s3.send(new CreateMultipartUploadCommand({ Bucket: bucketName, Key: testKey }));
      step(`CreateMultipartUpload (UploadId: ${createRes.UploadId?.substring(0, 12)}...)`, 'pass', Date.now() - cm0);

      // Abort multipart upload
      const ab0 = Date.now();
      await s3.send(new AbortMultipartUploadCommand({ Bucket: bucketName, Key: testKey, UploadId: createRes.UploadId }));
      step('AbortMultipartUpload', 'pass', Date.now() - ab0);

      return { name, status: 'pass', detail: `Multipart permissions validated on ${bucketName}`, durationMs: Date.now() - start, steps };
    } catch (err) {
      step(`Error: ${err.message}`, 'fail', 0);
      return { name, status: 'fail', detail: err.message, durationMs: Date.now() - start, steps };
    }
  }

  // ── Persistence ───────────────────────────────────────────────────────────
  async _persistDiagnostics(diagnostics) {
    try {
      await database.query(`DELETE FROM "DiagnosticsLog"`, []);
      for (const d of diagnostics) {
        await database.query(
          `INSERT INTO "DiagnosticsLog" (id, name, status, detail, "durationMs", data)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [uuidv4(), d.name, d.status, d.detail, d.durationMs || 0,
           JSON.stringify({ data: d.data || null, steps: d.steps || [] })]
        );
      }
      console.log(`[Doctor] Persisted ${diagnostics.length} diagnostics to SQLite`);
    } catch (err) {
      console.error('[Doctor] Failed to persist:', err.message);
    }
  }

  async getLastDiagnostics() {
    try {
      const result = await database.query(`SELECT * FROM "DiagnosticsLog" ORDER BY "ranAt" DESC`);
      return result.rows.map(r => {
        let parsed = {};
        try { parsed = JSON.parse(r.data); } catch {}
        return { ...r, data: parsed?.data || null, steps: parsed?.steps || [] };
      });
    } catch (err) {
      console.error('[Doctor] Failed to fetch:', err.message);
      return [];
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────
  async _getFirstBucket() {
    try {
      const result = await database.query('SELECT id FROM "Bucket" LIMIT 1');
      return result.rows[0] || null;
    } catch { return null; }
  }

  _skipMultipart() {
    return { name: 'Multipart Handshake', status: 'warn', detail: 'Skipped: No buckets available', durationMs: 0, steps: [{ label: 'No buckets in local DB', status: 'warn', ms: 0 }] };
  }
}

module.exports = new DoctorManager();
