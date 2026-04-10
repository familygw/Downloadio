import { createWriteStream } from 'node:fs';
import { access, mkdir, rename, rm, stat } from 'node:fs/promises';
import path from 'node:path';

const activeDownloads = new Map();
const downloadArtifacts = new Map();

export function createDownloadManager({ app, BrowserWindow }) {
  return {
    startDownload(input) {
      if (activeDownloads.has(input.id)) {
        return;
      }

      const controller = new AbortController();

      activeDownloads.set(input.id, {
        controller,
        abortReason: 'cancel',
        destinationPath: input.destinationPath,
        partialPath: input.destinationPath ? `${input.destinationPath}.downloadio-part` : null
      });

      void runDownload({
        app,
        BrowserWindow,
        input,
        controller
      });
    },

    pauseDownload(downloadId) {
      requestAbort(downloadId, 'pause');
    },

    cancelDownload(downloadId) {
      requestAbort(downloadId, 'cancel');
    },

    async deleteDownload({ downloadId, destinationPath }) {
      requestAbort(downloadId, 'delete');
      await deleteDownloadFiles(downloadId, destinationPath);
    }
  };
}

async function runDownload({ app, BrowserWindow, input, controller }) {
  let writeStream = null;
  let totalBytes = null;
  let receivedBytes = 0;
  let destinationPath =
    input.destinationPath ?? downloadArtifacts.get(input.id)?.destinationPath ?? null;
  let partialPath =
    downloadArtifacts.get(input.id)?.partialPath ??
    (destinationPath ? `${destinationPath}.downloadio-part` : null);

  try {
    const resumeBytes = partialPath ? await getFileSize(partialPath) : 0;
    const response = await fetch(input.sourceUrl, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': `Downloadio/${app.getVersion()}`,
        ...(resumeBytes > 0 ? { range: `bytes=${resumeBytes}-` } : {})
      }
    });

    if (!response.ok || !response.body) {
      throw new Error(`Server responded with ${response.status} ${response.statusText}.`);
    }

    const fileName = resolveFileName({
      contentDisposition: response.headers.get('content-disposition'),
      responseUrl: response.url,
      suggestedFileName: input.suggestedFileName
    });
    const destinationDir = destinationPath
      ? path.dirname(destinationPath)
      : app.getPath('downloads');

    await mkdir(destinationDir, { recursive: true });

    if (!destinationPath) {
      destinationPath = await createUniqueFilePath(destinationDir, fileName);
      partialPath = `${destinationPath}.downloadio-part`;
    }

    const canResume = resumeBytes > 0 && response.status === 206;
    const responseContentLength = parseContentLength(
      response.headers.get('content-length')
    );

    totalBytes = canResume
      ? responseContentLength === null
        ? null
        : resumeBytes + responseContentLength
      : responseContentLength;

    if (resumeBytes > 0 && !canResume && partialPath) {
      await rm(partialPath, { force: true });
    }

    receivedBytes = canResume ? resumeBytes : 0;

    activeDownloads.set(input.id, {
      controller,
      abortReason: 'cancel',
      destinationPath,
      partialPath
    });
    downloadArtifacts.set(input.id, {
      destinationPath,
      partialPath
    });

    emitDownloadEvent(BrowserWindow, {
      type: 'started',
      id: input.id,
      fileName,
      sourceUrl: response.url,
      destinationPath,
      totalBytes,
      receivedBytes
    });

    writeStream = createWriteStream(partialPath, { flags: canResume ? 'a' : 'w' });

    const reader = response.body.getReader();
    const startedAt = Date.now();
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
    downloadArtifacts.set(input.id, {
      destinationPath,
      partialPath: null
    });

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

    const activeDownload = activeDownloads.get(input.id);
    const abortReason = activeDownload?.abortReason ?? 'cancel';
    const currentDestinationPath = activeDownload?.destinationPath ?? destinationPath;
    const currentPartialPath = activeDownload?.partialPath ?? partialPath;

    if (isAbortError(error)) {
      if (abortReason === 'pause' && currentDestinationPath && currentPartialPath) {
        const pausedBytes = await getFileSize(currentPartialPath);

        downloadArtifacts.set(input.id, {
          destinationPath: currentDestinationPath,
          partialPath: currentPartialPath
        });

        emitDownloadEvent(BrowserWindow, {
          type: 'paused',
          id: input.id,
          destinationPath: currentDestinationPath,
          receivedBytes: pausedBytes,
          totalBytes
        });
      } else if (abortReason === 'delete') {
        await deleteDownloadFiles(input.id, currentDestinationPath);
      } else {
        await deleteDownloadFiles(input.id, currentDestinationPath);

        emitDownloadEvent(BrowserWindow, {
          type: 'cancelled',
          id: input.id
        });
      }
    } else {
      if (currentDestinationPath && currentPartialPath) {
        downloadArtifacts.set(input.id, {
          destinationPath: currentDestinationPath,
          partialPath: currentPartialPath
        });
      }

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

function requestAbort(downloadId, abortReason) {
  const activeDownload = activeDownloads.get(downloadId);

  if (!activeDownload) {
    return false;
  }

  activeDownload.abortReason = abortReason;
  activeDownload.controller.abort();
  return true;
}

function emitDownloadEvent(BrowserWindow, event) {
  for (const browserWindow of BrowserWindow.getAllWindows()) {
    browserWindow.webContents.send('downloads:event', event);
  }
}

async function deleteDownloadFiles(downloadId, destinationPath) {
  const activeDownload = activeDownloads.get(downloadId);
  const knownArtifacts = downloadArtifacts.get(downloadId);
  const paths = new Set([
    activeDownload?.partialPath,
    activeDownload?.destinationPath,
    knownArtifacts?.partialPath,
    knownArtifacts?.destinationPath,
    destinationPath,
    destinationPath ? `${destinationPath}.downloadio-part` : null
  ]);

  for (const filePath of paths) {
    if (filePath) {
      await rm(filePath, { force: true });
    }
  }

  downloadArtifacts.delete(downloadId);
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

async function getFileSize(filePath) {
  if (!filePath) {
    return 0;
  }

  try {
    const fileStat = await stat(filePath);
    return fileStat.size;
  } catch {
    return 0;
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
