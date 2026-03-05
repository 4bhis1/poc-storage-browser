/**
 * POST /api/bot/verify
 *
 * Phase C Handshake — Bot presents a signed JWT, server verifies the signature
 * against the stored public key and issues application-level tokens.
 *
 * Body: { botId: string, signedJwt: string }
 * Returns: { accessToken, refreshToken, email, botId }
 *
 * Bot tokens are application-level JWTs (not Cognito) signed with BOT_JWT_SECRET.
 * They carry: { sub: botId, type: "bot", tenantId, permissions, iat, exp }
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { SignJWT } from 'jose';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

const BOT_JWT_SECRET = new TextEncoder().encode(
  process.env.BOT_JWT_SECRET || process.env.ENCRYPTION_KEY || 'bot-secret-change-me',
);
const ACCESS_TOKEN_TTL  = 15 * 60;        // 15 minutes (seconds)
const REFRESH_TOKEN_TTL = 7 * 24 * 3600;  // 7 days (seconds)

// ── Minimal EdDSA JWT verifier ────────────────────────────────────────────────
function verifyEdDSAJwt(token: string, publicKeyPem: string): Record<string, unknown> | null {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, sigB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;

    const publicKey = crypto.createPublicKey(publicKeyPem);
    const signature = Buffer.from(sigB64, 'base64url');
    const valid     = crypto.verify(null, Buffer.from(signingInput), publicKey, signature);
    if (!valid) return null;

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

    // Check expiry
    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) return null;

    return payload;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const { botId, signedJwt } = await request.json();

    if (!botId || !signedJwt) {
      return NextResponse.json({ error: 'Missing botId or signedJwt' }, { status: 400 });
    }

    // Fetch bot from DB
    const bot = await prisma.botIdentity.findUnique({
      where: { id: botId },
      include: { user: { select: { email: true } } },
    });

    if (!bot || !bot.isActive) {
      return NextResponse.json({ error: 'Bot not found or revoked' }, { status: 401 });
    }

    // Verify the signed JWT using the stored public key
    const payload = verifyEdDSAJwt(signedJwt, bot.publicKey);
    if (!payload || payload.bot_id !== botId) {
      void logAudit({
        userId: bot.userId, action: 'LOGIN', resource: 'BotIdentity',
        resourceId: botId, details: { reason: 'Invalid signature' }, status: 'FAILED',
      });
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Issue application-level tokens
    const now = Math.floor(Date.now() / 1000);

    const accessToken = await new SignJWT({
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

    const refreshToken = await new SignJWT({
      sub:  botId,
      type: 'bot_refresh',
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + REFRESH_TOKEN_TTL)
      .sign(BOT_JWT_SECRET);

    // Update lastUsedAt
    await prisma.botIdentity.update({
      where: { id: botId },
      data:  { lastUsedAt: new Date() },
    });

    void logAudit({
      userId: bot.userId, action: 'LOGIN', resource: 'BotIdentity',
      resourceId: botId, details: { name: bot.name }, status: 'SUCCESS',
    });

    return NextResponse.json({ accessToken, refreshToken, email: bot.user.email, botId });
  } catch (err) {
    console.error('[bot/verify] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
