'use server'

import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/session'

export async function getAgentStatus() {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  try {
    const where =
      user.role === 'PLATFORM_ADMIN' ? {} : { tenantId: user.tenantId as string }

    const bot = await prisma.botIdentity.findFirst({
      where: { ...where, isActive: true },
      orderBy: { lastHeartbeatAt: 'desc' },
      select: {
        id: true,
        name: true,
        isActive: true,
        lastHeartbeatAt: true,
        lastUsedAt: true,
        agentStatus: true,
        diagnostics: true,
      },
    })

    if (!bot) {
      return { success: true, data: null }
    }

    const now = Date.now()
    const lastBeat = bot.lastHeartbeatAt ? new Date(bot.lastHeartbeatAt).getTime() : 0
    const isOnline = now - lastBeat < 2 * 60 * 1000

    // Parse diagnostics summary
    const diagnostics = (bot.diagnostics as any[]) ?? []
    const diagSummary = {
      total: diagnostics.length,
      passed: diagnostics.filter((d: any) => d.status === 'pass').length,
      warnings: diagnostics.filter((d: any) => d.status === 'warn').length,
      failed: diagnostics.filter((d: any) => d.status === 'fail').length,
      lastRun: diagnostics.length > 0 ? diagnostics[0].timestamp : null,
    }

    return {
      success: true,
      data: {
        id: bot.id,
        name: bot.name,
        status: isOnline ? 'ONLINE' : bot.lastHeartbeatAt ? 'OFFLINE' : 'NEVER_CONNECTED',
        lastHeartbeatAt: bot.lastHeartbeatAt,
        lastUsedAt: bot.lastUsedAt,
        diagnostics: diagSummary,
      },
    }
  } catch (err: any) {
    console.error('[getAgentStatus]', err)
    return { success: false, error: err.message }
  }
}
