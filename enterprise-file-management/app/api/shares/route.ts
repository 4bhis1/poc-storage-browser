import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { extractIpFromRequest, validateUserIpAccess } from "@/lib/ip-whitelist";
import { logAudit } from "@/lib/audit";
import bcrypt from "bcryptjs";
import { sendShareEmailNotification } from "@/lib/sns";

export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const clientIp = extractIpFromRequest(request);
    if (!validateUserIpAccess(clientIp, user)) {
      logAudit({
        userId: user.id,
        action: "IP_ACCESS_DENIED",
        resource: "Share",
        status: "FAILED",
        ipAddress: clientIp,
        details: {
          reason: "IP not whitelisted for team",
          method: request.method,
          path: request.nextUrl.pathname,
        },
      });
      return NextResponse.json(
        { error: "Forbidden: IP not whitelisted for your team" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { fileId, toEmail, expiryDays, downloadLimit, password } = body;

    if (!fileId || !toEmail || !expiryDays) {
      return NextResponse.json(
        { error: "fileId, toEmail, and expiryDays are required fields." },
        { status: 400 },
      );
    }

    // Verify user has access to the file
    const file = await prisma.fileObject.findUnique({
      where: { id: fileId },
      include: { bucket: true },
    });

    if (!file) {
      return NextResponse.json({ error: "File not found" }, { status: 404 });
    }

    // For a teammate, verify they have access to this tenant's things
    if (file.tenantId !== user.tenantId && user.role !== "PLATFORM_ADMIN") {
      return NextResponse.json(
        { error: "Forbidden: Cannot share files outside your tenant" },
        { status: 403 },
      );
    }

    let passwordHash = null;
    let passwordProtected = false;

    if (password && password.trim().length > 0) {
      passwordHash = await bcrypt.hash(password.trim(), 10);
      passwordProtected = true;
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + parseInt(String(expiryDays), 10));

    const shareLimit = parseInt(String(downloadLimit), 10) || 3;

    // Create the Share record
    const share = await prisma.share.create({
      data: {
        fileId: file.id,
        tenantId: file.tenantId,
        bucketId: file.bucketId,
        toEmail: toEmail.toLowerCase().trim(),
        expiry: expiryDate,
        downloadLimit: shareLimit,
        passwordProtected,
        passwordHash,
        createdBy: user.id,
        updatedBy: user.id,
      },
    });

    // Generate Share URL based on current host
    const protocol = request.headers.get("x-forwarded-proto") || "http";
    const host = request.headers.get("host") || "localhost:3000";
    const shareUrl = `${protocol}://${host}/file/share/${share.id}`;

    // Send email notification via SNS
    await sendShareEmailNotification({
      toEmail: share.toEmail,
      shareUrl,
      expiryDate: share.expiry,
      downloadLimit: share.downloadLimit,
      hasPassword: share.passwordProtected,
    });

    // Audit logging
    logAudit({
      userId: user.id,
      action: "FILE_SHARED",
      resource: "Share",
      resourceId: share.id,
      status: "SUCCESS",
      ipAddress: clientIp,
      details: { fileId: file.id, toEmail: share.toEmail },
    });

    return NextResponse.json(
      {
        message: "Share created successfully",
        share: {
          id: share.id,
          toEmail: share.toEmail,
          expiry: share.expiry,
          downloadLimit: share.downloadLimit,
          passwordProtected: share.passwordProtected,
        },
        shareUrl,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to create share:", error);
    return NextResponse.json(
      { error: "Failed to create file share" },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1", 10);
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const skip = (page - 1) * limit;

    const whereClause: any = {};

    // Platform Admins can see everything in the system
    if (user.role === "PLATFORM_ADMIN") {
      // no where clause constraints
    } else if (user.role === "TENANT_ADMIN") {
      // Tenant Admins can see all shares within their tenant
      whereClause.tenantId = user.tenantId;
    } else {
      // Teammates can only see shares they created
      whereClause.createdBy = user.id;
    }

    const [totalCount, shares] = await Promise.all([
      prisma.share.count({ where: whereClause }),
      prisma.share.findMany({
        where: whereClause,
        include: {
          file: {
            select: {
              name: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
        skip,
        take: limit,
      }),
    ]);

    const formattedShares = shares.map((share: any) => ({
      id: share.id,
      name: share.file.name,
      sharedWith: share.toEmail,
      expiresAt: share.expiry,
      access: share.passwordProtected ? "Protected Download" : "Download",
      status:
        share.status === "ACTIVE" && new Date() > new Date(share.expiry)
          ? "EXPIRED"
          : share.status === "ACTIVE" && share.downloads >= share.downloadLimit
            ? "EXPIRED"
            : share.status,
    }));

    return NextResponse.json({
      shares: formattedShares,
      pagination: {
        totalCount,
        totalPages: Math.ceil(totalCount / limit),
        currentPage: page,
        limit,
      },
    });
  } catch (error) {
    console.error("Failed to fetch shares:", error);
    return NextResponse.json(
      { error: "Failed to fetch file shares" },
      { status: 500 },
    );
  }
}
