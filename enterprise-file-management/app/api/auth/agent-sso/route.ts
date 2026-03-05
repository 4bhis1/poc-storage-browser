/**
 * GET /api/auth/agent-sso
 *
 * PKCE-aware SSO initiation for the Electron Agent loopback flow.
 *
 * Query params:
 *   challenge    — base64url SHA-256(verifier) from the Electron app
 *   redirect_uri — http://127.0.0.1:{port} loopback server
 *
 * Flow:
 *   1. Electron opens this URL in the system browser with challenge + redirect_uri
 *   2. If not logged in → redirect to /login?redirect=<this URL with params>
 *   3. If logged in → generate a one-time auth code, store it with the challenge,
 *      redirect to redirect_uri?code={AUTH_CODE}
 *
 * Legacy fallback (no challenge/redirect_uri): original deep-link behavior preserved.
 */

import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import crypto from 'crypto';
import { getCurrentUser } from '@/lib/session';
import { storeAuthCode } from '@/lib/auth-codes';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const challenge    = searchParams.get('challenge');
  const redirectUri  = searchParams.get('redirect_uri');

  const cookieStore  = await cookies();
  const idToken      = cookieStore.get('accessToken')?.value;
  const refreshToken = cookieStore.get('refreshToken')?.value;

  // ── Not logged in — bounce to login, preserving all params ───────────────
  if (!idToken) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', request.url);
    return NextResponse.redirect(loginUrl);
  }

  const user = await getCurrentUser();
  if (!user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', request.url);
    return NextResponse.redirect(loginUrl);
  }

  // ── PKCE loopback flow ────────────────────────────────────────────────────
  if (challenge && redirectUri) {
    // Validate redirect_uri is a loopback address (security: prevent open redirect)
    let parsedRedirect: URL;
    try {
      parsedRedirect = new URL(redirectUri);
    } catch {
      return NextResponse.json({ error: 'Invalid redirect_uri' }, { status: 400 });
    }

    if (parsedRedirect.hostname !== '127.0.0.1' && parsedRedirect.hostname !== 'localhost') {
      return NextResponse.json(
        { error: 'redirect_uri must be a loopback address' },
        { status: 400 },
      );
    }

    // Generate a one-time auth code
    const code = crypto.randomBytes(32).toString('base64url');

    storeAuthCode(code, {
      challenge,
      idToken:      idToken,
      refreshToken: refreshToken ?? '',
      email:        user.email,
    });

    // Redirect to the loopback server with the code
    const callbackUrl = new URL(redirectUri);
    callbackUrl.searchParams.set('code', code);

    return NextResponse.redirect(callbackUrl.toString());
  }

  // ── Legacy deep-link fallback (no PKCE params) ────────────────────────────
  const deepLink = new URL('cloudvault://auth');
  deepLink.searchParams.set('token', idToken);
  if (refreshToken) deepLink.searchParams.set('refresh', refreshToken);

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Redirecting to CloudVault Agent…</title>
  <script>window.location.href = ${JSON.stringify(deepLink.toString())};</script>
</head>
<body style="font-family:system-ui;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#0f172a;color:#94a3b8">
  <div style="text-align:center">
    <p style="font-size:1.25rem;margin-bottom:0.5rem">Redirecting to CloudVault Agent…</p>
    <p style="font-size:0.875rem">If the app does not open automatically,
    <a href="${deepLink.toString()}" style="color:#3b82f6">click here</a>.</p>
  </div>
</body>
</html>`;

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  });
}
