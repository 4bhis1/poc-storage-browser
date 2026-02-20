
import 'dotenv/config';
import prisma from './lib/prisma';

async function debug() {
    try {
        const files = await prisma.fileObject.findMany({
            where: { bucketId: 'cmlthz7n30000ipbpeqbcmnc0', parentId: null },
            orderBy: { isFolder: 'desc' },
            include: { children: true }
        });

        const fileItems = files.map(f => ({
            id: f.id,
            name: f.name,
            type: f.isFolder ? 'folder' : (f.mimeType?.includes('image') ? 'image' : f.mimeType?.includes('pdf') ? 'pdf' : 'document'),
            size: f.size,
            modifiedAt: f.updatedAt.toISOString(),
            isFolderRaw: f.isFolder
        }));

        console.log(JSON.stringify(fileItems, null, 2));
    } catch (e) {
        console.error(e);
    } finally {
        await prisma.$disconnect();
    }
}

debug();
