import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { Role } from "@/lib/generated/prisma/client";
import { getS3Client } from "@/lib/s3";
import { PutBucketCorsCommand } from "@aws-sdk/client-s3";

// POST /api/buckets/:id/cors — apply/refresh CORS on an existing bucket
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user || (user.role !== Role.PLATFORM_ADMIN && user.role !== Role.TENANT_ADMIN))
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const bucket = await prisma.bucket.findUnique({
    where: { id },
    include: { awsAccount: true },
  });

  if (!bucket) return NextResponse.json({ error: "Bucket not found" }, { status: 404 });

  const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(",").filter(Boolean) || [];
  const origins = allowedOrigins.length > 0 ? allowedOrigins : ["*"];

  const s3 = await getS3Client(null, bucket.region, bucket.awsAccount);

  await s3.send(
    new PutBucketCorsCommand({
      Bucket: bucket.name,
      CORSConfiguration: {
        CORSRules: [
          {
            AllowedHeaders: ["*"],
            AllowedMethods: ["PUT", "POST", "GET", "HEAD", "DELETE"],
            AllowedOrigins: origins,
            ExposeHeaders: ["ETag"],
            MaxAgeSeconds: 3000,
          },
        ],
      },
    }),
  );

  return NextResponse.json({ success: true, origins });
}
