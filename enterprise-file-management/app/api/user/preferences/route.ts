import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/session";
import prisma from "@/lib/prisma";
import { z } from "zod";

const preferencesSchema = z.object({
  themeMode: z.enum(["light", "dark", "system"]).optional(),
  themeColor: z.string().optional(),
  themeFont: z.enum(["inter", "manrope", "system"]).optional(),
  themeRadius: z.string().optional(),
});

export async function GET() {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      select: {
        themeMode: true,
        themeColor: true,
        themeFont: true,
        themeRadius: true,
      },
    });

    if (!dbUser) {
      return new NextResponse("User not found", { status: 404 });
    }

    return NextResponse.json(dbUser);
  } catch (error) {
    console.error("[USER_PREFERENCES_GET]", error);
    return new NextResponse("Internal Error", { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await getCurrentUser();
    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { themeMode, themeColor, themeFont, themeRadius } =
      preferencesSchema.parse(body);

    const updatedUser = await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        themeMode,
        themeColor,
        themeFont,
        themeRadius,
      },
      select: {
        themeMode: true,
        themeColor: true,
        themeFont: true,
        themeRadius: true,
      },
    });

    return NextResponse.json(updatedUser);
  } catch (error) {
    console.error("[USER_PREFERENCES_PATCH]", error);
    if (error instanceof z.ZodError) {
      return new NextResponse("Invalid request data", { status: 422 });
    }
    return new NextResponse("Internal Error", { status: 500 });
  }
}
