import { NextRequest, NextResponse } from "next/server";
import { decodeJwt } from "jose";
import { refreshCognitoToken } from "@/lib/auth-service";

export async function POST(request: NextRequest) {
  try {
    const accessToken = request.cookies.get("accessToken")?.value;
    const refreshToken = request.cookies.get("refreshToken")?.value;

    if (!refreshToken) {
      return NextResponse.json(
        { error: "No refresh token available" },
        { status: 401 },
      );
    }

    if (!accessToken) {
      return NextResponse.json(
        { error: "No access token available to identify user" },
        { status: 401 },
      );
    }

    let userId: string;
    try {
      const payload = decodeJwt(accessToken);
      // Cognito uses `sub` or `cognito:username` as the stable username
      userId =
        (payload.sub as string) || (payload["cognito:username"] as string);

      if (!userId) {
        throw new Error("No user ID found in token payload");
      }
    } catch (e) {
      return NextResponse.json(
        { error: "Invalid access token structure" },
        { status: 401 },
      );
    }

    const refreshResponse = await refreshCognitoToken(userId, refreshToken);
    const authResult = refreshResponse.AuthenticationResult;

    if (!authResult || !authResult.IdToken) {
      return NextResponse.json(
        { error: "Failed to refresh token from Cognito" },
        { status: 401 },
      );
    }

    const response = NextResponse.json({
      message: "Token refreshed successfully",
      accessToken: authResult.IdToken,
    });

    response.cookies.set({
      name: "accessToken",
      value: authResult.IdToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60,
    });

    if (authResult.RefreshToken) {
      response.cookies.set({
        name: "refreshToken",
        value: authResult.RefreshToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return response;
  } catch (error: any) {
    console.error("Refresh Token Error:", error);
    return NextResponse.json(
      { error: error.message || "Internal Server Error" },
      { status: 500 },
    );
  }
}
