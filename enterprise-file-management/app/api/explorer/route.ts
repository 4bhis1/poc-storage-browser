import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { verifyToken } from "@/lib/token";

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

    // Look up tenantId from DB — Cognito token may not have it directly
    const dbUser = await prisma.user.findUnique({
      where: { email },
      select: { tenantId: true },
    });

    if (!dbUser?.tenantId) {
      return NextResponse.json(
        { error: "No tenant assigned to user" },
        { status: 403 },
      );
    }

    const tenantId = dbUser.tenantId;

    const searchParams = request.nextUrl.searchParams;
    const query = searchParams.get("q");
    const bucketId = searchParams.get("bucketId");
    const createdBy = searchParams.get("createdBy");
    const typesParam = searchParams.get("types");
    const page = parseInt(searchParams.get("page") || "1");
    const limit = parseInt(searchParams.get("limit") || "50");
    const skip = (page - 1) * limit;

    const where: any = {
      tenantId,
      isFolder: false, // File Explorer only shows files, not folders
    };

    if (bucketId) where.bucketId = bucketId;
    if (createdBy) where.createdBy = createdBy;

    if (query) {
      where.OR = [
        { name: { contains: query, mode: "insensitive" } },
        { key: { contains: query, mode: "insensitive" } },
      ];
    }

    if (typesParam) {
      const types = typesParam.split(",");
      const typeConditions: any[] = [];

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

      if (typeConditions.length > 0) {
        if (where.OR) {
          where.AND = [{ OR: where.OR }, { OR: typeConditions }];
          delete where.OR;
        } else {
          where.OR = typeConditions;
        }
      }
    }

    const [total, files] = await Promise.all([
      prisma.fileObject.count({ where }),
      prisma.fileObject.findMany({
        where,
        orderBy: { createdAt: "desc" }, // Latest first
        include: {
          bucket: {
            select: { name: true },
          },
          createdByUser: {
            select: { name: true, email: true },
          },
        },
        skip,
        take: limit,
      }),
    ]);

    const fileItems = files.map((f) => {
      // Determine type for icons
      let type = "other";
      const lowerName = f.name.toLowerCase();
      if (f.mimeType?.includes("image")) type = "image";
      else if (f.mimeType?.includes("pdf") || lowerName.endsWith(".pdf"))
        type = "pdf";
      else if (f.mimeType?.includes("video")) type = "video";
      else if (f.mimeType?.includes("audio")) type = "audio";
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
        size: f.size || 0,
        // Using createdAt as requested for sorting by "latest one first",
        // but supplying it as modifiedAt to match existing frontend mock types if necessary
        modifiedAt: f.createdAt.toISOString(),
        owner: f.createdByUser?.name || f.createdByUser?.email || "Unknown",
        ownerId: f.createdBy,
        bucketName: f.bucket.name,
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
