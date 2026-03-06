/**
 * POST /api/bot/verify
 * Phase C Handshake — verifies EdDSA signed JWT and issues app-level tokens for service accounts.
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { SignJWT } from 'jose';
import prisma from '@/lib/prisma';
import { logAudit } from '@/lib/audit';

const BOT_JWT_SECRET = new TextEncoder().encode(
  process.env.BOT_JWT_SECRET || process.env.ENCRYPTION_KEY || 'bot-secret-change-me',
);
const ACCESS_TOKEN_TTL  = 15 * 60;
const REFRESH_TOKEN_TTL = 7 * 24 * 3600;

/**
 * Normalize a PEM string — handles cases where the textarea strips newlines
 * or the key is sent as a single line / with \n literals.
 */
function normalizePem(pem: string): string {
  // Replace literal \n strings and normalize line endings
  let cleaned = pem.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim();

  // If the base64 body has no newlines (single-line PEM), reformat it
  const headerMatch = cleaned.match(/^(-----BEGIN [^-]+-----)([\s\S]+?)(-----END [^-]+-----)$/);
  if (headerMatch) {
    const header = headerMatch[1];
    const body   = headerMatch[2].replace(/\s+/g, ''); // strip all whitespace from body
    const footer = headerMatch[3];
    // Wrap body at 64 chars per line (standard PEM)
    const wrapped = body.match(/.{1,64}/g)!.join('\n');
    cleaned = `${header}\n${wrapped}\n${footer}`;
  }

  return cleaned;
}

function verifyEdDSAJwt(
  token: string,
  publicKeyPem: string,
): { valid: boolean; payload?: Record<string, unknown>; error?: string } {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { valid: false, error: 'Malformed JWT' };

    const [headerB64, payloadB64, sigB64] = parts;
    const signingInput = `${headerB64}.${payloadB64}`;

    const normalizedPem = normalizePem(publicKeyPem);
    const publicKey     = crypto.createPublicKey({ key: normalizedPem, format: 'pem' });

    // Verify Ed25519 signature — pass null as algorithm (auto-detected from key type)
    const signature = Buffer.from(sigB64, 'base64url');
    const valid     = crypto.verify(null, Buffer.from(signingInput), publicKey, signature);

    if (!valid) return { valid: false, error: 'Signature mismatch' };

    const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));

    if (payload.exp && Math.floor(Date.now() / 1000) > payload.exp) {
      return { valid: false, error: 'JWT expired' };
    }

    return { valid: true, payload };
  } catch (err: any) {
    return { valid: false, error: err.message };
  }
}

export async function POST(request: NextRequest) {
  try {
    const { botId, signedJwt } = await request.json();

    if (!botId || !signedJwt) {
      return NextResponse.json({ error: 'Missing botId or signedJwt' }, { status: 400 });
    }

    const bot = await prisma.botIdentity.findUnique({
      where: { id: botId },
      include: { user: { select: { email: true } } },
    });

    if (!bot || !bot.isActive) {
      return NextResponse.json({ error: 'Bot not found or revoked' }, { status: 401 });
    }

    console.log(`[bot/verify] bot ${botId} found, isActive=${bot.isActive}`);
    console.log(`[bot/verify] publicKey from DB (first 80): ${bot.publicKey.substring(0, 80)}`);
    console.log(`[bot/verify] signedJwt (first 80): ${signedJwt.substring(0, 80)}`);

    const { valid, payload, error } = verifyEdDSAJwt(signedJwt, bot.publicKey);

    console.log(`[bot/verify] verify result: valid=${valid}, error=${error}, payload.bot_id=${(payload as any)?.bot_id}`);

    if (!valid || !payload || payload.bot_id !== botId) {
      console.error(`[bot/verify] Signature check failed for bot ${botId}: ${error}`);
      void logAudit({
        userId: bot.userId, action: 'LOGIN', resource: 'BotIdentity',
        resourceId: botId, details: { reason: error ?? 'Invalid signature' }, status: 'FAILED',
      });
      return NextResponse.json({ error: `Verification failed: ${error}` }, { status: 401 });
    }

    const now = Math.floor(Date.now() / 1000);

    const accessToken = await new SignJWT({
      sub:         botId,
      type:        'bot',
      tenantId:    bot.tenantId,
      permissions: bot.permissions,
      email:       bot.user.email,
      botName:     bot.name,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + ACCESS_TOKEN_TTL)
      .sign(BOT_JWT_SECRET);

    const refreshToken = await new SignJWT({ sub: botId, type: 'bot_refresh' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt(now)
      .setExpirationTime(now + REFRESH_TOKEN_TTL)
      .sign(BOT_JWT_SECRET);

    await prisma.botIdentity.update({
      where: { id: botId },
      data:  { lastUsedAt: new Date() },
    });

    void logAudit({
      userId: bot.userId, action: 'LOGIN', resource: 'BotIdentity',
      resourceId: botId, details: { name: bot.name }, status: 'SUCCESS',
    });

    return NextResponse.json({ accessToken, refreshToken, email: bot.user.email, botId, botName: bot.name });
  } catch (err) {
    console.error('[bot/verify] Unexpected error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
