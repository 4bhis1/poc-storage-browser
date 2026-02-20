const { S3Client, ListObjectsV2Command, GetObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');
const { Upload } = require('@aws-sdk/lib-storage');
const fs = require('fs');
const path = require('path');
const fsPromises = require('fs/promises');
const os = require('os');
require('dotenv').config();

class BackendManager {
    constructor() {
        this.s3Client = null;
        this.bucketName = process.env.AWS_BUCKET_NAME || 'my-bucket';
        this.region = process.env.AWS_REGION || 'us-east-1';
        this.isSyncing = false; // Guard against sync loops

        this.initS3();
    }

    initS3() {
        if (process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY) {
            const credentials = {
                accessKeyId: process.env.AWS_ACCESS_KEY_ID,
                secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
            };
            if (process.env.AWS_SESSION_TOKEN) {
                credentials.sessionToken = process.env.AWS_SESSION_TOKEN;
            }
            this.s3Client = new S3Client({ region: this.region, credentials });
            console.log('S3 Client Initialized with region:', this.region);
        } else {
            console.warn('AWS Credentials not found. S3 Sync will be skipped.');
        }
    }

    async uploadFileToS3(filePath, s3Key) {
        if (!this.s3Client) return;
        try {
            const fileStream = fs.createReadStream(filePath);
            const upload = new Upload({
                client: this.s3Client,
                params: { Bucket: this.bucketName, Key: s3Key, Body: fileStream }
            });
            await upload.done();
            console.log(`[S3] Uploaded: s3://${this.bucketName}/${s3Key}`);
            return true;
        } catch (error) {
            console.error('S3 Upload Error:', error);
            throw error;
        }
    }

    /**
     * Called by chokidar watcher when a file is added locally.
     * Skipped during sync to prevent loops.
     */
    async onLocalFileAdded(filePath, localRootPath) {
        if (this.isSyncing) {
            console.log(`[Watcher] Skipping auto-upload during sync: ${filePath}`);
            return;
        }
        if (!this.s3Client) return;

        const relativePath = path.relative(localRootPath, filePath).split(path.sep).join('/');
        console.log(`[Watcher] Auto-uploading new file: ${relativePath}`);
        try {
            await this.uploadFileToS3(filePath, relativePath);
        } catch (err) {
            console.error(`[Watcher] Auto-upload failed for ${relativePath}:`, err.message);
        }
    }

    async getRecursiveFiles(dir, rootDir = dir, excludeDirs = []) {
        let results = [];
        try {
            const list = await fsPromises.readdir(dir, { withFileTypes: true });
            for (const entry of list) {
                const fullPath = path.join(dir, entry.name);
                const relativePath = path.relative(rootDir, fullPath).split(path.sep).join('/');

                if (entry.isDirectory()) {
                    // Skip excluded directories (prevents self-copy loops)
                    if (excludeDirs.some(ex => fullPath.startsWith(ex))) continue;
                    const subRes = await this.getRecursiveFiles(fullPath, rootDir, excludeDirs);
                    results = results.concat(subRes);
                } else {
                    results.push({ fullPath, relativePath });
                }
            }
        } catch (err) {
            console.error(`[getRecursiveFiles] Error reading ${dir}:`, err.message);
        }
        return results;
    }

    async syncFromS3(localRootPath, onProgress) {
        if (!this.s3Client) return { success: false, message: 'S3 Client not initialized' };
        if (this.isSyncing) return { success: false, message: 'Sync already in progress' };

        this.isSyncing = true;
        try {
            console.log(`[Sync] Starting Bidirectional Sync: ${this.bucketName} <-> ${localRootPath}`);
            if (onProgress) onProgress({ type: 'info', message: 'Fetching S3 bucket list...' });

            const { Contents } = await this.s3Client.send(new ListObjectsV2Command({ Bucket: this.bucketName }));
            const s3Items = (Contents || []).filter(item => {
                // Filter out any nested FMS/FMS/... garbage keys from S3
                const parts = item.Key.split('/');
                // Skip keys that look like infinite recursion artifacts
                const uniqueParts = new Set(parts.filter(p => p));
                if (uniqueParts.size === 1 && parts.length > 3) return false;
                return true;
            });
            const s3Keys = new Set(s3Items.map(item => item.Key));

            let downloadCount = 0;
            let uploadCount = 0;
            const { pipeline } = require('stream/promises');

            // --- Phase 1: Download (S3 → Local) ---
            if (onProgress) onProgress({ type: 'info', message: `Found ${s3Items.length} files in S3. Checking local...` });

            for (const item of s3Items) {
                const localFilePath = path.join(localRootPath, item.Key);
                const localDir = path.dirname(localFilePath);
                await fsPromises.mkdir(localDir, { recursive: true });

                try {
                    await fsPromises.access(localFilePath);
                    continue; // Already exists locally
                } catch {
                    // Missing locally — download it
                }

                console.log(`[Sync-Down] ${item.Key}`);
                if (onProgress) onProgress({ type: 'download', filename: item.Key, status: 'active' });

                const data = await this.s3Client.send(new GetObjectCommand({ Bucket: this.bucketName, Key: item.Key }));
                await pipeline(data.Body, fs.createWriteStream(localFilePath));

                if (onProgress) onProgress({ type: 'download', filename: item.Key, status: 'done' });
                downloadCount++;
            }

            // --- Phase 2: Upload (Local → S3) ---
            if (onProgress) onProgress({ type: 'info', message: 'Scanning local files for upload...' });
            const localFiles = await this.getRecursiveFiles(localRootPath);

            for (const file of localFiles) {
                if (!s3Keys.has(file.relativePath)) {
                    console.log(`[Sync-Up] ${file.relativePath}`);
                    if (onProgress) onProgress({ type: 'upload', filename: file.relativePath, status: 'active' });

                    await this.uploadFileToS3(file.fullPath, file.relativePath);

                    if (onProgress) onProgress({ type: 'upload', filename: file.relativePath, status: 'done' });
                    uploadCount++;
                }
            }

            const summary = `Sync done. ↓ ${downloadCount} downloaded, ↑ ${uploadCount} uploaded.`;
            console.log(`[Sync] ${summary}`);
            // Signal completion — active: false stops the spinner
            if (onProgress) onProgress({ type: 'complete', message: summary, downloadCount, uploadCount });
            return { success: true, message: summary, downloadCount, uploadCount };

        } catch (error) {
            console.error('[Sync] Error:', error);
            if (onProgress) onProgress({ type: 'error', message: error.message });
            return { success: false, message: error.message };
        } finally {
            this.isSyncing = false;
        }
    }

    /**
     * Zip a folder into a temp directory first, then move to destination.
     * This prevents the watcher from picking up an incomplete zip.
     */
    async zipFolderToTemp(folderPath, destDir, zipName) {
        const archiver = require('archiver');
        const tempDir = path.join(os.tmpdir(), '_fms_temp');
        await fsPromises.mkdir(tempDir, { recursive: true });

        const tempZipPath = path.join(tempDir, zipName);
        const finalZipPath = path.join(destDir, zipName);

        console.log(`[Zip] Creating zip in temp: ${tempZipPath}`);
        const output = fs.createWriteStream(tempZipPath);
        const archive = archiver('zip', { zlib: { level: 6 } });

        await new Promise((resolve, reject) => {
            output.on('close', resolve);
            archive.on('error', reject);
            archive.pipe(output);
            archive.directory(folderPath, false);
            archive.finalize();
        });

        console.log(`[Zip] Moving zip to destination: ${finalZipPath}`);
        await fsPromises.rename(tempZipPath, finalZipPath);
        return finalZipPath;
    }

    async uploadItems(items, currentDirectory, shouldZip) {
        const results = [];
        for (const itemPath of items) {
            if (!itemPath) {
                results.push({ success: false, error: 'Invalid path (undefined)' });
                continue;
            }
            try {
                const stat = await fsPromises.stat(itemPath);
                const itemName = path.basename(itemPath);
                const destinationPath = path.join(currentDirectory, itemName);

                // Safety check: prevent copying a folder into itself
                const normalizedSrc = path.resolve(itemPath);
                const normalizedDest = path.resolve(destinationPath);
                if (normalizedDest.startsWith(normalizedSrc)) {
                    console.warn(`[Upload] Skipping self-copy: ${itemPath} -> ${destinationPath}`);
                    results.push({ success: false, path: itemPath, error: 'Cannot copy folder into itself' });
                    continue;
                }

                if (stat.isDirectory()) {
                    if (shouldZip) {
                        const zipName = `${itemName}.zip`;
                        // Zip to temp first, then move — watcher will auto-upload when it lands
                        const finalZipPath = await this.zipFolderToTemp(itemPath, currentDirectory, zipName);
                        console.log(`[Upload] Zip ready at: ${finalZipPath}`);
                        results.push({ success: true, path: finalZipPath });
                    } else {
                        await fsPromises.mkdir(destinationPath, { recursive: true });
                        await this.recursiveCopy(itemPath, destinationPath);
                        results.push({ success: true, path: destinationPath });
                    }
                } else {
                    // File: copy to destination — watcher will auto-upload
                    await fsPromises.copyFile(itemPath, destinationPath);
                    results.push({ success: true, path: destinationPath });
                }
            } catch (error) {
                console.error(`[Upload] Error for ${itemPath}:`, error.message);
                results.push({ success: false, path: itemPath, error: error.message });
            }
        }
        return results;
    }

    async recursiveCopy(sourceDir, targetDir) {
        // Safety: never copy into self
        const normalizedSrc = path.resolve(sourceDir);
        const normalizedDest = path.resolve(targetDir);
        if (normalizedDest.startsWith(normalizedSrc)) {
            throw new Error(`Cannot copy directory into itself: ${sourceDir} -> ${targetDir}`);
        }

        const entries = await fsPromises.readdir(sourceDir, { withFileTypes: true });
        for (const entry of entries) {
            const src = path.join(sourceDir, entry.name);
            const dest = path.join(targetDir, entry.name);
            if (entry.isDirectory()) {
                await fsPromises.mkdir(dest, { recursive: true });
                await this.recursiveCopy(src, dest);
            } else {
                await fsPromises.copyFile(src, dest);
            }
        }
    }

    async handleFileDrop(droppedPaths, currentDirectory) {
        return this.uploadItems(droppedPaths, currentDirectory, false);
    }
}

module.exports = new BackendManager();
