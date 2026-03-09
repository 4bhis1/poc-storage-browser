import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { Role } from "@/lib/generated/prisma/client";
import { encrypt } from "@/lib/encryption";
import { validateAwsAccount } from "@/lib/workers/account-validator";

// Create new tenant AWS account links (starts process and triggers async validation)
export async function POST(request: Request) {
  try {
    const user = await getCurrentUser();
    if (!user || user.role !== Role.PLATFORM_ADMIN) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await request.json();
    const {
      tenantId,
      awsAccountId,
      region,
      roleArn,
      externalId,
      friendlyName,
      description,
    } = body;

    if (
      !tenantId ||
      !awsAccountId ||
      !region ||
      !roleArn ||
      !externalId ||
      !friendlyName
    ) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    // Check if the tenant already has a linked AWS account
    const existingAccount = await prisma.awsAccount.findFirst({
      where: {
        tenantId,
        status: { in: ["CONNECTED", "CREATING", "PENDING_VALIDATION"] },
      },
    });

    if (existingAccount) {
      return NextResponse.json(
        { error: "Tenant already has an active AWS Account. Please delete it first." },
        { status: 400 },
      );
    }

    // Enforce global uniqueness — one AWS account ID across all tenants
    const duplicateAwsAccount = await prisma.awsAccount.findFirst({
      where: { awsAccountId },
    });

    if (duplicateAwsAccount) {
      return NextResponse.json(
        { error: `AWS Account ID ${awsAccountId} is already linked to another tenant.` },
        { status: 409 },
      );
    }

    // Encrypt the sensitive External ID before storing
    const encryptedExternalId = encrypt(externalId);

    const account = await prisma.awsAccount.create({
      data: {
        tenantId,
        awsAccountId,
        region,
        roleArn,
        externalId: encryptedExternalId,
        friendlyName,
        description,
        status: "CREATING",
      },
    });

    // Trigger async validation worker (fire and forget)
    // In a real production system, this would be pushed to an SQS/RabbitMQ queue
    validateAwsAccount(account.id, user.id).catch((err) => {
      console.error("Validation worker failed:", err);
    });

    // Log audit event logic here
    await prisma.auditLog.create({
      data: {
        userId: user.id,
        action: "AWS_ACCOUNT_INTEGRATED",
        resource: "aws_account",
        details: JSON.stringify({
          awsAccountId,
          tenantId,
          region,
          friendlyName,
        }),
        status: "SUCCESS",
      },
    });

    return NextResponse.json({ success: true, data: account });
  } catch (error) {
    console.error("Failed to create AWS account:", error);
    return NextResponse.json(
      { error: "Failed to create AWS account" },
      { status: 500 },
    );
  }
}
