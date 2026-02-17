
import { NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET() {
  try {
    // Check if tenant exists
    const existingTenant = await prisma.tenant.findFirst();
    if (existingTenant) {
      return NextResponse.json({ message: 'Database already seeded', tenant: existingTenant });
    }

    // 1. Create Tenant
    const tenant = await prisma.tenant.create({
      data: {
        name: 'Default Tenant'
      }
    });

    // 2. Create Account
    const account = await prisma.account.create({
      data: {
        name: 'Default Account',
        tenantId: tenant.id
      }
    });

    // 3. Create Bucket
    const bucket = await prisma.bucket.create({
      data: {
        name: 'default-bucket',
        region: 'us-east-1',
        accountId: account.id
      }
    });

    // 4. Create Root Objects
    // Documents Folder
    const documentsFolder = await prisma.fileObject.create({
      data: {
        name: 'Documents',
        key: 'documents/',
        isFolder: true,
        bucketId: bucket.id,
      }
    });

    // Images Folder
    const imagesFolder = await prisma.fileObject.create({
      data: {
        name: 'Images',
        key: 'images/',
        isFolder: true,
        bucketId: bucket.id
      }
    });

    // Readme File
    await prisma.fileObject.create({
      data: {
        name: 'readme.txt',
        key: 'readme.txt',
        size: 512,
        mimeType: 'text/plain',
        bucketId: bucket.id
      }
    });

    // 5. Create Nested Objects
    // Resume in Documents
    await prisma.fileObject.create({
      data: {
        name: 'resume.pdf',
        key: 'documents/resume.pdf',
        size: 1024,
        mimeType: 'application/pdf',
        bucketId: bucket.id,
        parentId: documentsFolder.id
      }
    });

    // Work folder in Documents
    const workFolder = await prisma.fileObject.create({
      data: {
        name: 'Work',
        key: 'documents/work/',
        isFolder: true,
        bucketId: bucket.id,
        parentId: documentsFolder.id
      }
    });

    // Project Plan in Work
    await prisma.fileObject.create({
      data: {
        name: 'project-plan.docx',
        key: 'documents/work/project-plan.docx',
        size: 2048,
        mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        bucketId: bucket.id,
        parentId: workFolder.id
      }
    });

    return NextResponse.json({ message: 'Seeded successfully', tenantId: tenant.id });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ error: 'Failed to seed database' }, { status: 500 });
  }
}
