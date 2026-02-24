const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // 1. File Browser & Management
  listContent: (args) => {
    if (typeof args === 'string') {
        return ipcRenderer.invoke('list-path-content', { folderPath: args });
    }
    return ipcRenderer.invoke('list-path-content', args);
  },
  createFolder: (path) => ipcRenderer.invoke('create-folder', path),
  openFile: (path) => ipcRenderer.invoke('open-file', path),
  
  // 2. Transfers
  selectFileForUpload: () => ipcRenderer.invoke('select-file'),
  selectFolderForUpload: () => ipcRenderer.invoke('select-folder-upload'),
  uploadItems: (items, currentPath, shouldZip) => ipcRenderer.invoke('upload-items', { items, currentPath, shouldZip }),
  downloadFile: (url, targetPath) => ipcRenderer.invoke('download-file', { url, targetPath }),

  // 2b. Get the real filesystem path from a File object (Electron 32+ replacement for File.prototype.path)
  getFilePath: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch (e) {
      console.error('[Preload] getFilePath error:', e.message);
      return null;
    }
  },
  
  // 3. Status Tracking
  getActiveTransfers: () => ipcRenderer.invoke('get-active-transfers'),
  onTransferStatusUpdate: (callback) => {
    const sub = (_, val) => callback(val);
    ipcRenderer.on('transfer-status-update', sub);
    return () => ipcRenderer.removeListener('transfer-status-update', sub);
  },

  // 4. Monitoring (Network/Disk)
  onNetworkStats: (callback) => {
    const sub = (_, val) => callback(val);
    ipcRenderer.on('network-stats', sub);
    return () => ipcRenderer.removeListener('network-stats', sub);
  },
  onDiskStats: (callback) => {
    const sub = (_, val) => callback(val);
    ipcRenderer.on('disk-stats', sub);
    return () => ipcRenderer.removeListener('disk-stats', sub);
  },

  // 5. Sync Engine
  initSync: (token) => ipcRenderer.invoke('init-sync', token),
  stopSync: () => ipcRenderer.invoke('stop-sync'),
  forceSync: () => ipcRenderer.invoke('force-sync'),
  onAuthExpired: (callback) => {
    const sub = () => callback();
    ipcRenderer.on('auth-expired', sub);
    return () => ipcRenderer.removeListener('auth-expired', sub);
  },

  // 6. DB Helpers
  dbQuery: (sql, params) => ipcRenderer.invoke('db-query', { sql, params }),
  searchFiles: (query) => ipcRenderer.invoke('search-files', { query }),
  getSyncConfigs: () => ipcRenderer.invoke('get-sync-configs'),
  createSyncConfig: (config) => ipcRenderer.invoke('create-sync-config', config),
  deleteSyncConfig: (id) => ipcRenderer.invoke('delete-sync-config', id),
  getLocalSyncActivities: (configId) => ipcRenderer.invoke('get-local-sync-activities', configId),
  getSyncJobs: (configId) => ipcRenderer.invoke('get-sync-jobs', configId),
  selectSyncFolder: () => ipcRenderer.invoke('select-sync-folder'),

  // 7. Watcher Events
  onFileChange: (event, callback) => {
    const sub = (_, val) => callback(val);
    ipcRenderer.on(`file-${event}`, sub);
    return () => ipcRenderer.removeListener(`file-${event}`, sub);
  }
});
