import 'dotenv/config'
import { Pool } from 'pg'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../lib/generated/prisma/client'
import bcrypt from 'bcryptjs'

console.log('DB URL Length:', process.env.DATABASE_URL?.length, 'DB URL Start:', process.env.DATABASE_URL?.substring(0, 15));
const connectionString = `${process.env.DATABASE_URL}`
const pool = new Pool({ connectionString })
const adapter = new PrismaPg(pool)
const prisma = new PrismaClient({ adapter })

async function main() {
    // Clean up existing data
    await prisma.auditLog.deleteMany()
    await prisma.resourcePolicy.deleteMany()
    await prisma.user.deleteMany()
    await prisma.fileObject.deleteMany()
    await prisma.bucket.deleteMany()
    await prisma.account.deleteMany()
    await prisma.tenant.deleteMany()

    // Create Tenant
    const tenant = await prisma.tenant.create({
        data: {
            name: 'Acme Corp',
        },
    })

    // Create Account
    const account = await prisma.account.create({
        data: {
            name: 'Primary Account',
            tenantId: tenant.id,
        },
    })


    // Hash for "password123"
    const passwordHash = await bcrypt.hash('password123', 10)


    // Create Platform Admin
    await prisma.user.create({
        data: {
            email: 'admin@platform.com',
            password: passwordHash,
            name: 'Platform Admin',
            role: 'PLATFORM_ADMIN',
        }
    })

    // Create Tenant Admin
    const tenantAdmin = await prisma.user.create({
        data: {
            email: 'admin@acme.com',
            password: passwordHash,
            name: 'Acme Admin',
            role: 'TENANT_ADMIN',
            tenantId: tenant.id,
        }
    })

    // Create Teammate
    const teammate = await prisma.user.create({
        data: {
            email: 'user@acme.com',
            password: passwordHash,
            name: 'Acme User',
            role: 'TEAMMATE',
            tenantId: tenant.id,
        }
    })

    // Create Buckets
    const bucket1 = await prisma.bucket.create({
        data: {
            name: 'marketing-assets',
            region: 'us-east-1',
            accountId: account.id,
        },
    })

    const bucket2 = await prisma.bucket.create({
        data: {
            name: 'engineering-docs',
            region: 'eu-west-1',
            accountId: account.id,
        },
    })

    // Create Policy: Teammate can READ bucket1
    await prisma.resourcePolicy.create({
        data: {
            userId: teammate.id,
            resourceType: 'bucket',
            resourceId: bucket1.id,
            actions: ['READ', 'LIST'],
        }
    })

    // Create Files in Bucket 1
    const logo = await prisma.fileObject.create({
        data: {
            name: 'logo.png',
            key: 'marketing-assets/logo.png',
            bucketId: bucket1.id,
            size: 1024 * 500, // 500KB
            mimeType: 'image/png',
        },
    })

    // Create Folder in Bucket 1
    const folder = await prisma.fileObject.create({
        data: {
            name: 'campaigns',
            key: 'marketing-assets/campaigns/',
            bucketId: bucket1.id,
            isFolder: true,
        },
    })

    // Create File in Folder
    await prisma.fileObject.create({
        data: {
            name: 'q1-campaign.pdf',
            key: 'marketing-assets/campaigns/q1-campaign.pdf',
            bucketId: bucket1.id,
            parentId: folder.id,
            size: 1024 * 1024 * 2, // 2MB
            mimeType: 'application/pdf',
        },
    })

    console.log('Seeding completed.')
}

main()
    .then(async () => {
        await prisma.$disconnect()
    })
    .catch(async (e) => {
        console.error(e)
        await prisma.$disconnect()
        process.exit(1)
    })
