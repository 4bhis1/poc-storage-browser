import { NextRequest, NextResponse } from "next/server";
import { jwtDecode } from "jwt-decode";
import prisma from "@/lib/prisma";
import { logAudit } from "@/lib/audit";
import { extractIpFromRequest, validateUserIpAccess } from "@/lib/ip-whitelist";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(error)}`, request.url),
    );
  }

  if (!code) {
    console.warn("SSO Callback missing code. URL:", request.url);
    console.warn("All searchParams:", Array.from(searchParams.entries()));
    return NextResponse.redirect(
      new URL("/login?error=missing_code", request.url),
    );
  }

  const domainPrefix = process.env.COGNITO_DOMAIN_PREFIX;
  const customDomain = process.env.COGNITO_DOMAIN;
  const region = process.env.AWS_REGION || "ap-south-1";

  let domainUrl = customDomain ? `https://${customDomain}` : null;
  if (!domainUrl && domainPrefix) {
    domainUrl = `https://${domainPrefix}.auth.${region}.amazoncognito.com`;
  }

  if (!domainUrl) {
    return NextResponse.redirect(
      new URL("/login?error=Configuration missing", request.url),
    );
  }

  const clientId = process.env.COGNITO_CLIENT_ID!;
  const clientSecret = process.env.COGNITO_CLIENT_SECRET!;
  const redirectUri = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/callback`
    : "http://localhost:3000/api/auth/callback";

  try {
    const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64",
    );
    const tokenResponse = await fetch(`${domainUrl}/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${credentials}`,
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: clientId,
        code: code,
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const err = await tokenResponse.text();
      console.error("Token exchange failed:", err);
      return NextResponse.redirect(
        new URL("/login?error=SSO failed", request.url),
      );
    }

    const tokens = await tokenResponse.json();
    const idToken = tokens.id_token;
    const refreshToken = tokens.refresh_token;

    // Decode token to get user email
    const decoded: any = jwtDecode(idToken);
    const email = decoded.email;

    if (!email) {
      return NextResponse.redirect(
        new URL("/login?error=Invalid token from SSO", request.url),
      );
    }

    const defaultRole =
      email.toLowerCase() === "admin@fms.com" ? "PLATFORM_ADMIN" : "TEAMMATE";

    // Upsert user in db
    let user;
    try {
      user = await prisma.user.upsert({
        where: { email },
        update: { hasLoggedIn: true },
        create: {
          email,
          role: defaultRole as any,
          hasLoggedIn: true,
        },
        include: {
          teams: {
            include: { team: true },
          },
        },
      });

      const clientIp = extractIpFromRequest(request);
      if (!validateUserIpAccess(clientIp, user)) {
        logAudit({
          userId: user.id,
          action: "IP_ACCESS_DENIED",
          resource: "Authentication",
          status: "FAILED",
          ipAddress: clientIp,
          details: { reason: "IP not whitelisted for team during SSO login" },
        });
        return NextResponse.redirect(new URL("/ip-blocked", request.url));
      }

      logAudit({
        userId: user.id,
        action: "LOGIN",
        resource: "Authentication",
        status: "SUCCESS",
        ipAddress: extractIpFromRequest(request),
        details: { email, role: user.role, method: "SSO" },
      });
    } catch (prismaErr) {
      console.error("Local user sync err (SSO):", prismaErr);
    }

    const response = NextResponse.redirect(new URL("/", request.url));

    response.cookies.set({
      name: "accessToken",
      value: idToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 60 * 60,
    });

    if (refreshToken) {
      response.cookies.set({
        name: "refreshToken",
        value: refreshToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
        path: "/",
        maxAge: 60 * 60 * 24 * 7,
      });
    }

    return response;
  } catch (err) {
    console.error("SSO Callback error:", err);
    return NextResponse.redirect(
      new URL("/login?error=Server error", request.url),
    );
  }
}
