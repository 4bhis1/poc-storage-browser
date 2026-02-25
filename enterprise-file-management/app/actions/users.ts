'use server'

import prisma from "@/lib/prisma"
import { getCurrentUser } from "@/lib/session"
import { inviteUserToCognito } from "@/lib/auth-service"
import { Role } from "@/lib/generated/prisma/client"
import { revalidatePath } from "next/cache"

export async function getUsers() {
    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return { success: false, error: "Unauthorized" }
        }

        let whereClause = {};
        if (currentUser.role !== "PLATFORM_ADMIN") {
            if (!currentUser.tenantId) {
                return { success: false, error: "Unauthorized" };
            }
            whereClause = { tenantId: currentUser.tenantId };
        }

        const users = await prisma.user.findMany({
            where: whereClause,
            orderBy: {
                createdAt: 'desc',
            },
            include: {
                tenant: true,
                teams: {
                    include: {
                        team: true
                    }
                }
            },
        })

        return { success: true, data: users }
    } catch (error) {
        console.error("Failed to fetch users:", error)
        return { success: false, error: "Failed to fetch users" }
    }
}

export async function inviteUser(formData: FormData) {
    const name = formData.get("name") as string
    const email = formData.get("email") as string
    const role = formData.get("role") as Role
    const tenantId = formData.get("tenantId") as string

    if (!email || !role || !tenantId) {
        return { success: false, error: "Missing required fields" }
    }

    try {
        const currentUser = await getCurrentUser()
        if (!currentUser) {
            return { success: false, error: "Unauthorized" }
        }

        if (currentUser.role !== "PLATFORM_ADMIN") {
            if (currentUser.role !== "TENANT_ADMIN" || currentUser.tenantId !== tenantId) {
                return { success: false, error: "Unauthorized to invite to this tenant" }
            }
        }

        // Invite User to Cognito (sends magic link/temp password)
        await inviteUserToCognito(email, tenantId, role, name)

        // Save user in database 
        await prisma.user.create({
            data: {
                name,
                email,
                role,
                tenantId,
            }
        })

        revalidatePath("/users")
        return { success: true }

    } catch (error) {
        console.error("Failed to invite user:", error)
        return { success: false, error: "Failed to invite user. Email might be in use." }
    }
}
