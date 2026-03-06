import { NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/session"
import { Role } from "@/lib/generated/prisma/client"

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user || user.role !== Role.PLATFORM_ADMIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  const account = await prisma.awsAccount.findUnique({
    where: { id },
    select: { id: true, status: true, lastValidatedAt: true, friendlyName: true, awsAccountId: true },
  })

  if (!account) return NextResponse.json({ error: "Not found" }, { status: 404 })
  return NextResponse.json({ success: true, account })
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getCurrentUser()
  if (!user || user.role !== Role.PLATFORM_ADMIN) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
  }

  // Block deletion if active buckets are mapped to this account
  const bucketCount = await prisma.bucket.count({ where: { awsAccountId: id } })
  if (bucketCount > 0) {
    return NextResponse.json(
      { error: `Cannot delete — ${bucketCount} bucket(s) still mapped to this account.` },
      { status: 409 }
    )
  }

  await prisma.awsAccount.delete({ where: { id } })

  await prisma.auditLog.create({
    data: {
      userId: user.id,
      action: "AWS_ACCOUNT_DELETED",
      resource: "aws_account",
      details: JSON.stringify({ awsAccountId: id }),
      status: "SUCCESS",
    },
  })

  return NextResponse.json({ success: true })
}
