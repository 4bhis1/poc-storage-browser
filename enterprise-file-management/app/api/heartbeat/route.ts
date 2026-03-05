/**
 * GET /api/heartbeat
 *
 * Validates the bearer token (Cognito JWT or bot JWT) and returns ok.
 * Used by the Electron agent's background heartbeat to detect revocation.
 *
 * Returns 200 { ok: true, serverTime } on valid token.
 * Returns 401 on expired/invalid token.
 * Returns 403 on revoked bot (bot deleted from DB).
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify } from 'jose';
import { verifyToken } from '@/lib/token';
import prisma from '@/lib/prisma';

const BOT_JWT_SECRET = new TextEncoder().encode(
  process.env.BOT_JWT_SECRET || process.env.ENCRYPTION_KEY || 'bot-secret-change-me',
);

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('Authorization');
  const token = authHeader?.split(' ')[1];

  if (!token) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // Try bot JWT first (HS256)
  try {
    const { payload } = await jwtVerify(token, BOT_JWT_SECRET);
    if (payload.type === 'bot') {
      const botId = payload.sub as string;
      const bot = await prisma.botIdentity.findUnique({ where: { id: botId } });
      if (!bot || !bot.isActive) {
        return NextResponse.json({ error: 'Bot revoked' }, { status: 403 });
      }
      return NextResponse.json({ ok: true, serverTime: new Date().toISOString(), type: 'bot' });
    }
  } catch {
    // Not a bot token — fall through to Cognito verification
  }

  // Try Cognito JWT (RS256 via JWKS)
  const cognitoPayload = await verifyToken(token);
  if (!cognitoPayload) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({ ok: true, serverTime: new Date().toISOString(), type: 'sso' });
}
