import { cookies } from "next/headers"
import { verifyToken } from "@/lib/token"
import prisma from "@/lib/prisma"

export async function getCurrentUser() {
    const cookieStore = await cookies()
    const token = cookieStore.get("accessToken")?.value

    if (!token) return null

    const payload = await verifyToken(token)
    if (!payload || !payload.id) return null

    try {
        const user = await prisma.user.findUnique({
            where: { id: payload.id as string },
            include: { tenant: true },
        })
        return user
    } catch (error) {
        return null
    }
}
