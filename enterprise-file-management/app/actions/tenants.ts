'use server'

import prisma from "@/lib/prisma"
import { hashPassword } from "@/lib/auth"
import { revalidatePath } from "next/cache"
import { Role } from "@/lib/generated/prisma/client"

export async function getTenants() {
    try {
        const tenants = await prisma.tenant.findMany({
            include: {
                _count: {
                    select: { users: true },
                },
                // We can't easily aggregate storage directly here without more complex queries or a separate view/field
                // For now, we'll return the tenants and a placeholder for storage
            },
            orderBy: {
                createdAt: 'desc',
            },
        })

        // Calculate storage usage (mock logic or separate aggregation needed for real large datasets)
        // For this POC, we'll fetch file sizes related to the tenant's buckets
        // We explicitly type 'tenant' as any for now to avoid deep type matching issues with the include
        const tenantsWithStorage = await Promise.all(tenants.map(async (tenant: any) => {
            const accounts = await prisma.account.findMany({
                where: { tenantId: tenant.id },
                select: {
                    buckets: {
                        select: {
                            objects: {
                                select: { size: true }
                            }
                        }
                    }
                }
            });

            let totalSize = 0;
            accounts.forEach((account: any) => {
                account.buckets.forEach((bucket: any) => {
                    bucket.objects.forEach((obj: any) => {
                        totalSize += obj.size || 0;
                    });
                });
            });

            return {
                ...tenant,
                storageUsed: totalSize,
            }
        }));

        return { success: true, data: tenantsWithStorage }
    } catch (error) {
        console.error("Failed to fetch tenants:", error)
        return { success: false, error: "Failed to fetch tenants" }
    }
}

export async function createTenant(formData: FormData) {
    const name = formData.get("name") as string
    const adminName = formData.get("adminName") as string
    const adminEmail = formData.get("adminEmail") as string
    const adminPassword = formData.get("adminPassword") as string

    if (!name || !adminName || !adminEmail || !adminPassword) {
        return { success: false, error: "Missing required fields" }
    }

    try {
        const hashedPassword = await hashPassword(adminPassword)

        await prisma.$transaction(async (tx) => {
            // 1. Create Tenant
            const tenant = await tx.tenant.create({
                data: {
                    name,
                },
            })

            // 2. Create Admin User for Tenant
            await tx.user.create({
                data: {
                    name: adminName,
                    email: adminEmail,
                    password: hashedPassword,
                    role: Role.TENANT_ADMIN,
                    tenantId: tenant.id,
                },
            })
        })

        revalidatePath("/tenants")
        return { success: true }
    } catch (error) {
        console.error("Failed to create tenant:", error)
        return { success: false, error: "Failed to create tenant. Email might already be in use." }
    }
}
