const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const path = require('path');
const https = require('https');
const { pipeline } = require('stream/promises');
const statusManager = require('./status');

class DownloadManager {
    /**
     * Download from S3 (Sync)
     */
    async downloadFromS3(s3Client, bucketName, s3Key, localPath, totalSize = 0) {
        const fileName = path.basename(s3Key);
        const transferId = `dl-${Date.now()}-${fileName}`;
        
        statusManager.startTransfer(transferId, fileName, 'download', totalSize);

        try {
            const data = await s3Client.send(new GetObjectCommand({ Bucket: bucketName, Key: s3Key }));
            let downloaded = 0;
            
            const progressPassThrough = new (require('stream').PassThrough)();
            progressPassThrough.on('data', (chunk) => {
                downloaded += chunk.length;
                if (totalSize > 0) {
                    const progress = (downloaded / totalSize) * 100;
                    statusManager.updateProgress(transferId, progress, downloaded);
                }
            });

            await pipeline(
                data.Body,
                progressPassThrough,
                fs.createWriteStream(localPath)
            );
            
            statusManager.completeTransfer(transferId, 'done');
            return true;
        } catch (error) {
            console.error('[DownloadManager] S3 Error:', error);
            statusManager.completeTransfer(transferId, 'error');
            throw error;
        }
    }

    /**
     * Download from HTTP URL
     */
    async downloadFromUrl(url, targetDir) {
        const fileName = path.basename(url);
        const destination = path.join(targetDir, fileName);
        const transferId = `dl-${Date.now()}-${fileName}`;

        return new Promise((resolve, reject) => {
            const file = fs.createWriteStream(destination);
            https.get(url, (response) => {
                if (response.statusCode !== 200) {
                    file.close();
                    fs.unlink(destination, () => {}); 
                    reject(`Server responded with ${response.statusCode}`);
                    return;
                }

                const totalBytes = parseInt(response.headers['content-length'], 10) || 0;
                statusManager.startTransfer(transferId, fileName, 'download', totalBytes);
                let receivedBytes = 0;

                response.on('data', (chunk) => {
                    receivedBytes += chunk.length;
                    if (totalBytes > 0) {
                        const progress = (receivedBytes / totalBytes) * 100;
                        statusManager.updateProgress(transferId, progress, receivedBytes);
                    }
                });

                response.pipe(file);

                file.on('finish', () => {
                    file.close(() => {
                        statusManager.completeTransfer(transferId, 'done');
                        resolve({ success: true, path: destination });
                    });
                });

                file.on('error', (err) => {
                    fs.unlink(destination, () => {}); 
                    statusManager.completeTransfer(transferId, 'error');
                    reject(err.message);
                });
            }).on('error', (err) => {
                fs.unlink(destination, () => {}); 
                statusManager.completeTransfer(transferId, 'error');
                reject(err.message);
            });
        });
    }
}

module.exports = new DownloadManager();
