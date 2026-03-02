import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { authenticateCognitoUser } from "@/lib/auth-service";
import { logAudit } from "@/lib/audit";
import { extractIpFromRequest, validateUserIpAccess } from "@/lib/ip-whitelist";

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: "Missing email or password" },
        { status: 400 },
      );
    }

    let authResult;
    let initiateAuthResponse;

    const cleanEmail = email.trim();
    const cleanPassword = password.trim();

    try {
      initiateAuthResponse = await authenticateCognitoUser(
        cleanEmail,
        cleanPassword,
      );
    } catch (error: any) {
      return NextResponse.json(
        { error: error.message || "Invalid credentials" },
        { status: 401 },
      );
    }

    if (initiateAuthResponse.ChallengeName === "NEW_PASSWORD_REQUIRED") {
      return NextResponse.json(
        {
          challengeName: "NEW_PASSWORD_REQUIRED",
          session: initiateAuthResponse.Session,
          message: "A new password is required",
        },
        { status: 200 },
      ); // Return 200 so frontend can handle challenge
    }

    authResult = initiateAuthResponse.AuthenticationResult;

    if (!authResult || !authResult.IdToken) {
      return NextResponse.json(
        { error: "Invalid response from Cognito" },
        { status: 500 },
      );
    }

    const defaultRole =
      cleanEmail.toLowerCase() === "admin@fms.com"
        ? "PLATFORM_ADMIN"
        : "TEAMMATE";

    let user;
    try {
      // Find the user first to avoid overwriting existing roles with defaultRole
      let existingUser = await prisma.user.findUnique({
        where: { email: cleanEmail },
      });

      if (existingUser) {
        user = await prisma.user.update({
          where: { email: cleanEmail },
          data: { hasLoggedIn: true },
          include: {
            policies: true,
            teams: {
              include: {
                team: {
                  include: {
                    policies: true,
                  },
                },
              },
            },
          },
        });
      } else {
        user = await prisma.user.create({
          data: {
            email: cleanEmail,
            role: defaultRole as any,
            hasLoggedIn: true,
          },
          include: {
            policies: true,
            teams: {
              include: {
                team: {
                  include: {
                    policies: true,
                  },
                },
              },
            },
          },
        });
      }
    } catch (prismaErr) {
      console.error("Local user sync err:", prismaErr);
    }

    if (user) {
      const clientIp = extractIpFromRequest(request);
      if (!validateUserIpAccess(clientIp, user)) {
        logAudit({
          userId: user.id,
          action: "IP_ACCESS_DENIED",
          resource: "Authentication",
          status: "FAILED",
          ipAddress: clientIp,
          details: {
            reason: "IP not whitelisted for team during login",
            method: "PASSWORD",
          },
        });
        return NextResponse.json({ error: "IP_BLOCKED" }, { status: 403 });
      }
    }

    const responseBody = {
      message: "Login successful",
      role: user?.role || defaultRole,
      tenantId: user?.tenantId || "",
      name: user?.name || "",
      id: user?.id || "",
      accessToken: authResult.IdToken,
      policies: user?.policies || [],
      teams: user?.teams || [],
    };
    const response = NextResponse.json(responseBody);

    response.cookies.set({
      name: "accessToken",
      value: authResult.IdToken || "",
      httpOnly: true,
      secure: false,
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60,
    });

    if (authResult.RefreshToken) {
      response.cookies.set({
        name: "refreshToken",
        value: authResult.RefreshToken,
        httpOnly: true,
        secure: false,
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    if (user) {
      logAudit({
        userId: user.id,
        action: "LOGIN",
        resource: "Authentication",
        status: "SUCCESS",
        ipAddress: extractIpFromRequest(request),
        details: { email: cleanEmail, role: user.role },
      });
    }

    return response;
  } catch (error) {
    console.error("Login Error:", error);
    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 },
    );
  }
}
