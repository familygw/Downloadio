const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('downloadio', {
  getAppInfo: () => ipcRenderer.invoke('shell:get-app-info'),
  getDownloadsPath: () => ipcRenderer.invoke('shell:get-downloads-path'),
  pickDirectory: () => ipcRenderer.invoke('shell:pick-directory'),
  startDownload: (input) => ipcRenderer.invoke('downloads:start', input),
  pauseDownload: (downloadId) => ipcRenderer.invoke('downloads:pause', downloadId),
  cancelDownload: (downloadId) => ipcRenderer.invoke('downloads:cancel', downloadId),
  deleteDownload: (input) => ipcRenderer.invoke('downloads:delete', input),
  revealItem: (filePath) => ipcRenderer.invoke('shell:reveal-item', filePath),
  onDownloadEvent: (listener) => {
    const handler = (_event, payload) => listener(payload);

    ipcRenderer.on('downloads:event', handler);

    return () => {
      ipcRenderer.removeListener('downloads:event', handler);
    };
  }
});
