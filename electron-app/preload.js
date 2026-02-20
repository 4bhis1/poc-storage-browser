const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  startSync: (folderPath) => ipcRenderer.invoke('start-sync', folderPath),
  
  onFileAdded: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('file-added', subscription);
    return () => ipcRenderer.removeListener('file-added', subscription);
  },
  onFileChanged: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('file-changed', subscription);
    return () => ipcRenderer.removeListener('file-changed', subscription);
  },
  onFileRemoved: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('file-removed', subscription);
    return () => ipcRenderer.removeListener('file-removed', subscription);
  },
  onDirAdded: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('dir-added', subscription);
    return () => ipcRenderer.removeListener('dir-added', subscription);
  },
  onDirRemoved: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('dir-removed', subscription);
    return () => ipcRenderer.removeListener('dir-removed', subscription);
  },
  onError: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('sync-error', subscription);
    return () => ipcRenderer.removeListener('sync-error', subscription);
  },

  listContent: (path) => ipcRenderer.invoke('list-path-content', path),
  createFolder: (path) => ipcRenderer.invoke('create-folder', path),
  
  onNetworkStats: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('network-stats', subscription);
    return () => ipcRenderer.removeListener('network-stats', subscription);
  },
  onDiskStats: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('disk-stats', subscription);
    return () => ipcRenderer.removeListener('disk-stats', subscription);
  },

  downloadFile: (url, targetPath) => ipcRenderer.invoke('download-file', { url, targetPath }),
  onDownloadProgress: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('download-progress', subscription);
    return () => ipcRenderer.removeListener('download-progress', subscription);
  },
  
  handleFileDrop: (files, currentPath) => ipcRenderer.invoke('handle-file-drop', { files, currentPath }),
  
  syncS3: (folderPath) => ipcRenderer.invoke('sync-s3-to-local', folderPath),
  onSyncProgress: (callback) => {
    const subscription = (_event, value) => callback(value);
    ipcRenderer.on('sync-progress', subscription);
    return () => ipcRenderer.removeListener('sync-progress', subscription);
  },
  
  selectFileForUpload: () => ipcRenderer.invoke('select-file'),
  selectFolderForUpload: () => ipcRenderer.invoke('select-folder-upload'),
  uploadItems: (items, currentPath, shouldZip) => ipcRenderer.invoke('upload-items', { items, currentPath, shouldZip })
});
