import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/token";
import { Prisma } from "@/lib/generated/prisma/client";
import { logAudit } from "@/lib/audit";
import { extractIpFromRequest, validateUserIpAccess } from "@/lib/ip-whitelist";

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get("Authorization")?.split(" ")[1];
    if (!token)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const payload = await verifyToken(token);
    if (!payload || typeof payload !== "object" || !payload.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const email = payload.email as string;

    // Look up full user from DB including role and policies for RBAC
    const dbUser = await prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        tenantId: true,
        role: true,
        policies: true,
        teams: {
          where: { isDeleted: false },
          include: {
            team: { include: { policies: true } },
          },
        },
      },
    });

    if (!dbUser?.tenantId) {
      return NextResponse.json(
        { error: "No tenant assigned to user" },
        { status: 403 },
      );
    }

    const clientIp = extractIpFromRequest(request);
    if (!validateUserIpAccess(clientIp, dbUser)) {
      logAudit({
        userId: dbUser.id,
        action: "IP_ACCESS_DENIED",
        resource: "FileObject",
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

    const tenantId = dbUser.tenantId;

    // ── RBAC: Compute allowed bucket IDs for TEAMMATE ────────────────────
    let allowedBucketIdFilter: string[] | null = null; // null = all buckets

    if (dbUser.role !== "PLATFORM_ADMIN" && dbUser.role !== "TENANT_ADMIN") {
      // Collect policies from direct assignments AND team memberships
      const allPolicies: any[] = [
        ...(dbUser.policies || []),
        ...(dbUser.teams || []).flatMap((m: any) => m.team?.policies || []),
      ];

      const hasGlobalAccess = allPolicies.some(
        (p: any) =>
          p.resourceType?.toLowerCase() === "bucket" &&
          p.resourceId === null &&
          (p.actions.includes("READ") || p.actions.includes("LIST")),
      );

      if (!hasGlobalAccess) {
        const bucketIds = allPolicies
          .filter(
            (p: any) =>
              p.resourceType?.toLowerCase() === "bucket" &&
              p.resourceId !== null &&
              (p.actions.includes("READ") || p.actions.includes("LIST")),
          )
          .map((p: any) => p.resourceId as string);

        allowedBucketIdFilter = [...new Set(bucketIds)];

        // No accessible buckets → return empty
        if (allowedBucketIdFilter.length === 0) {
          return NextResponse.json({
            data: [],
            metadata: { total: 0, page: 1, limit: 10, totalPages: 0 },
          });
        }
      }
    }

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q");
    const bucketId = searchParams.get("bucketId");
    const createdBy = searchParams.get("createdBy");
    const typesParam = searchParams.get("types");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "10");
    const skip = (page - 1) * limit;

    // ── Build type-filter mime conditions (shared between both paths) ──────
    type MimeFilter = { mimeType?: object; name?: object; OR?: MimeFilter[] };
    const typeConditions: MimeFilter[] = [];
    if (typesParam) {
      const types = typesParam.split(",");
      types.forEach((t) => {
        if (t === "image")
          typeConditions.push({
            mimeType: { contains: "image", mode: "insensitive" },
          });
        else if (t === "video")
          typeConditions.push({
            mimeType: { contains: "video", mode: "insensitive" },
          });
        else if (t === "audio")
          typeConditions.push({
            mimeType: { contains: "audio", mode: "insensitive" },
          });
        else if (t === "pdf")
          typeConditions.push({
            OR: [
              { mimeType: { contains: "pdf", mode: "insensitive" } },
              { name: { endsWith: ".pdf", mode: "insensitive" } },
            ],
          });
        else if (t === "document")
          typeConditions.push({
            OR: [
              { name: { endsWith: ".docx", mode: "insensitive" } },
              { name: { endsWith: ".doc", mode: "insensitive" } },
              { name: { endsWith: ".txt", mode: "insensitive" } },
            ],
          });
        else if (t === "spreadsheet")
          typeConditions.push({
            OR: [
              { name: { endsWith: ".xlsx", mode: "insensitive" } },
              { name: { endsWith: ".csv", mode: "insensitive" } },
              { name: { endsWith: ".xls", mode: "insensitive" } },
            ],
          });
        else if (t === "archive")
          typeConditions.push({
            OR: [
              { name: { endsWith: ".zip", mode: "insensitive" } },
              { name: { endsWith: ".tar", mode: "insensitive" } },
              { name: { endsWith: ".gz", mode: "insensitive" } },
            ],
          });
        else if (t === "code")
          typeConditions.push({
            OR: [
              { name: { endsWith: ".js", mode: "insensitive" } },
              { name: { endsWith: ".ts", mode: "insensitive" } },
              { name: { endsWith: ".json", mode: "insensitive" } },
              { name: { endsWith: ".html", mode: "insensitive" } },
              { name: { endsWith: ".css", mode: "insensitive" } },
            ],
          });
      });
    }

    // ── FTS path: use searchVector when query is provided ──────────────────
    let files: any[];
    let total: number;

    if (query) {
      // Build WHERE clauses for the raw SQL
      const conditions: Prisma.Sql[] = [
        Prisma.sql`f."tenantId" = ${tenantId}`,
        Prisma.sql`f."isFolder" = false`,
        // Use FTS if searchVector is populated, otherwise fall back to ILIKE
        Prisma.sql`(
          (f."searchVector" IS NOT NULL AND f."searchVector" @@ websearch_to_tsquery('english', ${query}))
          OR f.name ILIKE ${"%" + query + "%"}
          OR f.key ILIKE ${"%" + query + "%"}
        )`,
      ];

      if (bucketId) {
        conditions.push(Prisma.sql`f."bucketId" = ${bucketId}`);
      } else if (allowedBucketIdFilter !== null) {
        // TEAMMATE: restrict to allowed buckets only
        conditions.push(
          Prisma.sql`f."bucketId" = ANY(${allowedBucketIdFilter}::text[])`,
        );
      }
      if (createdBy) {
        conditions.push(Prisma.sql`f."createdBy" = ${createdBy}`);
      }

      // Apply type filters in the FTS path via raw SQL
      if (typesParam) {
        const types = typesParam.split(",");
        const typeSqlParts: Prisma.Sql[] = [];
        types.forEach((t) => {
          if (t === "image")
            typeSqlParts.push(Prisma.sql`f."mimeType" ILIKE '%image%'`);
          else if (t === "video")
            typeSqlParts.push(Prisma.sql`f."mimeType" ILIKE '%video%'`);
          else if (t === "audio")
            typeSqlParts.push(Prisma.sql`f."mimeType" ILIKE '%audio%'`);
          else if (t === "pdf")
            typeSqlParts.push(
              Prisma.sql`(f."mimeType" ILIKE '%pdf%' OR f.name ILIKE '%.pdf')`,
            );
          else if (t === "document")
            typeSqlParts.push(
              Prisma.sql`(f.name ILIKE '%.docx' OR f.name ILIKE '%.doc' OR f.name ILIKE '%.txt')`,
            );
          else if (t === "spreadsheet")
            typeSqlParts.push(
              Prisma.sql`(f.name ILIKE '%.xlsx' OR f.name ILIKE '%.csv' OR f.name ILIKE '%.xls')`,
            );
          else if (t === "archive")
            typeSqlParts.push(
              Prisma.sql`(f.name ILIKE '%.zip' OR f.name ILIKE '%.tar' OR f.name ILIKE '%.gz')`,
            );
          else if (t === "code")
            typeSqlParts.push(
              Prisma.sql`(f.name ILIKE '%.js' OR f.name ILIKE '%.ts' OR f.name ILIKE '%.json' OR f.name ILIKE '%.html' OR f.name ILIKE '%.css')`,
            );
        });
        if (typeSqlParts.length > 0) {
          conditions.push(Prisma.sql`(${Prisma.join(typeSqlParts, " OR ")})`);
        }
      }

      const whereClause = Prisma.join(conditions, " AND ");

      // Count query
      const countResult = await prisma.$queryRaw<{ count: bigint }[]>`
        SELECT COUNT(*) AS count
        FROM "FileObject" f
        WHERE ${whereClause}
      `;
      total = Number(countResult[0].count);

      // Data query — join bucket and user for display fields
      files = await prisma.$queryRaw<any[]>`
        SELECT
          f.id,
          f.name,
          f.key,
          f."mimeType",
          f.size,
          f."createdAt",
          f."bucketId",
          f."tenantId",
          f."createdBy",
          b.name AS "bucketName",
          u.name AS "ownerName",
          u.email AS "ownerEmail",
          -- FTS rank for ordering (higher rank = better match)
          CASE
            WHEN f."searchVector" IS NOT NULL
            THEN ts_rank(f."searchVector", websearch_to_tsquery('english', ${query}))
            ELSE 0
          END AS rank
        FROM "FileObject" f
        JOIN "Bucket" b ON b.id = f."bucketId"
        LEFT JOIN "User" u ON u.id = f."createdBy"
        WHERE ${whereClause}
        ORDER BY rank DESC, f."createdAt" DESC
        LIMIT ${limit} OFFSET ${skip}
      `;
    } else {
      // ── Non-search path: use Prisma ORM (efficient, typed) ──────────────
      const where: any = {
        tenantId,
        isFolder: false,
      };

      if (bucketId) {
        where.bucketId = bucketId;
      } else if (allowedBucketIdFilter !== null) {
        // TEAMMATE: restrict to allowed buckets only
        where.bucketId = { in: allowedBucketIdFilter };
      }
      if (createdBy) where.createdBy = createdBy;

      if (typeConditions.length > 0) {
        where.OR = typeConditions;
      }

      const [countResult, dbFiles] = await Promise.all([
        prisma.fileObject.count({ where }),
        prisma.fileObject.findMany({
          where,
          orderBy: { createdAt: "desc" },
          include: {
            bucket: { select: { name: true } },
            createdByUser: { select: { name: true, email: true } },
          },
          skip,
          take: limit,
        }),
      ]);

      total = countResult;
      files = dbFiles.map((f) => ({
        ...f,
        bucketName: f.bucket.name,
        ownerName: f.createdByUser?.name,
        ownerEmail: f.createdByUser?.email,
      }));
    }

    // ── Map to response shape ──────────────────────────────────────────────
    const fileItems = files.map((f: any) => {
      let type = "other";
      const lowerName = (f.name as string).toLowerCase();
      const mime = (f.mimeType as string | null) ?? "";

      if (mime.includes("image")) type = "image";
      else if (mime.includes("pdf") || lowerName.endsWith(".pdf")) type = "pdf";
      else if (mime.includes("video")) type = "video";
      else if (mime.includes("audio")) type = "audio";
      else if (
        lowerName.endsWith(".docx") ||
        lowerName.endsWith(".doc") ||
        lowerName.endsWith(".txt")
      )
        type = "document";
      else if (
        lowerName.endsWith(".xlsx") ||
        lowerName.endsWith(".csv") ||
        lowerName.endsWith(".xls")
      )
        type = "spreadsheet";
      else if (
        lowerName.endsWith(".zip") ||
        lowerName.endsWith(".tar") ||
        lowerName.endsWith(".gz")
      )
        type = "archive";
      else if (
        lowerName.endsWith(".js") ||
        lowerName.endsWith(".ts") ||
        lowerName.endsWith(".json") ||
        lowerName.endsWith(".html") ||
        lowerName.endsWith(".css")
      )
        type = "code";

      return {
        id: f.id,
        name: f.name,
        key: f.key,
        type,
        size: Number(f.size) || 0,
        modifiedAt: (f.createdAt instanceof Date
          ? f.createdAt
          : new Date(f.createdAt as string)
        ).toISOString(),
        owner: f.ownerName || f.ownerEmail || "Unknown",
        ownerId: f.createdBy,
        bucketName: f.bucketName,
        bucketId: f.bucketId,
        tenantId: f.tenantId,
      };
    });

    return NextResponse.json({
      data: fileItems,
      metadata: { total, page, limit, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    console.error("Failed to search files:", error);
    return NextResponse.json(
      { error: "Failed to search files" },
      { status: 500 },
    );
  }
}
