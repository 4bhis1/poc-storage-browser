const localManager = require('./local');
const uploadManager = require('./transfers/upload');
const downloadManager = require('./transfers/download');
const statusManager = require('./transfers/status');
const database = require('./database');
const syncManager = require('./sync');
const deleteManager = require('./transfers/delete');
const path = require('path');
const fs = require('fs/promises');
const fsSync = require('fs');
const os = require('os');
const archiver = require('archiver');

class BackendCentral {
    constructor() {
        this.local = localManager;
        this.upload = uploadManager;
        this.download = downloadManager;
        this.status = statusManager;
        this.db = database;
        this.sync = syncManager;
        this.auth = require('./auth');
        this.delete = deleteManager;
    }

    /**
     * Watcher Handlers
     */
    async onLocalFileAdded(filePath, rootPath) {
        try {
            const stat = await fsSync.statSync(filePath);
            if (stat.isDirectory()) {
                console.log(`[Watcher] New directory ignored (S3 uses prefixes): ${filePath}`);
                return;
            }

            const { bucketId, s3Key, configId } = await this._parsePath(filePath, rootPath);
            if (!bucketId || !s3Key) {
                console.log(`[Watcher] Skipped ${filePath} (Not in a valid bucket folder)`);
                return;
            }

            console.log(`[Watcher] Auto-uploading to S3: bucket=${bucketId}, key=${s3Key}, configId=${configId}`);
            await this.upload.uploadWithBucketId(bucketId, filePath, s3Key, null, configId);
        } catch (err) {
            console.error('[Watcher] Auto-upload failed:', err.message);
        }
    }

    async onLocalFileRemoved(filePath, rootPath) {
        console.log(`[Watcher] File removal detected: ${filePath}`);
        try {
            const { bucketId, s3Key } = await this._parsePath(filePath, rootPath);
            if (!bucketId || !s3Key) return;
            console.log(`[Watcher] Auto-deleting from S3: key=${s3Key}`);
            await this.delete.deleteFromS3(bucketId, s3Key);
        } catch (err) {
            console.error('[Watcher] Auto-delete failed:', err.message);
        }
    }

    async onLocalDirRemoved(dirPath, rootPath) {
        try {
            const { bucketId, s3Key } = await this._parsePath(dirPath, rootPath);
            if (!bucketId || !s3Key) return;
            console.log(`[Backend] Auto-deleting folder: ${s3Key}`);
            await this.delete.deleteFolderFromS3(bucketId, s3Key);
        } catch (err) {
            console.error('[Backend] Auto-folder-delete failed:', err.message);
        }
    }

    async _parsePath(localPath, rootPath) {
        // 1. Check custom sync mappings
        const mappingRes = await this.db.query('SELECT "localPath", "bucketId", "configId" FROM "SyncMapping"');
        for (const mapping of mappingRes.rows) {
            if (localPath.startsWith(mapping.localPath)) {
                const relative = path.relative(mapping.localPath, localPath);
                if (relative && !relative.startsWith('..') && !path.isAbsolute(relative)) {
                    const s3Key = relative.split(path.sep).join('/');
                    return { bucketId: mapping.bucketId, s3Key, configId: mapping.configId };
                }
            }
        }

        // 2. Fallback to ROOT_PATH
        const relative = path.relative(rootPath, localPath);
        if (!relative.startsWith('..')) {
            const parts = relative.split(path.sep);
            if (parts.length >= 1) {
                const bucketName = parts[0];
                const s3Key = parts.slice(1).join('/');
                const dbRes = await this.db.query('SELECT id FROM "Bucket" WHERE name = $1', [bucketName]);
                if (dbRes.rows.length > 0) {
                    return { bucketId: dbRes.rows[0].id, s3Key, configId: null };
                }
            }
        }
        
        return { bucketId: null };
    }

