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
      createdAt: true,
      user: { select: { email: true, name: true } },
    },
  })

  return { success: true, data: bots }
}

export async function registerBot(formData: FormData) {
  const user = await getCurrentUser()
  if (!user) return { success: false, error: 'Unauthorized' }

  if (user.role !== 'PLATFORM_ADMIN' && user.role !== 'TENANT_ADMIN') {
    return { success: false, error: 'Forbidden: ADMIN role required' }
  }

  const name       = formData.get('name') as string
  const publicKey  = formData.get('publicKey') as string
  const permsRaw   = formData.get('permissions') as string

  if (!name || !publicKey) {
    return { success: false, error: 'Name and public key are required' }
  }

  const permissions = permsRaw
    ? permsRaw.split(',').map(p => p.trim()).filter(Boolean)
    : ['READ', 'SYNC']

  try {
    const bot = await prisma.botIdentity.create({
      data: {
        name,
        publicKey,
        permissions,
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
