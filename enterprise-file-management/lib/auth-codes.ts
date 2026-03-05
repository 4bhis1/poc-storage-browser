/**
 * lib/auth-codes.ts
 * In-memory one-time authorization code store for the PKCE SSO loopback flow.
 *
 * Each code maps to: { challenge, idToken, refreshToken, email, createdAt }
 * Codes expire after 5 minutes and are deleted on first use.
 *
 * TODO (production): Replace with Redis for multi-instance deployments.
 *   Key: `auth_code:{code}`, TTL: 300s
 */

interface AuthCodeEntry {
  challenge:    string;   // SHA-256(verifier) base64url — must match on exchange
  idToken:      string;
  refreshToken: string;
  email:        string;
  createdAt:    number;   // Date.now()
}

const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// Module-level singleton map
const store = new Map<string, AuthCodeEntry>();

function pruneExpired() {
  const now = Date.now();
  for (const [code, entry] of store.entries()) {
    if (now - entry.createdAt > CODE_TTL_MS) {
      store.delete(code);
    }
  }
}

/**
 * Store a new one-time auth code.
 */
export function storeAuthCode(
  code: string,
  entry: Omit<AuthCodeEntry, 'createdAt'>,
): void {
  pruneExpired();
  store.set(code, { ...entry, createdAt: Date.now() });
}

/**
 * Consume an auth code — returns the entry and deletes it (one-time use).
 * Returns null if the code is not found or has expired.
 */
export function consumeAuthCode(code: string): AuthCodeEntry | null {
  pruneExpired();
  const entry = store.get(code);
  if (!entry) return null;
  store.delete(code);
  if (Date.now() - entry.createdAt > CODE_TTL_MS) return null;
  return entry;
}
