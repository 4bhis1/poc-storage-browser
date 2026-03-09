/**
 * POST /api/agent/credentials
 *
 * Provides short-lived AWS STS credentials to authenticated agents (users or bots).
 *
 * Security:
 * - Requires valid JWT (from user login or bot handshake)
 * - Enforces tenant isolation
 * - Validates bot active status and revocation
 * - Returns temporary credentials (1 hour TTL) via STS AssumeRole
 */

import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/token";
import { getTenantAwsCredentials } from "@/lib/aws/sts";
import { decrypt } from "@/lib/encryption";
import { logAudit } from "@/lib/audit";
import { verifyBotToken } from "@/lib/bot-auth";
import { STSClient, GetCallerIdentityCommand } from "@aws-sdk/client-sts";
import { fromNodeProviderChain } from "@aws-sdk/credential-providers";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("Authorization");
    const token = authHeader?.split(" ")[1];

    if (!token) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── Bot JWT auth (HS256) first ─────────────────────────────────────────
    const botAuth = await verifyBotToken(token);

    let tenantId: string | null = null;
    let identityType: "user" | "bot" = "user";
    let identityId: string = "";
    let identityName: string = "";

    if (botAuth) {
      const bot = await prisma.botIdentity.findUnique({
        where: { id: botAuth.botId },
      });
      if (!bot || !bot.isActive) {
        return NextResponse.json(
          { error: "Bot not found or revoked" },
          { status: 403 },
        );
      }
      identityType = "bot";
      identityId = bot.id;
      identityName = bot.name;
      tenantId = bot.tenantId;
    } else {
      // Fall back to Cognito RS256
      const payload = await verifyToken(token);
      if (!payload) {
        return NextResponse.json({ error: "Invalid token" }, { status: 401 });
      }

      const email = (payload.email as string) || "";
      if (!email) {
        return NextResponse.json(
          { error: "Invalid token payload" },
          { status: 401 },
        );
      }

      const user = await prisma.user.findUnique({ where: { email } });
      if (!user || !user.isActive) {
        return NextResponse.json(
          { error: "User not found or inactive" },
          { status: 403 },
        );
      }

      identityId = user.id;
      identityName = user.name || user.email;
      tenantId = user.tenantId;
    }

    if (!tenantId) {
      return NextResponse.json(
        { error: "No tenant associated with this identity" },
        { status: 403 },
      );
    }

    // Optional: caller can request credentials for a specific AWS account
    let requestedAwsAccountId: string | null = null;
    try {
      const body = await request.json();
      requestedAwsAccountId = body?.awsAccountId || null;
    } catch {}

    // Get connected AWS account for this tenant (specific or first available)
    const awsAccount = await prisma.awsAccount.findFirst({
      where: {
        tenantId,
        status: "CONNECTED",
        ...(requestedAwsAccountId ? { id: requestedAwsAccountId } : {}),
      },
    });

    const sessionName = `Agent-${identityType}-${identityName.replace(/[^a-zA-Z0-9+=,.@_-]/g, "")}-${Date.now()}`;
    let credentials: { accessKeyId: string; secretAccessKey: string; sessionToken?: string };
    let credentialRegion: string;
    const expiration = new Date(Date.now() + 3600 * 1000).toISOString();

    if (awsAccount) {
      // Tenant has a linked AWS account — use cross-account STS AssumeRole
      const decryptedExternalId = decrypt(awsAccount.externalId);
      const sts = await getTenantAwsCredentials(
        awsAccount.roleArn,
        decryptedExternalId,
        sessionName,
      );
      credentials = sts;
      credentialRegion = awsAccount.region;
    } else if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
      // Explicit env var credentials (dev / static key fallback)
      credentials = {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      };
      credentialRegion = process.env.AWS_REGION || "ap-south-1";
      console.log(`[AgentCredentials] Tenant ${tenantId} has no linked AWS account — using env var credentials`);
    } else {
      // Fall through to AWS SDK default credential chain (ECS task role, IMDS, AWS_PROFILE, etc.)
      // Same as getS3Client step 3
      try {
        const provider = fromNodeProviderChain();
        const resolved = await provider();
        credentials = {
          accessKeyId: resolved.accessKeyId,
          secretAccessKey: resolved.secretAccessKey,
          sessionToken: resolved.sessionToken,
        };
        credentialRegion = process.env.AWS_REGION || "ap-south-1";
        console.log(`[AgentCredentials] Tenant ${tenantId} has no linked AWS account — using default credential chain (task role/IMDS)`);
      } catch (chainError) {
        console.error("[AgentCredentials] Default credential chain failed:", chainError);
        return NextResponse.json(
          { error: "No AWS account configured for your tenant and no ambient credentials available." },
          { status: 404 },
        );
      }
    }

    // Audit log
    await logAudit({
      userId: identityId,
      action: "AGENT_CREDENTIALS_REQUESTED",
      resource: "AWS_CREDENTIALS",
      status: "SUCCESS",
      ipAddress:
        request.headers.get("x-forwarded-for") ||
        request.headers.get("x-real-ip") ||
        "unknown",
      details: {
        identityType,
        awsAccountId: awsAccount?.awsAccountId || "hub",
        region: credentialRegion,
        hubFallback: !awsAccount,
      },
    });

    // Update bot lastUsedAt timestamp
    if (identityType === "bot") {
      await prisma.botIdentity.update({
        where: { id: identityId },
        data: { lastUsedAt: new Date() },
      });
    }

    return NextResponse.json({
      accessKeyId: credentials.accessKeyId,
      secretAccessKey: credentials.secretAccessKey,
      sessionToken: credentials.sessionToken,
      region: credentialRegion,
      expiration,
      accountName: awsAccount?.friendlyName || "hub",
    });
  } catch (error: any) {
    console.error("[AgentCredentials] Error:", error);

    if (
      error.name === "AccessDenied" ||
      error.message?.includes("AssumeRole")
    ) {
      return NextResponse.json(
        {
          error:
            "Failed to assume AWS role. Please verify your AWS account configuration.",
        },
        { status: 500 },
      );
    }

    return NextResponse.json(
      {
        error: "Failed to generate credentials",
      },
      { status: 500 },
    );
  }
}
