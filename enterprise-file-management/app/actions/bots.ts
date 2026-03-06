'use server'

import prisma from '@/lib/prisma'
import { getCurrentUser } from '@/lib/session'
import { revalidatePath } from 'next/cache'

export async function getBots() {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const where =
    user.role === 'PLATFORM_ADMIN' ? {} : { tenantId: user.tenantId as string }

  const bots = await prisma.botIdentity.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      name: true,
      permissions: true,
      isActive: true,
      lastUsedAt: true,
      lastHeartbeatAt: true,
      diagnostics: true,
      createdAt: true,
      user: { select: { email: true, name: true } },
    },
  })

  // Compute connectionStatus: online if heartbeat within last 10 seconds
  const botsWithStatus = bots.map(bot => {
    const now = Date.now()
    const lastBeat = bot.lastHeartbeatAt ? new Date(bot.lastHeartbeatAt).getTime() : 0
    const isOnline = now - lastBeat < 10 * 1000 // 10 seconds
    
    // Check for failed diagnostics
    const diagnostics = (bot.diagnostics as any[]) ?? []
    const hasDiagFailures = diagnostics.some((d: any) => d.status === 'fail')
    
    return {
      ...bot,
      connectionStatus: isOnline ? 'online' : 'offline',
      hasDiagnosticFailures: hasDiagFailures,
    }
  })

  return { success: true, data: botsWithStatus }
}

export async function getBucketsForTenant() {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const where = user.role === 'PLATFORM_ADMIN' ? {} : { tenantId: user.tenantId as string }

  const buckets = await prisma.bucket.findMany({
    where,
    select: { id: true, name: true, region: true },
    orderBy: { name: 'asc' },
  })

  return { success: true, data: buckets }
}

export async function registerBot(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  if (user.role !== 'PLATFORM_ADMIN' && user.role !== 'TENANT_ADMIN') {
    return { success: false, error: 'Forbidden: ADMIN role required' }
  }

  const name      = formData.get('name') as string
  const publicKey = formData.get('publicKey') as string
  // bucketPermissions: JSON string of { [bucketId]: string[] }
  const bucketPermsRaw = formData.get('bucketPermissions') as string

  if (!name || !publicKey) {
    return { success: false, error: 'Name and public key are required' }
  }

  function normalizePem(pem: string): string {
    let cleaned = pem.replace(/\\n/g, '\n').replace(/\r\n/g, '\n').trim()
    const m = cleaned.match(/^(-----BEGIN [^-]+-----)([\s\S]+?)(-----END [^-]+-----)$/)
    if (m) {
      const body    = m[2].replace(/\s+/g, '')
      const wrapped = body.match(/.{1,64}/g)!.join('\n')
      cleaned = `${m[1]}\n${wrapped}\n${m[3]}`
    }
    return cleaned
  }

  const normalizedKey = normalizePem(publicKey)

  let bucketPermissions: Record<string, string[]> = {}
  try {
    bucketPermissions = bucketPermsRaw ? JSON.parse(bucketPermsRaw) : {}
  } catch {}

  try {
    const bot = await prisma.botIdentity.create({
      data: {
        name,
        publicKey: normalizedKey,
        // Store bucket permissions as JSON in the permissions array field
        // Format: ["BUCKET:id:READ", "BUCKET:id:UPLOAD", ...]
        permissions: Object.entries(bucketPermissions).flatMap(([bucketId, perms]) =>
          perms.map(p => `BUCKET:${bucketId}:${p}`)
        ),
        userId:   user.id,
        tenantId: user.tenantId as string,
      },
    })
    revalidatePath('/bots')
    return { success: true, botId: bot.id }
  } catch (err: any) {
    return { success: false, error: err.message }
  }
}

export async function updateBotPermissions(botId: string, bucketPermissions: Record<string, string[]>) {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'Unauthorized' }
  if (user.role !== 'PLATFORM_ADMIN' && user.role !== 'TENANT_ADMIN') {
    return { success: false, error: 'Forbidden' }
  }

  const bot = await prisma.botIdentity.findUnique({ where: { id: botId } })
  if (!bot) return { success: false, error: 'Not found' }
  if (user.role !== 'PLATFORM_ADMIN' && bot.tenantId !== user.tenantId) {
    return { success: false, error: 'Forbidden' }
  }

  const permissions = Object.entries(bucketPermissions).flatMap(([bucketId, perms]) =>
    perms.map(p => `BUCKET:${bucketId}:${p}`)
  )

  await prisma.botIdentity.update({ where: { id: botId }, data: { permissions } })
  revalidatePath('/bots')
  return { success: true }
}

export async function getBotActivity(botId: string) {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  // Find the bot's userId so we can query audit logs
  const bot = await prisma.botIdentity.findUnique({
    where: { id: botId },
    select: { userId: true, tenantId: true },
  })
  if (!bot) return { success: false, error: 'Not found' }
  if (user.role !== 'PLATFORM_ADMIN' && bot.tenantId !== user.tenantId) {
    return { success: false, error: 'Forbidden' }
  }

  const logs = await prisma.auditLog.findMany({
    where: { userId: bot.userId, resource: { contains: 'BotIdentity' } },
    orderBy: { createdAt: 'desc' },
    take: 50,
    select: {
      id: true, action: true, resource: true,
      details: true, status: true, createdAt: true,
    },
  })

  // Also grab sync activities from SyncHistory (stored by the agent)
  const syncLogs = await prisma.auditLog.findMany({
    where: {
      userId: bot.userId,
      action: { in: ['FILE_UPLOAD', 'FILE_DOWNLOAD', 'FILE_DELETE'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 100,
    select: {
      id: true, action: true, resource: true,
      details: true, status: true, createdAt: true,
    },
  })

  return { success: true, data: [...logs, ...syncLogs].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  ).slice(0, 100) }
}

export async function revokeBot(botId: string) {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  if (user.role !== 'PLATFORM_ADMIN' && user.role !== 'TENANT_ADMIN') {
    return { success: false, error: 'Forbidden' }
  }

  const bot = await prisma.botIdentity.findUnique({ where: { id: botId } })
  if (!bot) return { success: false, error: 'Not found' }

  if (user.role !== 'PLATFORM_ADMIN' && bot.tenantId !== user.tenantId) {
    return { success: false, error: 'Forbidden' }
  }

  await prisma.botIdentity.delete({ where: { id: botId } })
  revalidatePath('/bots')
  return { success: true }
}

export async function clearBotDiagnostics(botId: string) {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  const bot = await prisma.botIdentity.findUnique({ where: { id: botId } })
  if (!bot) return { success: false, error: 'Not found' }

  if (user.role !== 'PLATFORM_ADMIN' && bot.tenantId !== user.tenantId) {
    return { success: false, error: 'Forbidden' }
  }

  await prisma.botIdentity.update({
    where: { id: botId },
    data: { diagnostics: null, heartbeatLogs: null },
  })

  return { success: true }
}
