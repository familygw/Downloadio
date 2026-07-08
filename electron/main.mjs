import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { app, BrowserWindow, dialog, ipcMain, net, protocol, shell } from 'electron';
import { createDownloadManager } from './download-manager.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const downloadManager = createDownloadManager({ app, BrowserWindow });

const APP_SCHEME = 'app';
const rendererRoot = path.join(__dirname, '..', 'dist', 'downloadio', 'browser');

// Serving the built renderer over a custom, non-opaque scheme (instead of
// file://) is required so the Angular build's `<script type="module">`
// bundle can actually load: Chromium blocks module script fetches on the
// opaque file:// origin, which produces a silent blank window with no
// console errors.
protocol.registerSchemesAsPrivileged([
  {
    scheme: APP_SCHEME,
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true
    }
  }
]);

function registerAppProtocol() {
  protocol.handle(APP_SCHEME, (request) => {
    const requestUrl = new URL(request.url);
    let relativePath = decodeURIComponent(requestUrl.pathname);

    if (relativePath === '' || relativePath === '/') {
      relativePath = '/index.html';
    }

    const filePath = path.normalize(path.join(rendererRoot, relativePath));

    if (!filePath.startsWith(rendererRoot)) {
      return new Response('Forbidden', { status: 403 });
    }

    return net.fetch(pathToFileURL(filePath).toString());
  });
}

function getRendererEntry() {
  const devUrl = process.env.DOWNLOADIO_RENDERER_URL;

  if (devUrl) {
    return { type: 'url', value: devUrl };
  }

  return {
    type: 'url',
    value: `${APP_SCHEME}://index.html`
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

  void mainWindow.loadURL(entry.value);

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

ipcMain.handle('shell:get-downloads-path', () => app.getPath('downloads'));

ipcMain.handle('shell:reveal-item', async (_event, filePath) => {
  shell.showItemInFolder(filePath);
});

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

ipcMain.handle('downloads:pause', async (_event, downloadId) => {
  downloadManager.pauseDownload(downloadId);
});

ipcMain.handle('downloads:cancel', async (_event, downloadId) => {
  downloadManager.cancelDownload(downloadId);
});

ipcMain.handle('downloads:delete', async (_event, input) => {
  await downloadManager.deleteDownload(input);
});

app.whenReady().then(() => {
  registerAppProtocol();
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
