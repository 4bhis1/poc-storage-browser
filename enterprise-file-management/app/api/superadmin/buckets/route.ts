import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getCurrentUser } from "@/lib/session";
import { Role } from "@/lib/generated/prisma/client";

export async function GET() {
  const user = await getCurrentUser();
  if (!user || user.role !== Role.PLATFORM_ADMIN)
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const buckets = await prisma.bucket.findMany({
    include: {
      awsAccount: true,
      tenant: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json(
    buckets.map((b) => ({ ...b, quotaBytes: Number(b.quotaBytes) })),
  );
}
