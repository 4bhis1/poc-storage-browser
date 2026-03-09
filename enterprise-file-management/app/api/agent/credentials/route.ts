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

    if (!awsAccount) {
      return NextResponse.json(
        {
          error:
            "No connected AWS account found. Please link an AWS account first.",
        },
        { status: 404 },
      );
    }

    // Generate temporary credentials via STS AssumeRole
    const decryptedExternalId = decrypt(awsAccount.externalId);
    const sessionName = `Agent-${identityType}-${identityName.replace(/[^a-zA-Z0-9+=,.@_-]/g, "")}-${Date.now()}`;

    const credentials = await getTenantAwsCredentials(
      awsAccount.roleArn,
      decryptedExternalId,
      sessionName,
    );

    const expiration = new Date(Date.now() + 3600 * 1000).toISOString();

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
        awsAccountId: awsAccount.awsAccountId,
        region: awsAccount.region,
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
      region: awsAccount.region,
      expiration,
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
