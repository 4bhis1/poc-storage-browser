import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getCurrentUser } from '@/lib/session';

/**
 * GET /api/auth/agent-sso
 *
 * Called by the Electron Agent after the user clicks "Login via Browser".
 * Reads the existing Cognito session cookies (set by /api/auth/login or the
 * Google OAuth callback) and redirects the OS to the cloudvault:// custom
 * protocol so the Electron main process can capture the tokens.
 *
 * Flow:
 *  1. Electron opens this URL in the system browser
 *  2. If the user is already logged in (cookie present) → redirect immediately
 *  3. If not logged in → redirect to /login?redirect=/api/auth/agent-sso
 *  4. Electron's open-url / second-instance handler captures cloudvault://auth?...
 */
export async function GET(request: NextRequest) {
    const cookieStore = await cookies();
    const idToken      = cookieStore.get('accessToken')?.value;
    const refreshToken = cookieStore.get('refreshToken')?.value;

    // Not logged in — bounce to login page first
    if (!idToken) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', '/api/auth/agent-sso');
        return NextResponse.redirect(loginUrl);
    }

    // Verify the session is valid (not just a stale cookie)
    const user = await getCurrentUser();
    if (!user) {
        const loginUrl = new URL('/login', request.url);
        loginUrl.searchParams.set('redirect', '/api/auth/agent-sso');
        return NextResponse.redirect(loginUrl);
    }

    // Build the deep-link that Electron will capture
    const deepLink = new URL('cloudvault://auth');
    deepLink.searchParams.set('token',   idToken);
    if (refreshToken) {
        deepLink.searchParams.set('refresh', refreshToken);
    }

    // Return a tiny HTML page that redirects via window.location.
    // A plain 302 to a custom protocol is blocked by some browsers.
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Redirecting to CloudVault Agent…</title>
  <script>
    window.location.href = ${JSON.stringify(deepLink.toString())};
  </script>
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
