import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { Role } from "@/lib/generated/prisma/client";
import { extractIpFromRequest, validateUserIpAccess } from "@/lib/ip-whitelist";
import { logAudit } from "@/lib/audit";
import { verifyBotToken } from "@/lib/bot-auth";
import { verifyToken } from "@/lib/token";

// ─── GET /api/buckets ──────────────────────────────────────────────────────
// Returns buckets from DB only (no AWS API call).
// Filtered by role: PLATFORM_ADMIN sees all, TENANT_ADMIN sees own tenant,
// TEAMMATE sees only buckets they have policy access to.
export async function GET(request: NextRequest) {
  try {
    // ── Bot JWT auth (HS256) — must be checked before session/Cognito ──────
    const authHeader = request.headers.get("Authorization");
    const bearerToken = authHeader?.split(" ")[1];
    const botAuth = bearerToken ? await verifyBotToken(bearerToken) : null;

    let user: any = null;

    if (botAuth) {
      user = await prisma.user.findUnique({
        where: { email: botAuth.email },
        include: { policies: true, teams: { include: { team: { include: { policies: true } } } } },
      });
    } else {
      user = await getCurrentUser();
      if (!user && bearerToken) {
        const payload = await verifyToken(bearerToken);
        if (payload?.email) {
          user = await prisma.user.findUnique({
            where: { email: payload.email as string },
            include: { policies: true, teams: { include: { team: { include: { policies: true } } } } },
          });
        }
      }
    }

    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const clientIp = extractIpFromRequest(request);
    if (!validateUserIpAccess(clientIp, user)) {
      logAudit({
        userId: user.id,
        action: "IP_ACCESS_DENIED",
        resource: "Bucket",
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

    // Parse query params
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const search = searchParams.get("search") || "";
    const filterAccountId = searchParams.get("accountId") || "";
    const skip = (page - 1) * limit;

    let whereClause: any = {};

    // ── Bot: scope strictly to permitted buckets only ─────────────────────
    if (botAuth) {
      if (botAuth.allowedBucketIds.length === 0) {
        return NextResponse.json({
          data: [],
          metadata: { total: 0, page, limit, totalPages: 0 },
        });
      }
      whereClause = {
        id: { in: botAuth.allowedBucketIds },
        tenantId: botAuth.tenantId,
      };
    } else if (user.role === Role.PLATFORM_ADMIN) {
      // See everything
    } else if (user.role === Role.TENANT_ADMIN) {
      whereClause = { tenantId: user.tenantId };
    } else {
      // TEAMMATE — collect ALL policies from both direct assignments and team memberships
      const allPolicies: any[] = [
        ...(user.policies || []),
        ...((user as any).teams || []).flatMap(
          (membership: any) => membership.team?.policies || [],
        ),
      ];

      const hasGlobalAccess = allPolicies.some(
        (p: any) =>
          p.resourceType?.toLowerCase() === "bucket" &&
          p.resourceId === null &&
          (p.actions.includes("READ") || p.actions.includes("LIST")),
      );

      if (hasGlobalAccess) {
        whereClause = { tenantId: user.tenantId };
      } else {
        const allowedBucketIds = allPolicies
          .filter(
            (p: any) =>
              p.resourceType?.toLowerCase() === "bucket" &&
              p.resourceId !== null &&
              (p.actions.includes("READ") || p.actions.includes("LIST")),
          )
          .map((p: any) => p.resourceId);

        // Deduplicate
        const uniqueBucketIds = [...new Set(allowedBucketIds)];

        if (uniqueBucketIds.length === 0)
          return NextResponse.json({
            data: [],
            metadata: { total: 0, page, limit, totalPages: 0 },
          });

        whereClause = {
          id: { in: uniqueBucketIds },
          tenantId: user.tenantId,
        };
      }
    }

    // Apply user filters
    if (search) {
      whereClause.name = { contains: search, mode: "insensitive" };
    }

    if (filterAccountId) {
      whereClause.accountId = filterAccountId;
    }

    // Get total count for pagination
    const total = await prisma.bucket.count({ where: whereClause });

    // Get paginated data
    const buckets = await prisma.bucket.findMany({
      where: whereClause,
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: skip,
    });

    const bucketsWithStats = await Promise.all(
      buckets.map(async (bucket) => {
        const stats = await prisma.fileObject.aggregate({
          where: { bucketId: bucket.id, isFolder: false },
          _sum: { size: true },
          _count: { id: true },
        });
        return {
          id: bucket.id,
          name: bucket.name,
          region: bucket.region,
          accountId: bucket.accountId,
          storageClass: "STANDARD", // Still hardcoded as per plan
          versioning: bucket.versioning,
          encryption: bucket.encryption,
          totalSize: Number(stats._sum.size ?? 0),
          maxSize: Number(bucket.quotaBytes),
          fileCount: stats._count.id,
          tags: bucket.tags,
          createdAt: bucket.createdAt.toISOString(),
        };
      }),
    );

    return NextResponse.json({
      data: bucketsWithStats,
      metadata: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    console.error("Failed to fetch buckets:", error);
    return NextResponse.json(
      { error: "Failed to fetch buckets" },
      { status: 500 },
    );
  }
}

// ─── POST /api/buckets ─────────────────────────────────────────────────────
// Creates a bucket on AWS S3 under the user-selected account, then saves
// the record to the DB. If S3 creation fails the DB row is rolled back.
//
// Required body: { name: string, region: string, accountId?: string, awsAccountId?: string, encryption?: boolean, isExisting?: boolean }
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const clientIp = extractIpFromRequest(request);
    if (!validateUserIpAccess(clientIp, user)) {
      logAudit({
        userId: user.id,
        action: "IP_ACCESS_DENIED",
        resource: "Bucket",
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

    // Only admins can create buckets
    if (user.role !== Role.PLATFORM_ADMIN && user.role !== Role.TENANT_ADMIN) {
      return NextResponse.json(
        { error: "Forbidden: only admins can create buckets" },
        { status: 403 },
      );
    }

    const body = await request.json();
    const { name, region, encryption, isExisting } = body;
    let accountId = body.accountId;
    let awsAccountId = body.awsAccountId;

    // Validate required fields
    if (!name || (!region && !isExisting)) {
      return NextResponse.json(
        { error: "Name and region are required" },
        { status: 400 },
      );
    }

    let account: any = null;
    let awsAccount: any = null;

    if (!accountId && !awsAccountId) {
      awsAccount = await prisma.awsAccount.findFirst({
        where: { tenantId: user.tenantId as string, status: "CONNECTED" },
        include: { tenant: true },
      });
      if (!awsAccount) {
        account = await prisma.account.findFirst({
          where: { tenantId: user.tenantId as string, isActive: true },
          include: { tenant: true },
        });
        if (!account) {
          const tenant = await prisma.tenant.findUnique({
            where: { id: user.tenantId as string },
          });
          if (!tenant?.isHubTenant) {
            return NextResponse.json(
              {
                error:
                  "No connected AWS Account found for this tenant. Please link an AWS account first.",
              },
              { status: 400 },
            );
          }
        }
      }
    } else {
      if (accountId) {
        account = await prisma.account.findUnique({
          where: { id: accountId as string },
          include: { tenant: true },
        });
        if (!account || account.tenantId !== user.tenantId) {
          return NextResponse.json(
            { error: "Invalid account ID" },
            { status: 400 },
          );
        }
      } else if (awsAccountId) {
        awsAccount = await prisma.awsAccount.findUnique({
          where: { id: awsAccountId as string },
          include: { tenant: true },
        });
        if (!awsAccount || awsAccount.tenantId !== user.tenantId) {
          return NextResponse.json(
            { error: "Invalid AWS Account ID" },
            { status: 400 },
          );
        }
      }
    }

    const tenantName =
      account?.tenant.name || awsAccount?.tenant.name || "tenant";

    const rawTenantName = tenantName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .substring(0, 20)
      .replace(/-+$/, "");
    const rawBucketSuffix = name
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, "-")
      .substring(0, 20)
      .replace(/-+$/, "");
    const randomSuffix = Math.random().toString(36).substring(2, 8);
    let constructedName = `fms-${rawTenantName}-bkt-${rawBucketSuffix}-${randomSuffix}`;
    constructedName = constructedName.replace(/-+/g, "-");
    const finalBucketName = isExisting ? name : constructedName;

    const existingBucket = await prisma.bucket.findFirst({
      where: { name: finalBucketName },
      include: { account: true, awsAccount: true },
    });

    if (existingBucket) {
      const isSameTenant = existingBucket.account?.tenantId === user.tenantId;
      return NextResponse.json(
        {
          error: isSameTenant
            ? `Bucket "${finalBucketName}" is already mapped in your tenant. You should see it in your Buckets list.`
            : `Bucket "${finalBucketName}" is already tracked by another tenant in the system. Please use a different name.`,
        },
        { status: 409 },
      );
    }

    // ── Step 1: Save record to DB ──────────────────────────────────────
    const bucket = await prisma.bucket.create({
      data: {
        name: finalBucketName,
        region,
        accountId: account?.id,
        awsAccountId: awsAccount?.id,
        tenantId: user.tenantId as string,
        encryption: !!encryption,
        versioning: false, // default
        tags: ["created-via-ui"],
      },
    });

    // ── Step 2: Create or verify the S3 bucket ─────────────────────────────
    try {
      const { decrypt } = await import("@/lib/encryption");
      const {
        S3Client,
        CreateBucketCommand,
        PutBucketEncryptionCommand,
        DeleteBucketCommand,
        PutBucketCorsCommand,
        HeadBucketCommand,
        PutBucketLifecycleConfigurationCommand,
      } = await import("@aws-sdk/client-s3");

      const { getS3Client } = await import("@/lib/s3");
      const s3 = await getS3Client(account, region, awsAccount);

      if (isExisting) {
        // Verify the bucket exists and we have access
        await s3.send(new HeadBucketCommand({ Bucket: finalBucketName }));
      } else {
        // AWS does NOT allow a LocationConstraint for us-east-1 (it's the default)
        const input: any = { Bucket: finalBucketName };
        if (region !== "us-east-1") {
          input.CreateBucketConfiguration = { LocationConstraint: region };
        }
        await s3.send(new CreateBucketCommand(input));

        try {
          // Apply encryption if requested
          if (encryption) {
            try {
              await s3.send(
                new PutBucketEncryptionCommand({
                  Bucket: finalBucketName,
                  ServerSideEncryptionConfiguration: {
                    Rules: [
                      {
                        ApplyServerSideEncryptionByDefault: {
                          SSEAlgorithm: "AES256",
                        },
                      },
                    ],
                  },
                }),
              );
            } catch (err) {
              console.warn(
                "Could not apply encryption, insufficient IAM permissions",
                err,
              );
            }
          }

          // Apply CORS configuration
          const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",") || [];
          if (allowedOrigins.length > 0) {
            try {
              await s3.send(
                new PutBucketCorsCommand({
                  Bucket: finalBucketName,
                  CORSConfiguration: {
                    CORSRules: [
                      {
                        AllowedHeaders: ["*"],
                        AllowedMethods: ["PUT", "POST", "GET", "HEAD"],
                        AllowedOrigins: allowedOrigins,
                        ExposeHeaders: ["ETag"],
                        MaxAgeSeconds: 3000,
                      },
                    ],
                  },
                }),
              );
            } catch (err) {
              console.warn(
                "Could not apply CORS, insufficient IAM permissions",
                err,
              );
            }
          }

          // Apply Lifecycle Configuration for incomplete multipart uploads
          try {
            await s3.send(
              new PutBucketLifecycleConfigurationCommand({
                Bucket: finalBucketName,
                LifecycleConfiguration: {
                  Rules: [
                    {
                      ID: "AbortIncompleteMultipartUploads",
                      Filter: {},
                      Status: "Enabled",
                      AbortIncompleteMultipartUpload: {
                        DaysAfterInitiation: 7,
                      },
                    },
                  ],
                },
              }),
            );
          } catch (err) {
            console.warn(
              "Could not apply Lifecycle Configuration, insufficient IAM permissions",
              err,
            );
          }
        } catch (configError) {
          console.error(
            "Failed to configure bucket, rolling back S3 creation:",
            configError,
          );
          // Attempt to delete the bucket we just created
          try {
            await s3.send(new DeleteBucketCommand({ Bucket: finalBucketName }));
          } catch (cleanupError) {
            console.error(
              "Failed to cleanup S3 bucket after configuration error:",
              cleanupError,
            );
          }
          throw configError; // Re-throw to trigger DB rollback below
        }
      }
    } catch (s3Error: any) {
      // Roll back the DB row so we don't have a phantom bucket record
      await prisma.bucket.delete({ where: { id: bucket.id } });

      console.error("S3 Bucket operation failed:", s3Error);

      if (s3Error.name === "BucketAlreadyExists") {
        return NextResponse.json(
          {
            error: `The bucket name "${finalBucketName}" is globally unique and already taken by another AWS user. Please choose a different name.`,
          },
          { status: 409 },
        );
      }
      if (s3Error.name === "BucketAlreadyOwnedByYou") {
        return NextResponse.json(
          {
            error: `You already own the bucket "${finalBucketName}" in another region or account.`,
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        { error: `AWS S3 error: ${s3Error?.message || "Unknown error"}` },
        { status: 500 },
      );
    }

    logAudit({
      userId: user.id,
      action: "BUCKET_CREATE" as any,
      resource: "Bucket",
      resourceId: bucket.id,
      status: "SUCCESS",
      ipAddress: extractIpFromRequest(request),
      details: { bucketName: finalBucketName, region, isExisting },
    });

    return NextResponse.json(
      {
        ...bucket,
        quotaBytes: Number(bucket.quotaBytes),
      },
      { status: 201 },
    );
  } catch (error) {
    console.error("Failed to create bucket:", error);
    return NextResponse.json(
      { error: "Failed to create bucket" },
      { status: 500 },
    );
  }
}
