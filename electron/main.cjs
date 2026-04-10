const path = require('node:path');

const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron');
const { createDownloadManager } = require('./download-manager.cjs');

const downloadManager = createDownloadManager({ app, BrowserWindow });

function getRendererEntry() {
  const devUrl = process.env.DOWNLOADIO_RENDERER_URL;

  if (devUrl) {
    return { type: 'url', value: devUrl };
  }

  return {
    type: 'file',
    value: path.join(__dirname, '..', 'dist', 'downloadio', 'browser', 'index.html')
  };
}

function createMainWindow() {
  const mainWindow = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1180,
    minHeight: 720,
    show: false,
    backgroundColor: '#eef2f4',
    title: 'Downloadio',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    ...(process.platform === 'darwin' ? { trafficLightPosition: { x: 16, y: 18 } } : {}),
    titleBarOverlay: process.platform !== 'darwin',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const entry = getRendererEntry();

  if (entry.type === 'url') {
    void mainWindow.loadURL(entry.value);
  } else {
    void mainWindow.loadFile(entry.value);
  }

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  return mainWindow;
}

app.setName('Downloadio');

ipcMain.handle('shell:get-app-info', () => ({
  name: app.getName(),
  version: app.getVersion(),
  platform: process.platform,
  runtime: 'electron'
}));

ipcMain.handle('shell:pick-directory', async () => {
  const result = await dialog.showOpenDialog({
    properties: ['openDirectory', 'createDirectory']
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  return result.filePaths[0];
});

ipcMain.handle('downloads:start', async (_event, input) => {
  downloadManager.startDownload(input);
});

ipcMain.handle('downloads:cancel', async (_event, downloadId) => {
  downloadManager.cancelDownload(downloadId);
});

app.whenReady().then(() => {
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
