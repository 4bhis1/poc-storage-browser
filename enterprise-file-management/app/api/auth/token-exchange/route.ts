/**
 * POST /api/auth/token-exchange
 *
 * PKCE token exchange for the Electron SSO loopback flow.
 * Body: { code: string, verifier: string }
 *
 * Validates SHA-256(verifier) === stored challenge for this code,
 * then returns the Cognito tokens associated with the code.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { consumeAuthCode } from '@/lib/auth-codes';
import { logAudit } from '@/lib/audit';

export async function POST(request: NextRequest) {
  try {
    const { code, verifier } = await request.json();

    if (!code || !verifier) {
      return NextResponse.json(
        { error: 'Missing code or verifier' },
        { status: 400 },
      );
    }

    const entry = consumeAuthCode(code);
    if (!entry) {
      return NextResponse.json(
        { error: 'Invalid or expired authorization code' },
        { status: 401 },
      );
    }

    // Verify PKCE: SHA-256(verifier) must match the stored challenge
    const derivedChallenge = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url');

    if (derivedChallenge !== entry.challenge) {
      return NextResponse.json(
        { error: 'PKCE verification failed' },
        { status: 401 },
      );
    }

    // Audit the successful exchange (fire-and-forget)
    void logAudit({
      userId:   entry.email,
      action:   'LOGIN',
      resource: 'TokenExchange',
      details:  { method: 'SSO_PKCE', email: entry.email },
      status:   'SUCCESS',
    });

    return NextResponse.json({
      accessToken:  entry.idToken,
      refreshToken: entry.refreshToken,
      email:        entry.email,
    });
  } catch (err) {
    console.error('[token-exchange] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