    /**
     * Specialized Zip + Upload logic requested by user.
     */
    async uploadItems(items, destDir, shouldZip) {
        const results = [];

        // Collect all folder items to decide zip behaviour
        const folders = items.filter(p => {
            try { return fsSync.statSync(p).isDirectory(); } catch { return false; }
        });
        const files = items.filter(p => {
            try { return fsSync.statSync(p).isFile(); } catch { return false; }
        });

        // If shouldZip AND there are folders, zip each folder individually
        if (shouldZip && folders.length > 0) {
            for (const folderPath of folders) {
                try {
                    const folderName = path.basename(folderPath);
                    const zipName = `${folderName}.zip`;
                    const zipPath = await this._zipFolder(folderPath, destDir, zipName);
                    results.push({ success: true, path: zipPath });
                } catch (err) {
                    console.error(`[Backend] Zip failed for ${folderPath}:`, err);
                    results.push({ success: false, path: folderPath, error: err.message });
                }
            }
            // Plain files always copied normally (no zip for individual files)
            for (const filePath of files) {
                try {
                    const stat = await fs.stat(filePath);
                    const finalDest = path.join(destDir, path.basename(filePath));
                    await this._copyFileWithProgress(filePath, finalDest, stat.size, path.basename(filePath));
                    results.push({ success: true, path: finalDest });
                } catch (err) {
                    results.push({ success: false, path: filePath, error: err.message });
                }
            }
            return results;
        }

        // No zip: copy everything as-is
        for (const itemPath of items) {
            try {
                const stat = await fs.stat(itemPath);
                const itemName = path.basename(itemPath);
                const finalDest = path.join(destDir, itemName);

                if (stat.isDirectory()) {
                    await fs.mkdir(finalDest, { recursive: true });
                    await this._recursiveCopy(itemPath, finalDest);
                    results.push({ success: true, path: finalDest });
                } else {
                    await this._copyFileWithProgress(itemPath, finalDest, stat.size, itemName);
                    results.push({ success: true, path: finalDest });
                }
            } catch (err) {
                console.error(`[Backend] Upload failed for ${itemPath}:`, err);
                results.push({ success: false, path: itemPath, error: err.message });
            }
        }
        return results;
    }

    async _zipFolder(src, dest, zipName) {
        // Write to temp directory first, then move atomically to FMS folder.
        // This prevents chokidar from seeing a partial zip file.
        const tempZip = path.join(os.tmpdir(), `fms_${Date.now()}_${zipName}`);
        const finalZip = path.join(dest, zipName);
        const folderName = path.basename(src); // preserve folder name inside zip
        const transferId = `zip-${Date.now()}-${zipName}`;

        this.status.startTransfer(transferId, zipName, 'zip');

        const output = fsSync.createWriteStream(tempZip);
        const archive = archiver('zip', { zlib: { level: 6 } });

        // Track size for progress
        let totalBytes = 0;
        let processedBytes = 0;
        try {
            totalBytes = await this._dirSize(src);
        } catch { totalBytes = 0; }

        archive.on('data', (chunk) => {
            // archiver doesn't expose input bytes easily; use entry events
        });
        archive.on('entry', (entry) => {
            processedBytes += entry.stats?.size || 0;
            if (totalBytes > 0) {
                const pct = Math.min(99, (processedBytes / totalBytes) * 100);
                this.status.updateProgress(transferId, pct);
            }
        });

        await new Promise((resolve, reject) => {
            output.on('close', resolve);
            archive.on('error', reject);
            archive.pipe(output);
            // ✅ FIX: use folderName as the prefix so zip contains "myFolder/file.txt"
            //    not just "file.txt" at the root level
            archive.directory(src, folderName);
            archive.finalize();
        });

        // Move from tmp → FMS folder (atomic rename — watcher fires only once on final path)
        await fs.rename(tempZip, finalZip);
        this.status.completeTransfer(transferId, 'done');
        console.log(`[Backend] Zipped folder "${folderName}" → ${zipName} (${(fsSync.statSync(finalZip).size / 1024).toFixed(1)} KB)`);
        return finalZip;
    }

    /** Sum all file sizes under a directory recursively */
    async _dirSize(dirPath) {
        let total = 0;
        const entries = await fs.readdir(dirPath, { withFileTypes: true });
        for (const e of entries) {
            const full = path.join(dirPath, e.name);
            if (e.isDirectory()) {
                total += await this._dirSize(full);
            } else {
                const s = await fs.stat(full);
                total += s.size;
            }
        }
        return total;
    }

    async _copyFileWithProgress(src, dest, size, name) {
        const transferId = `copy-${Date.now()}-${name}`;
        this.status.startTransfer(transferId, name, 'copy', size);
        
        const srcStream = fsSync.createReadStream(src);
        const destStream = fsSync.createWriteStream(dest);
        let copied = 0;

        srcStream.on('data', (chunk) => {
            copied += chunk.length;
            this.status.updateProgress(transferId, (copied / size) * 100, copied);
        });

        await new Promise((resolve, reject) => {
            destStream.on('finish', resolve);
            destStream.on('error', reject);
            srcStream.on('error', reject);
            srcStream.pipe(destStream);
        });

        this.status.completeTransfer(transferId, 'done');
    }

    async _recursiveCopy(src, dest) {
        const entries = await fs.readdir(src, { withFileTypes: true });
        for (const entry of entries) {
            const s = path.join(src, entry.name);
            const d = path.join(dest, entry.name);
            if (entry.isDirectory()) {
                await fs.mkdir(d, { recursive: true });
                await this._recursiveCopy(s, d);
            } else {
                await fs.copyFile(s, d);
            }
        }
    }
}

module.exports = new BackendCentral();
