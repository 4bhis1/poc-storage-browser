import { getCurrentUser } from '@/lib/session'
import prisma from '@/lib/prisma'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const user = await getCurrentUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // Clear diagnostics for all bots in user's tenant
    const where = user.role === 'PLATFORM_ADMIN' ? {} : { tenantId: user.tenantId as string }
    
    await prisma.botIdentity.updateMany({
      where,
      data: { diagnostics: null, heartbeatLogs: null },
    })

    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
