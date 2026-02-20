
import { NextRequest, NextResponse } from 'next/server';
import { comparePassword, createAccessToken, createRefreshToken } from '@/lib/auth';
import prisma from '@/lib/prisma';

export async function POST(request: NextRequest) {
    try {
        const { email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json({ error: 'Missing email or password' }, { status: 400 });
        }

        const user = await prisma.user.findUnique({
            where: { email },
            include: {
                tenant: true,
                policies: true
            }
        });

        if (!user || !user.password) { // Check user and password existence
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        const isValid = await comparePassword(password, user.password);

        if (!isValid) {
            return NextResponse.json({ error: 'Invalid credentials' }, { status: 401 });
        }

        // Generate Tokens
        const payload = {
            id: user.id,
            email: user.email,
            role: user.role,
            tenantId: user.tenantId,
            name: user.name
        };

        const accessToken = await createAccessToken(payload);
        const refreshToken = await createRefreshToken(payload);

        // Set Refresh Token in HTTP-only cookie
        const response = NextResponse.json({
            accessToken,
            user: {
                id: user.id,
                email: user.email,
                name: user.name,
                role: user.role,
                tenantId: user.tenantId,
                tenantName: user.tenant?.name,
                policies: user.policies
            }
        });

        response.cookies.set({
            name: 'refreshToken',
            value: refreshToken,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 60 * 60 * 24 * 7 // 7 days
        });

        response.cookies.set({
            name: 'accessToken',
            value: accessToken,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 60 * 15 // 15 minutes
        });

        return response;

    } catch (error) {
        console.error("Login Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
