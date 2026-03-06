import { jwtVerify } from 'jose';

const BOT_JWT_SECRET = new TextEncoder().encode(
  process.env.BOT_JWT_SECRET || process.env.ENCRYPTION_KEY || 'bot-secret-change-me',
);

export interface BotAuthResult {
  isBot: true;
  botId: string;
  email: string;
  tenantId: string;
  permissions: string[];
  allowedBucketIds: string[];
  hasBucketPermission: (bucketId: string, action: string) => boolean;
}

/**
 * Try to verify a token as a bot HS256 JWT.
 * Returns BotAuthResult if valid bot token, null otherwise.
 */
export async function verifyBotToken(token: string): Promise<BotAuthResult | null> {
  try {
    const { payload } = await jwtVerify(token, BOT_JWT_SECRET);
    if (payload.type !== 'bot') return null;

    const permissions = (payload.permissions as string[]) || [];

    // Parse "BUCKET:<id>:<PERM>" entries
    const bucketPerms = permissions
      .filter(p => p.startsWith('BUCKET:'))
      .map(p => {
        const parts = p.split(':');
        return { bucketId: parts[1], action: parts[2] };
      });

    const allowedBucketIds = [...new Set(bucketPerms.map(bp => bp.bucketId))];

    return {
      isBot: true,
      botId: payload.sub as string,
      email: payload.email as string,
      tenantId: payload.tenantId as string,
      permissions,
      allowedBucketIds,
      hasBucketPermission: (bucketId: string, action: string) =>
        bucketPerms.some(
          bp =>
            bp.bucketId === bucketId &&
            (bp.action === action || bp.action === 'FULL_ACCESS'),
        ),
    };
  } catch {
    return null;
  }
}

/**
 * Assert that a bot (if present) has access to a specific bucket.
 * If botAuth is null (regular user), always returns true — no bot restriction.
 */
export function assertBotBucketAccess(
  botAuth: BotAuthResult | null,
  bucketId: string,
  requiredAction?: string,
): boolean {
  if (!botAuth) return true;
  if (!botAuth.allowedBucketIds.includes(bucketId)) return false;
  if (requiredAction) return botAuth.hasBucketPermission(bucketId, requiredAction);
  return true;
}
