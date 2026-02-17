const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  startSync: (folderPath) => ipcRenderer.invoke('start-sync', folderPath),
  onFileAdded: (callback) => ipcRenderer.on('file-added', (_event, value) => callback(value)),
  onFileChanged: (callback) => ipcRenderer.on('file-changed', (_event, value) => callback(value)),
  onFileRemoved: (callback) => ipcRenderer.on('file-removed', (_event, value) => callback(value)),
  onDirAdded: (callback) => ipcRenderer.on('dir-added', (_event, value) => callback(value)),
  onDirRemoved: (callback) => ipcRenderer.on('dir-removed', (_event, value) => callback(value)),
  onError: (callback) => ipcRenderer.on('sync-error', (_event, value) => callback(value)),
  listContent: (path) => ipcRenderer.invoke('list-path-content', path),
  createFolder: (path) => ipcRenderer.invoke('create-folder', path),
  selectFolder: () => ipcRenderer.invoke('select-folder'),
  onNetworkStats: (callback) => ipcRenderer.on('network-stats', (_event, value) => callback(value)),
  onDiskStats: (callback) => ipcRenderer.on('disk-stats', (_event, value) => callback(value)),
  downloadFile: (url, targetPath) => ipcRenderer.invoke('download-file', { url, targetPath }),
  onDownloadProgress: (callback) => ipcRenderer.on('download-progress', (_event, value) => callback(value))
});
