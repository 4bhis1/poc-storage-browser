import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { authenticateCognitoUser } from '@/lib/auth-service';

export async function POST(request: NextRequest) {
    try {
        const { email, password } = await request.json();

        if (!email || !password) {
            return NextResponse.json({ error: 'Missing email or password' }, { status: 400 });
        }

        let authResult;
        let initiateAuthResponse;
        
        const cleanEmail = email.trim();
        const cleanPassword = password.trim();

        try {
            initiateAuthResponse = await authenticateCognitoUser(cleanEmail, cleanPassword);
        } catch (error: any) {
            return NextResponse.json({ error: error.message || 'Invalid credentials' }, { status: 401 });
        }

        if (initiateAuthResponse.ChallengeName === 'NEW_PASSWORD_REQUIRED') {
            return NextResponse.json({
                challengeName: 'NEW_PASSWORD_REQUIRED',
                session: initiateAuthResponse.Session,
                message: 'A new password is required'
            }, { status: 200 }); // Return 200 so frontend can handle challenge
        }

        authResult = initiateAuthResponse.AuthenticationResult;

        if (!authResult || !authResult.IdToken) {
            return NextResponse.json({ error: 'Invalid response from Cognito' }, { status: 500 });
        }

        const defaultRole = cleanEmail.toLowerCase() === 'admin@fms.com' ? 'PLATFORM_ADMIN' : 'TEAMMATE';
        
        let user;
        try {
            user = await prisma.user.upsert({
                where: { email: cleanEmail },
                update: {},
                create: {
                    email: cleanEmail,
                    role: defaultRole as any,
                }
            });
        } catch(prismaErr) {
            console.error("Local user sync err:", prismaErr);
        }

        const responseBody = {
            message: "Login successful",
            role: user?.role || defaultRole,
            tenantId: user?.tenantId || '',
            name: user?.name || '',
            id: user?.id || '',
            accessToken: authResult.IdToken,
        };
        const response = NextResponse.json(responseBody);

        response.cookies.set({
            name: 'accessToken',
            value: authResult.IdToken || '', 
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            path: '/',
            maxAge: 60 * 60 
        });
        
        if (authResult.RefreshToken) {
             response.cookies.set({
                name: 'refreshToken',
                value: authResult.RefreshToken,
                httpOnly: true,
                secure: process.env.NODE_ENV === 'production',
                sameSite: 'strict',
                path: '/',
                maxAge: 60 * 60 * 24 * 7 
            });
        }

        return response;

    } catch (error) {
        console.error("Login Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
