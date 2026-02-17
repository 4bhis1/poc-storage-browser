
import { NextRequest, NextResponse } from 'next/server';
import prisma from '@/lib/prisma';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const bucketId = searchParams.get('bucketId');
    const parentId = searchParams.get('parentId');

    if (!bucketId) {
      // If no bucketId, list all buckets for the first account of first tenant?
      // Or just return error.
      // Let's return buckets list if no bucketId is provided
      const buckets = await prisma.bucket.findMany();
      return NextResponse.json({ buckets });
    }

    // If bucketId is provided, list objects
    const whereClause: any = {
      bucketId: bucketId,
      parentId: parentId || null // If parentId is missing, look for root objects (parentId serves as null)
    };

    const files = await prisma.fileObject.findMany({
      where: whereClause,
      orderBy: {
        isFolder: 'desc', // Folders first
      },
    });

    return NextResponse.json({ files });
  } catch (error) {
    console.error('File explorer error:', error);
    return NextResponse.json({ error: 'Failed to fetch files' }, { status: 500 });
  }
}
