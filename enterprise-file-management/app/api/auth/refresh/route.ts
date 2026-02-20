
import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, createAccessToken } from '@/lib/token';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
    const refreshToken = request.cookies.get('refreshToken')?.value;

    if (!refreshToken) {
        return NextResponse.json({ error: 'Missing refresh token' }, { status: 401 });
    }

    const payload = await verifyToken(refreshToken);

    if (!payload) {
        return NextResponse.json({ error: 'Invalid refresh token' }, { status: 401 });
    }

    // Optional: Check if user still exists/is active in DB
    // const user = await prisma.user.findUnique({ where: { id: payload.id } });
    // if (!user) ...

    const newAccessToken = await createAccessToken({
        id: payload.id,
        email: payload.email,
        role: payload.role,
        tenantId: payload.tenantId,
        name: payload.name
    });

    // Set as httpOnly cookie so middleware can read it on server-side requests
    const response = NextResponse.json({ accessToken: newAccessToken });
    response.cookies.set({
        name: 'accessToken',
        value: newAccessToken,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        path: '/',
        maxAge: 60 * 15 // 15 minutes
    });

    return response;
}
