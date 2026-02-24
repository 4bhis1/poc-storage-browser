import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { inviteUserToCognito } from '@/lib/auth-service';
import { getCurrentUser } from '@/lib/session';

export async function GET() {
    const user = await getCurrentUser();
    if (!user || user.role !== 'PLATFORM_ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    const users = await prisma.user.findMany({
        orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json(users);
}

export async function POST(request: Request) {
    const user = await getCurrentUser();
    if (!user || user.role !== 'PLATFORM_ADMIN') {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    }
    
    try {
        const { email, role, name } = await request.json();
        
        // Invite to Cognito explicitly
        await inviteUserToCognito(email, undefined, role || 'TEAMMATE', name);
        
        // Log in Postgres
        const newUser = await prisma.user.create({
            data: { email, name, role: role || 'TEAMMATE' }
        });

        return NextResponse.json(newUser);
    } catch(err: any) {
        return NextResponse.json({ error: err.message }, { status: 500 });
    }
}
