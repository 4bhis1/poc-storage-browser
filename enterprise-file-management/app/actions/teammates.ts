'use server'

import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/session"
import { hashPassword } from "@/lib/auth"
import { Role } from "@/lib/generated/prisma/client"
import { revalidatePath } from "next/cache"

export async function getTeammates() {
    try {
        const user = await getCurrentUser()
        if (!user || !user.tenantId) {
            return { success: false, error: "Unauthorized" }
        }

        const teammates = await prisma.user.findMany({
            where: {
                tenantId: user.tenantId,
            },
            orderBy: {
                createdAt: 'desc',
            },
            select: {
                id: true,
                name: true,
                email: true,
                role: true,
                createdAt: true,
                // Exclude password
            }
        })

        return { success: true, data: teammates }
    } catch (error) {
        console.error("Failed to fetch teammates:", error)
        return { success: false, error: "Failed to fetch teammates" }
    }
}

export async function inviteTeammate(formData: FormData) {
    const name = formData.get("name") as string
    const email = formData.get("email") as string
    const role = formData.get("role") as Role
    const password = formData.get("password") as string

    if (!name || !email || !role || !password) {
        return { success: false, error: "Missing required fields" }
    }

    try {
        const currentUser = await getCurrentUser()
        if (!currentUser || currentUser.role !== "TENANT_ADMIN" || !currentUser.tenantId) {
            return { success: false, error: "Unauthorized" }
        }

        const hashedPassword = await hashPassword(password)

        await prisma.user.create({
            data: {
                name,
                email,
                password: hashedPassword,
                role,
                tenantId: currentUser.tenantId,
            },
        })

        revalidatePath("/teammates")
        return { success: true }

    } catch (error) {
        console.error("Failed to invite teammate:", error)
        return { success: false, error: "Failed to invite teammate. Email might be taken." }
    }
}
