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

    const dbUser = await prisma.user.findUnique({
      where: { email },
      select: { tenantId: true },
    });

    if (!dbUser?.tenantId) {
      return NextResponse.json(
        { error: "No tenant assigned" },
        { status: 403 },
      );
    }

    const tenantId = dbUser.tenantId;

    const teammates = await prisma.user.findMany({
      where: { tenantId },
      select: { id: true, name: true, email: true },
      orderBy: { name: "asc" },
    });

    return NextResponse.json(teammates);
  } catch (error) {
    console.error("Failed to fetch teammates:", error);
    return NextResponse.json(
      { error: "Failed to fetch teammates" },
      { status: 500 },
    );
  }
}
