/**
 * backend/pkce.js
 * PKCE (RFC 7636) helpers + loopback HTTP server for the SSO flow.
 *
 * Flow:
 *   1. generatePKCE()          → { verifier, challenge }
 *   2. startLoopbackServer()   → { port, codePromise }
 *      - opens a tiny HTTP server on 127.0.0.1:<random port>
 *      - codePromise resolves with the auth code when the browser redirects back
 *      - auto-closes after receiving the code OR after 5-minute timeout
 */

const http    = require('http');
const crypto  = require('crypto');
const net     = require('net');

// ── PKCE helpers ─────────────────────────────────────────────────────────────

/**
 * Generate a cryptographically random code_verifier (43-128 chars, base64url).
 */
function generateVerifier() {
  return crypto.randomBytes(64).toString('base64url');
}

/**
 * Derive the code_challenge from the verifier: SHA-256 → base64url.
 */
function deriveChallenge(verifier) {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

/**
 * Returns { verifier, challenge } — pass challenge to the browser, keep verifier secret.
 */
function generatePKCE() {
  const verifier  = generateVerifier();
  const challenge = deriveChallenge(verifier);
  return { verifier, challenge };
}

// ── Port finder ───────────────────────────────────────────────────────────────

function findFreePort() {
  return new Promise((resolve, reject) => {
    const srv = net.createServer();
    srv.listen(0, '127.0.0.1', () => {
      const { port } = srv.address();
      srv.close(() => resolve(port));
    });
    srv.on('error', reject);
  });
}

// ── Loopback server ───────────────────────────────────────────────────────────

const TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Start a temporary HTTP server on 127.0.0.1:<port>.
 * Returns { port, codePromise }.
 *
 * codePromise resolves with the auth code string, or rejects on timeout.
 */
async function startLoopbackServer() {
  const port = await findFreePort();

  const codePromise = new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      try {
        const url    = new URL(req.url, `http://127.0.0.1:${port}`);
        const code   = url.searchParams.get('code');
        const error  = url.searchParams.get('error');

        // Always send a friendly HTML response so the browser tab closes cleanly
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><title>Datadock-Porter — Auth Complete</title></head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#94a3b8">
  <div style="text-align:center">
    <p style="font-size:1.5rem;color:#22c55e;margin-bottom:0.5rem">✓ Authentication complete</p>
    <p style="font-size:0.875rem">You can close this tab and return to Datadock.</p>
  </div>
</body>
</html>`);

        cleanup();

        if (error) {
          reject(new Error(`SSO error: ${error}`));
        } else if (code) {
          resolve(code);
        } else {
          reject(new Error('No auth code received from SSO callback'));
        }
      } catch (err) {
        cleanup();
        reject(err);
      }
    });

    let timer;

    function cleanup() {
      clearTimeout(timer);
      server.close();
    }

    timer = setTimeout(() => {
      cleanup();
      reject(new Error('SSO login timed out after 5 minutes'));
    }, TIMEOUT_MS);

    server.listen(port, '127.0.0.1', () => {
      console.log(`[PKCE] Loopback server listening on http://127.0.0.1:${port}`);
    });

    server.on('error', (err) => {
      cleanup();
      reject(err);
    });
  });

  return { port, codePromise };
}

module.exports = { generatePKCE, startLoopbackServer };
