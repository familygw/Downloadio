const { createWriteStream } = require('node:fs');
const { access, mkdir, rename, rm } = require('node:fs/promises');
const path = require('node:path');

const activeDownloads = new Map();

function createDownloadManager({ app, BrowserWindow }) {
  return {
    startDownload(input) {
      if (activeDownloads.has(input.id)) {
        return;
      }

      const controller = new AbortController();

      activeDownloads.set(input.id, {
        controller,
        partialPath: null
      });

      void runDownload({
        app,
        BrowserWindow,
        input,
        controller
      });
    },

    cancelDownload(downloadId) {
      activeDownloads.get(downloadId)?.controller.abort();
    }
  };
}

async function runDownload({ app, BrowserWindow, input, controller }) {
  let writeStream = null;

  try {
    const response = await fetch(input.sourceUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': `Downloadio/${app.getVersion()}`
      }
    });

    if (!response.ok || !response.body) {
      throw new Error(`Server responded with ${response.status} ${response.statusText}.`);
    }

    const totalBytes = parseContentLength(response.headers.get('content-length'));
    const fileName = resolveFileName({
      contentDisposition: response.headers.get('content-disposition'),
      responseUrl: response.url,
      suggestedFileName: input.suggestedFileName
    });
    const destinationDir = app.getPath('downloads');

    await mkdir(destinationDir, { recursive: true });

    const destinationPath = await createUniqueFilePath(destinationDir, fileName);
    const partialPath = `${destinationPath}.downloadio-part`;

    activeDownloads.set(input.id, {
      controller,
      partialPath
    });

    emitDownloadEvent(BrowserWindow, {
      type: 'started',
      id: input.id,
      fileName,
      sourceUrl: response.url,
      destinationPath,
      totalBytes
    });

    writeStream = createWriteStream(partialPath, { flags: 'w' });

    const reader = response.body.getReader();
    const startedAt = Date.now();
    let receivedBytes = 0;
    let lastProgressEmit = 0;

    while (true) {
      const { done, value } = await reader.read();

      if (done) {
        break;
      }

      const chunk = Buffer.from(value);

      await writeChunk(writeStream, chunk);

      receivedBytes += chunk.byteLength;

      const now = Date.now();

      if (now - lastProgressEmit >= 150 || receivedBytes === totalBytes) {
        const elapsedSeconds = Math.max((now - startedAt) / 1000, 0.001);

        emitDownloadEvent(BrowserWindow, {
          type: 'progress',
          id: input.id,
          receivedBytes,
          totalBytes,
          speedBytesPerSecond: receivedBytes / elapsedSeconds
        });

        lastProgressEmit = now;
      }
    }

    await closeWriteStream(writeStream);
    writeStream = null;

    await rename(partialPath, destinationPath);

    emitDownloadEvent(BrowserWindow, {
      type: 'completed',
      id: input.id,
      destinationPath,
      totalBytes: totalBytes ?? receivedBytes,
      receivedBytes
    });
  } catch (error) {
    if (writeStream) {
      writeStream.destroy();
    }

    const partialPath = activeDownloads.get(input.id)?.partialPath;

    if (partialPath) {
      await rm(partialPath, { force: true });
    }

    if (isAbortError(error)) {
      emitDownloadEvent(BrowserWindow, {
        type: 'cancelled',
        id: input.id
      });
    } else {
      emitDownloadEvent(BrowserWindow, {
        type: 'failed',
        id: input.id,
        message: getErrorMessage(error)
      });
    }
  } finally {
    activeDownloads.delete(input.id);
  }
}

function emitDownloadEvent(BrowserWindow, event) {
  for (const browserWindow of BrowserWindow.getAllWindows()) {
    browserWindow.webContents.send('downloads:event', event);
  }
}

async function createUniqueFilePath(directoryPath, fileName) {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  let candidatePath = path.join(directoryPath, fileName);
  let suffix = 1;

  while (await pathExists(candidatePath)) {
    candidatePath = path.join(
      directoryPath,
      `${baseName} (${suffix})${extension}`
    );
    suffix += 1;
  }

  return candidatePath;
}

async function pathExists(filePath) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function resolveFileName({ contentDisposition, responseUrl, suggestedFileName }) {
  const fromHeader = parseContentDispositionFileName(contentDisposition);

  if (fromHeader) {
    return sanitizeFileName(fromHeader);
  }

  const url = new URL(responseUrl);
  const pathSegments = url.pathname.split('/').filter(Boolean);
  const fromUrl = pathSegments.at(-1);

  if (fromUrl) {
    return sanitizeFileName(safeDecodeURIComponent(fromUrl));
  }

  return sanitizeFileName(suggestedFileName);
}

function parseContentDispositionFileName(contentDisposition) {
  if (!contentDisposition) {
    return null;
  }

  const encodedMatch = contentDisposition.match(/filename\*\s*=\s*UTF-8''([^;]+)/i);

  if (encodedMatch?.[1]) {
    return safeDecodeURIComponent(encodedMatch[1]);
  }

  const plainMatch = contentDisposition.match(/filename\s*=\s*"?(?<fileName>[^";]+)"?/i);

  return plainMatch?.groups?.fileName ?? null;
}

function sanitizeFileName(fileName) {
  return fileName.replace(/[<>:"/\\|?*\u0000-\u001F]/g, '_').trim() || 'download.bin';
}

function parseContentLength(contentLengthHeader) {
  const parsedValue = Number(contentLengthHeader);

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : null;
}

function writeChunk(writeStream, chunk) {
  return new Promise((resolve, reject) => {
    writeStream.write(chunk, (error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function closeWriteStream(writeStream) {
  return new Promise((resolve, reject) => {
    writeStream.end((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

function safeDecodeURIComponent(value) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function isAbortError(error) {
  return error instanceof Error && error.name === 'AbortError';
}

function getErrorMessage(error) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown download error.';
}

module.exports = {
  createDownloadManager
};
