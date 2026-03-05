/**
 * /api/bot
 *
 * GET  — List bots for the current user's tenant
 * POST — Register a new bot identity (ADMIN only)
 * DELETE ?id={botId} — Revoke/delete a bot (the Kill Switch)
 */

import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { getCurrentUser } from '@/lib/session';
import { logAudit } from '@/lib/audit';

// ── GET /api/bot ──────────────────────────────────────────────────────────────
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const where =
    user.role === 'PLATFORM_ADMIN'
      ? {}
      : { tenantId: user.tenantId as string };

  const bots = await prisma.botIdentity.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, name: true, permissions: true,
      isActive: true, lastUsedAt: true, createdAt: true,
      user: { select: { email: true, name: true } },
    },
  });

  return NextResponse.json({ data: bots });
}

// ── POST /api/bot ─────────────────────────────────────────────────────────────
export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (user.role !== 'PLATFORM_ADMIN' && user.role !== 'TENANT_ADMIN') {
    return NextResponse.json({ error: 'Forbidden: ADMIN role required' }, { status: 403 });
  }

  const { name, publicKey, permissions } = await request.json();

  if (!name || !publicKey) {
    return NextResponse.json({ error: 'name and publicKey are required' }, { status: 400 });
  }

  const bot = await prisma.botIdentity.create({
    data: {
      name,
      publicKey,
      permissions: permissions ?? ['READ', 'SYNC'],
      userId:   user.id,
      tenantId: user.tenantId as string,
    },
  });

  void logAudit({
    userId:   user.id,
    action:   'USER_INVITED', // closest existing action — extend AuditAction if desired
    resource: 'BotIdentity',
    resourceId: bot.id,
    details:  { name, permissions },
    status:   'SUCCESS',
  });

  return NextResponse.json({ botId: bot.id, name: bot.name }, { status: 201 });
}

// ── DELETE /api/bot?id={botId} ────────────────────────────────────────────────
export async function DELETE(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (user.role !== 'PLATFORM_ADMIN' && user.role !== 'TENANT_ADMIN') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const botId = searchParams.get('id');
  if (!botId) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  // Scope check — TENANT_ADMIN can only delete their own tenant's bots
  const bot = await prisma.botIdentity.findUnique({ where: { id: botId } });
  if (!bot) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (user.role !== 'PLATFORM_ADMIN' && bot.tenantId !== user.tenantId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await prisma.botIdentity.delete({ where: { id: botId } });

  void logAudit({
    userId:   user.id,
    action:   'PERMISSION_REMOVED',
    resource: 'BotIdentity',
    resourceId: botId,
    details:  { name: bot.name },
    status:   'SUCCESS',
  });

  return NextResponse.json({ success: true });
}
