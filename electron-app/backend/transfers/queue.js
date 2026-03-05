const uploadManager = require('./upload');

class UploadQueue {
    constructor() {
        this.queue = [];
        this.isProcessing = false;
        // Keep track of what's currently being uploaded or in queue to prevent duplicates
        this.pendingKeys = new Set(); 
    }

    addUploadTask(bucketId, filePath, s3Key, mimeType = null, configId = null, syncJobId = null) {
        const uniqueKey = `${bucketId}-${s3Key}`;
        if (this.pendingKeys.has(uniqueKey)) {
            console.log(`[UploadQueue] Skipped duplicate upload task for: ${s3Key}`);
            return;
        }

        this.pendingKeys.add(uniqueKey);
        this.queue.push({
            bucketId, filePath, s3Key, mimeType, configId, syncJobId, uniqueKey
        });

        this.processQueue();
    }

    async processQueue() {
        if (this.isProcessing || this.queue.length === 0) return;
        this.isProcessing = true;

        while (this.queue.length > 0) {
            const task = this.queue.shift();
            try {
                console.log(`[UploadQueue] Processing: ${task.s3Key} (${this.queue.length} left in queue)`);
                await uploadManager.uploadWithBucketId(
                    task.bucketId, task.filePath, task.s3Key, task.mimeType, task.configId, task.syncJobId
                );
            } catch (error) {
                console.error(`[UploadQueue] Upload failed for ${task.s3Key}:`, error.message);
            } finally {
                this.pendingKeys.delete(task.uniqueKey);
            }
        }

        this.isProcessing = false;
    }
}

module.exports = new UploadQueue();
