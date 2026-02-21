const { ipcMain } = require('electron');

class TransferStatusManager {
    constructor() {
        this.transfers = new Map();
        this.mainWindow = null;
        this.pendingTimeout = null;
    }

    init(mainWindow) {
        this.mainWindow = mainWindow;
        console.log(`[TransferStatusManager] Initialized with window ID: ${mainWindow?.id}`);
    }

    startTransfer(id, name, type, size = 0) {
        console.log(`[TransferStatusManager] Starting ${type}: ${name} (${id}) - Size: ${size}`);
        const transfer = {
            id,
            name,
            type, // 'upload', 'download', 'zip', 'copy'
            size,
            progress: 0,
            loaded: 0,
            status: 'active',
            startTime: Date.now(),
            lastUpdate: Date.now(),
            speed: 0
        };
        this.transfers.set(id, transfer);
        this.notify(true); // Immediate update for start
        return id;
    }

    updateProgress(id, progress, loaded = null) {
        const transfer = this.transfers.get(id);
        if (transfer) {
            const now = Date.now();
            const timeDiff = (now - transfer.lastUpdate) / 1000; // seconds
            
            if (loaded !== null && timeDiff > 0) {
                const bytesDiff = loaded - transfer.loaded;
                transfer.speed = bytesDiff / timeDiff; // bytes per second
                transfer.loaded = loaded;
            }
            
            transfer.progress = progress;
            transfer.lastUpdate = now;
            this.notify();
        }
    }

    completeTransfer(id, status = 'done') {
        const transfer = this.transfers.get(id);
        if (transfer) {
            console.log(`[TransferStatusManager] Completed ${id} with status: ${status}`);
            transfer.status = status;
            transfer.progress = 100;
            transfer.speed = 0;
            this.notify(true); // Immediate update for completion
            
            // Remove after some time
            setTimeout(() => {
                if (this.transfers.has(id)) {
                    this.transfers.delete(id);
                    this.notify();
                }
            }, 5000);
        }
    }

    getTransfers() {
        return Array.from(this.transfers.values());
    }

    notify(immediate = false) {
        if (immediate) {
            if (this.pendingTimeout) {
                clearTimeout(this.pendingTimeout);
                this.pendingTimeout = null;
            }
            this._sendUpdate();
            return;
        }

        if (this.pendingTimeout) return;
        
        this.pendingTimeout = setTimeout(() => {
            this.pendingTimeout = null;
            this._sendUpdate();
        }, 50); // 50ms throttle for smoothness
    }

    _sendUpdate() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            const transferList = this.getTransfers();
            this.mainWindow.webContents.send('transfer-status-update', transferList);
        }
    }
}

module.exports = new TransferStatusManager();
