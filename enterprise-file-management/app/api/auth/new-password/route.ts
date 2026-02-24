import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { respondToNewPasswordChallenge } from '@/lib/auth-service';

export async function POST(request: NextRequest) {
    try {
        const { email, newPassword, session } = await request.json();

        if (!email || !newPassword || !session) {
            return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
        }

        let authResponse;
        
        const cleanEmail = email.trim();
        const cleanPassword = newPassword.trim();
        const cleanSession = session.trim();

        try {
            authResponse = await respondToNewPasswordChallenge(cleanEmail, cleanPassword, cleanSession);
        } catch (error: any) {
            return NextResponse.json({ error: error.message || 'Failed to update password' }, { status: 400 });
        }

        const authResult = authResponse.AuthenticationResult;

        if (!authResult || !authResult.IdToken) {
            return NextResponse.json({ error: 'Invalid response from Cognito after password update' }, { status: 500 });
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
            message: "Password updated and login successful",
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
        console.error("New Password Error:", error);
        return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
