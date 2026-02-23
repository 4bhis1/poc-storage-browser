
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';
import { hash } from 'bcryptjs';

export async function GET() {
  try {
    // 1. Ensure Tenant
    let tenant = await prisma.tenant.findFirst();
    if (!tenant) {
        tenant = await prisma.tenant.create({
            data: { name: 'Default Tenant' }
        });
        console.log('Created Tenant:', tenant.id);
    } else {
        console.log('Tenant already exists:', tenant.id);
    }

    // 2. Ensure User (Admin)
    const email = 'admin@example.com';
    let user = await prisma.user.findUnique({
        where: { email }
    });

    if (!user) {
        const hashedPassword = await hash('password123', 10);
        user = await prisma.user.create({
            data: {
                email,
                password: hashedPassword,
                name: 'Admin User',
                role: 'PLATFORM_ADMIN',
                tenantId: tenant.id
            }
        });
        console.log('Created Admin User:', user.email);
    } else {
        console.log('Admin User already exists:', user.email);
    }

    // 3. Ensure Account
    let account = await prisma.account.findFirst({
        where: { tenantId: tenant.id }
    });
    
    if (!account) {
        account = await prisma.account.create({
            data: {
                name: 'Default Account',
                tenantId: tenant.id
            }
        });
        console.log('Created Account:', account.id);
    }

    // 4. Ensure Bucket
    let bucket = await prisma.bucket.findFirst({
        where: { accountId: account.id }
    });

    if (!bucket) {
        bucket = await prisma.bucket.create({
            data: {
                name: 'default-bucket',
                region: 'us-east-1',
                accountId: account.id,
                versioning: false,
                encryption: false
            }
        });
        console.log('Created Bucket:', bucket.id);
    }

    // 5. Ensure Basic Folder Structure (Idempotent check)
    const ensureFolder = async (name: string, key: string, parentId?: string) => {
        const existing = await prisma.fileObject.findFirst({
            where: { bucketId: bucket!.id, key }
        });
        if (!existing) {
             return prisma.fileObject.create({
                data: {
                    name,
                    key,
                    isFolder: true,
                    bucketId: bucket!.id,
                    parentId
                }
            });
        }
        return existing;
    };

    const documents = await ensureFolder('Documents', 'documents/');
    const images = await ensureFolder('Images', 'images/');
    
    // Check for readme
    const readmeKey = 'readme.txt';
    const readme = await prisma.fileObject.findFirst({ where: { bucketId: bucket.id, key: readmeKey }});
    if (!readme) {
        await prisma.fileObject.create({
            data: {
                name: 'readme.txt',
                key: readmeKey,
                size: 512,
                mimeType: 'text/plain',
                bucketId: bucket.id
            }
        });
    }

    return NextResponse.json({ 
        message: 'Seed check complete', 
        tenantId: tenant.id,
        userEmail: user.email 
    });

  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ error: 'Failed to seed database' }, { status: 500 });
  }
}
