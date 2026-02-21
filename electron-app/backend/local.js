const fs = require('fs/promises');
const path = require('path');

/**
 * Handles all local file interactions: reading, sorting, and filtering.
 */
class LocalFileManager {
    async listContent(folderPath, sortBy = 'az', filterBy = 'all', search = '') {
        try {
            const entries = await fs.readdir(folderPath, { withFileTypes: true });
            
            let files = await Promise.all(entries.map(async (entry) => {
                const fullPath = path.join(folderPath, entry.name);
                let stats = { size: 0, mtime: new Date() };
                try {
                    stats = await fs.stat(fullPath);
                } catch (e) {}

                return {
                    id: fullPath,
                    name: entry.name,
                    isFolder: entry.isDirectory(),
                    size: stats.size,
                    updatedAt: stats.mtime,
                    mimeType: this._getMimeType(entry.name, entry.isDirectory())
                };
            }));

            // Filter
            if (search) {
                const lowerSearch = search.toLowerCase();
                files = files.filter(f => f.name.toLowerCase().includes(lowerSearch));
            }

            if (filterBy !== 'all') {
                files = files.filter(f => {
                    if (filterBy === 'folders') return f.isFolder;
                    if (filterBy === 'files') return !f.isFolder;
                    if (filterBy === 'images') return f.mimeType.startsWith('image/');
                    if (filterBy === 'media') return f.mimeType.startsWith('video/') || f.mimeType.startsWith('audio/');
                    return true;
                });
            }

            // Sort
            files.sort((a, b) => {
                // Always folders first
                if (a.isFolder && !b.isFolder) return -1;
                if (!a.isFolder && b.isFolder) return 1;

                switch (sortBy) {
                    case 'za': return b.name.localeCompare(a.name);
                    case 'newest': return b.updatedAt - a.updatedAt;
                    case 'oldest': return a.updatedAt - b.updatedAt;
                    case 'size': return b.size - a.size;
                    default: return a.name.localeCompare(b.name);
                }
            });

            return files;
        } catch (error) {
            console.error('[LocalFileManager] Error listing content:', error);
            return [];
        }
    }

    _getMimeType(filename, isFolder) {
        if (isFolder) return 'inode/directory';
        const ext = path.extname(filename).toLowerCase();
        const mimes = {
            '.pdf': 'application/pdf',
            '.jpg': 'image/jpeg',
            '.jpeg': 'image/jpeg',
            '.png': 'image/png',
            '.mp4': 'video/mp4',
            '.mp3': 'audio/mpeg',
            '.txt': 'text/plain',
            '.zip': 'application/zip'
        };
        return mimes[ext] || 'application/octet-stream';
    }
}

module.exports = new LocalFileManager();
