/**
 * POST /api/bot/refresh
 *
 * Refresh service account access token using a valid refresh token.
 * If the service account has been revoked (deleted from DB), returns 403 — this is the Kill Switch.
 *
 * Body: { refreshToken: string }
 * Returns: { accessToken, refreshToken }
 */

import { NextRequest, NextResponse } from 'next/server';
import { jwtVerify, SignJWT } from 'jose';
import prisma from '@/lib/prisma';

const BOT_JWT_SECRET = new TextEncoder().encode(
  process.env.BOT_JWT_SECRET || process.env.ENCRYPTION_KEY || 'bot-secret-change-me',
);
const ACCESS_TOKEN_TTL  = 15 * 60;
const REFRESH_TOKEN_TTL = 7 * 24 * 3600;

export async function POST(request: NextRequest) {
  try {
    const { refreshToken } = await request.json();
    if (!refreshToken) {
      return NextResponse.json({ error: 'Missing refreshToken' }, { status: 400 });
    }

    // Verify the refresh token
    let payload: Record<string, unknown>;
    try {
      const result = await jwtVerify(refreshToken, BOT_JWT_SECRET);
      payload = result.payload as Record<string, unknown>;
    } catch {
      return NextResponse.json({ error: 'Invalid or expired refresh token' }, { status: 401 });
    }

    if (payload.type !== 'bot_refresh') {
      return NextResponse.json({ error: 'Invalid token type' }, { status: 401 });
    }

    const botId = payload.sub as string;

    // Check bot still exists and is active — this is the Kill Switch check
    const bot = await prisma.botIdentity.findUnique({
      where: { id: botId },
      include: { user: { select: { email: true } } },
    });

    if (!bot || !bot.isActive) {
      return NextResponse.json(
        { error: 'Bot has been revoked — re-registration required' },
        { status: 403 },
      );
    }

    const now = Math.floor(Date.now() / 1000);

    const newAccessToken = await new SignJWT({
      sub:         botId,
      type:        'bot',
      tenantId:    bot.tenantId,
      permissions: bot.permissions,
      email:       bot.user.email,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + ACCESS_TOKEN_TTL)
      .sign(BOT_JWT_SECRET);

    const newRefreshToken = await new SignJWT({ sub: botId, type: 'bot_refresh' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + REFRESH_TOKEN_TTL)
      .sign(BOT_JWT_SECRET);

    await prisma.botIdentity.update({
      where: { id: botId },
      data:  { lastUsedAt: new Date() },
    });

    return NextResponse.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });
  } catch (err) {
    console.error('[bot/refresh] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
