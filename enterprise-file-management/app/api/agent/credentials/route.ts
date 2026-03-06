/**
 * POST /api/agent/credentials
 *
 * Provides short-lived AWS STS credentials to authenticated agents (users or bots).
 * 
 * Security:
 * - Requires valid JWT (from user login or bot handshake)
 * - Enforces tenant isolation (agent can only access their tenant's accounts)
 * - Validates bot active status and revocation
 * - Returns temporary credentials (1 hour TTL) via STS AssumeRole
 * 
 * Request Body:
 * - accountId (optional): Specific account to get credentials for
 *   If omitted, returns credentials for the first active account in agent's tenant
 * 
 * Response:
 * - accessKeyId, secretAccessKey, sessionToken: AWS temporary credentials
 * - region: AWS region for the account
 * - expiration: ISO timestamp when credentials expire
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/token';
import { getTenantAwsCredentials } from '@/lib/aws/sts';
import { decrypt } from '@/lib/encryption';
import { logAudit } from '@/lib/audit';
import { verifyBotToken } from '@/lib/bot-auth';

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.split(' ')[1];

    if (!token) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // ── Bot JWT auth (HS256) first ─────────────────────────────────────────
    const botAuth = await verifyBotToken(token);

    let tenantId: string | null = null;
    let identityType: 'user' | 'bot' = 'user';
    let identityId: string = '';
    let identityName: string = '';

    if (botAuth) {
      // Bot authenticated via HS256 JWT
      const bot = await prisma.botIdentity.findUnique({
        where: { id: botAuth.botId },
      });
      if (!bot || !bot.isActive) {
        return NextResponse.json({ error: 'Bot not found or revoked' }, { status: 403 });
      }
      identityType = 'bot';
      identityId = bot.id;
      identityName = bot.name;
      tenantId = bot.tenantId;
    } else {
      // Fall back to Cognito RS256
      const payload = await verifyToken(token);
      if (!payload) {
        return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
      }

      const email = (payload.email as string) || '';
      if (!email) {
        return NextResponse.json({ error: 'Invalid token payload' }, { status: 401 });
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.isActive) {
        return NextResponse.json({ error: 'User not found or inactive' }, { status: 403 });
      }

      identityId = user.id;
      identityName = user.name || user.email;
      tenantId = user.tenantId;
    }

    if (!tenantId) {
      return NextResponse.json({ error: 'No tenant associated with this identity' }, { status: 403 });
    }

    // 3. Get account (from request body or auto-detect first active account)
    const body = await request.json().catch(() => ({}));
    const requestedAccountId = body.accountId;

    let account;
    if (requestedAccountId) {
      // Specific account requested - validate tenant ownership
      account = await prisma.account.findFirst({
        where: {
          id: requestedAccountId,
          tenantId,
          isActive: true,
        },
      });

      if (!account) {
        return NextResponse.json({ 
          error: 'Account not found or not accessible' 
        }, { status: 404 });
      }
    } else {
      // Auto-detect first active account for this tenant
      account = await prisma.account.findFirst({
        where: {
          tenantId,
          isActive: true,
        },
        orderBy: { createdAt: 'asc' },
      });

      if (!account) {
        return NextResponse.json({ 
          error: 'No active accounts found for your tenant' 
        }, { status: 404 });
      }
    }

    // 4. Get AWS account configuration for STS AssumeRole
    const awsAccount = await prisma.awsAccount.findFirst({
      where: {
        tenantId,
        status: 'CONNECTED',
      },
    });

    if (!awsAccount) {
      return NextResponse.json({ 
        error: 'No connected AWS account found. Please link an AWS account first.' 
      }, { status: 404 });
    }

    // 5. Generate temporary credentials via STS AssumeRole
    const decryptedExternalId = decrypt(awsAccount.externalId);
    const sessionName = `Agent-${identityType}-${identityName.replace(/[^a-zA-Z0-9+=,.@_-]/g, '')}-${Date.now()}`;

    const credentials = await getTenantAwsCredentials(
      awsAccount.roleArn,
      decryptedExternalId,
      sessionName
    );

    // 6. Calculate expiration (STS default is 1 hour)
    const expiration = new Date(Date.now() + 3600 * 1000).toISOString();

    // 7. Audit log
    await logAudit({
      userId: identityId,
      action: 'AGENT_CREDENTIALS_REQUESTED',
      resource: 'AWS_CREDENTIALS',
      status: 'SUCCESS',
      ipAddress: request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown',
      details: {
        identityType,
        accountId: account.id,
        accountName: account.name,
        awsAccountId: awsAccount.awsAccountId,
        region: awsAccount.region,
      },
    });

    // 8. Update bot lastUsedAt timestamp
    if (identityType === 'bot') {
      await prisma.botIdentity.update({
        where: { id: identityId },
        data: { lastUsedAt: new Date() },
      });
    }

    return NextResponse.json({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      region: awsAccount.region,
      expiration,
      accountId: account.id,
      accountName: account.name,
    });

  } catch (error: any) {
    console.error('[AgentCredentials] Error:', error);
    
    // Handle specific STS errors
    if (error.name === 'AccessDenied' || error.message?.includes('AssumeRole')) {
      return NextResponse.json({ 
        error: 'Failed to assume AWS role. Please verify your AWS account configuration.' 
      }, { status: 500 });
    }

    return NextResponse.json({ 
      error: 'Failed to generate credentials' 
    }, { status: 500 });
  }
}
