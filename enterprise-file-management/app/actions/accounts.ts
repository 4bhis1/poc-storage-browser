'use server'

import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/session"
import { encrypt } from "@/lib/encryption"
import { revalidatePath } from "next/cache"

export async function getAccounts() {
    try {
        const user = await getCurrentUser()
        if (!user || !user.tenantId) {
            return { success: false, error: "Unauthorized" }
        }

        const accounts = await prisma.account.findMany({
            where: {
                tenantId: user.tenantId,
            },
            include: {
                _count: {
                    select: { buckets: true },
                },
            },
            orderBy: {
                createdAt: 'desc',
            },
        })

        return { success: true, data: accounts }
    } catch (error) {
        console.error("Failed to fetch accounts:", error)
        return { success: false, error: "Failed to fetch accounts" }
    }
}

export async function createAccount(formData: FormData) {
    const name = formData.get("name") as string
    const awsAccessKeyId = formData.get("awsAccessKeyId") as string
    const awsSecretAccessKey = formData.get("awsSecretAccessKey") as string

    if (!name || !awsAccessKeyId || !awsSecretAccessKey) {
        return { success: false, error: "Missing required fields" }
    }

    try {
        const user = await getCurrentUser()
        if (!user || user.role !== "TENANT_ADMIN" || !user.tenantId) {
            return { success: false, error: "Unauthorized" }
        }

        // Encrypt sensitive credentials
        const encryptedAccessKeyId = encrypt(awsAccessKeyId)
        const encryptedSecretAccessKey = encrypt(awsSecretAccessKey)

        await prisma.account.create({
            data: {
                name,
                awsAccessKeyId: encryptedAccessKeyId,
                awsSecretAccessKey: encryptedSecretAccessKey,
                tenantId: user.tenantId,
            },
        })

        revalidatePath("/accounts")
        return { success: true }
    } catch (error) {
        console.error("Failed to create account:", error)
        return { success: false, error: "Failed to create account" }
    }
}
