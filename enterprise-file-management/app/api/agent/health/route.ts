/**
 * POST /api/agent/health  — Agent pushes heartbeat logs + diagnostics
 * GET  /api/agent/health?botId=xxx — Dashboard fetches stored health data
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { verifyBotToken } from '@/lib/bot-auth';
import { verifyToken } from '@/lib/token';

export async function POST(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const botAuth = await verifyBotToken(token);
    if (!botAuth) return NextResponse.json({ error: 'Invalid token' }, { status: 401 });

    const bot = await prisma.botIdentity.findUnique({ where: { id: botAuth.botId } });
    if (!bot || !bot.isActive) return NextResponse.json({ error: 'Bot revoked' }, { status: 403 });

    const { heartbeatLogs, diagnostics, currentStatus } = await request.json();

    await prisma.botIdentity.update({
      where: { id: bot.id },
      data: {
        lastHeartbeatAt: new Date(),
        agentStatus: currentStatus ?? 'UNKNOWN',
        heartbeatLogs: heartbeatLogs ?? [],
        diagnostics: diagnostics ?? [],
      },
    });

    return NextResponse.json({ success: true });
  } catch (err: any) {
    console.error('[AgentHealth POST]', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const token = request.headers.get('Authorization')?.split(' ')[1];
    if (!token) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    // Accept both user tokens and bot tokens for reading
    const botAuth = await verifyBotToken(token);
    const userPayload = botAuth ? null : await verifyToken(token);
    if (!botAuth && !userPayload) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const botId = new URL(request.url).searchParams.get('botId');
    if (!botId) return NextResponse.json({ error: 'botId required' }, { status: 400 });

    const bot = await prisma.botIdentity.findUnique({
      where: { id: botId },
      select: {
        id: true, name: true, isActive: true,
        lastHeartbeatAt: true, lastUsedAt: true, createdAt: true,
        agentStatus: true, heartbeatLogs: true, diagnostics: true,
      },
    });

    if (!bot) return NextResponse.json({ error: 'Bot not found' }, { status: 404 });

    const now = Date.now();
    const lastBeat = bot.lastHeartbeatAt ? new Date(bot.lastHeartbeatAt).getTime() : 0;
    const isOnline = now - lastBeat < 10 * 1000; // 10 seconds

    return NextResponse.json({
      bot: {
        ...bot,
        status: isOnline ? 'ONLINE' : (bot.lastHeartbeatAt ? 'OFFLINE' : 'NEVER_CONNECTED'),
      },
      heartbeatLogs: (bot.heartbeatLogs as any[]) ?? [],
      diagnostics: (bot.diagnostics as any[]) ?? [],
    });
  } catch (err: any) {
    console.error('[AgentHealth GET]', err);
    return NextResponse.json({ error: 'Failed' }, { status: 500 });
  }
}
