import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyToken } from '@/lib/token';

export async function POST(request: NextRequest) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = await verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const body = await request.json();
        const { status, startedAt, completedAt, totalFiles, syncedFiles, failedFiles, activities } = body;

        const syncHistory = await prisma.syncHistory.create({
            data: {
                status,
                startedAt: new Date(startedAt),
                completedAt: completedAt ? new Date(completedAt) : new Date(),
                totalFiles: totalFiles || 0,
                syncedFiles: syncedFiles || 0,
                failedFiles: failedFiles || 0,
                activities: {
                    create: (activities || []).map((activity: any) => ({
                        action: activity.action,
                        fileName: activity.fileName,
                        status: activity.status,
                        error: activity.error,
                    })),
                },
            },
        });

        return NextResponse.json({ success: true, id: syncHistory.id });

    } catch (error) {
        console.error('[AgentSyncHistory] Error saving history:', error);
        return NextResponse.json({ error: 'Failed to save sync history' }, { status: 500 });
    }
}

export async function GET(request: NextRequest) {
    try {
        const token = request.headers.get('Authorization')?.split(' ')[1];
        if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const payload = await verifyToken(token);
        if (!payload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

        const histories = await prisma.syncHistory.findMany({
            include: {
                activities: true,
            },
            orderBy: {
                startedAt: 'desc',
            },
            take: 50, // Limit to last 50 entries
        });

        return NextResponse.json({ histories });

    } catch (error) {
        console.error('[AgentSyncHistory] Error fetching history:', error);
        return NextResponse.json({ error: 'Failed to fetch sync history' }, { status: 500 });
    }
}
