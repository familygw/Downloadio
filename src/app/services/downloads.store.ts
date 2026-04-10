import { Injectable, signal } from '@angular/core';

import { MOCK_DOWNLOADS } from '../data/mock-downloads';
import { CreateDownloadInput, type DownloadTask } from '../models/download-task';
import { resolveDownloadDestinationPath } from '../utils/download-path';

const DOWNLOADS_STORAGE_KEY = 'downloadio.downloads';
const FALLBACK_STORAGE = createMemoryStorage();

@Injectable({ providedIn: 'root' })
export class DownloadsStore {
  readonly #downloads = signal<DownloadTask[]>(loadPersistedDownloads());
  readonly downloads = this.#downloads.asReadonly();
  #defaultDownloadsPath = '~/Downloads';

  constructor() {
    this.normalizeRestoredDownloads();
    void this.loadDefaultDownloadsPath();
    window.downloadio?.onDownloadEvent((event) => {
      this.applyRuntimeEvent(event);
    });
  }

  addFromUrl(input: CreateDownloadInput): DownloadTask {
    const download = createDownloadTask(input, this.#defaultDownloadsPath);

    this.updateDownloads((downloads) => [download, ...downloads]);
    void this.startRuntimeDownload(download);

    return download;
  }

  resumeDownload(downloadId: string) {
    const download = this.downloads().find((item) => item.id === downloadId);

    if (!download) {
      return;
    }

    this.updateDownloads((downloads) =>
      downloads.map((item) =>
        item.id === downloadId
          ? {
              ...item,
              status: 'queued',
              speedLabel: 'Queued',
              etaLabel: 'Queued',
              transferredLabel: item.progress > 0 ? item.transferredLabel : 'Waiting',
              note: 'Resume requested from the inspector.',
              lastEvent: 'Waiting for the desktop engine to resume the transfer.'
            }
          : item
      )
    );

    void this.startRuntimeDownload(download);
  }

  retryDownload(downloadId: string) {
    this.resumeDownload(downloadId);
  }

  pauseDownload(downloadId: string) {
    void window.downloadio?.pauseDownload(downloadId);

    this.updateDownloads((downloads) =>
      downloads.map((download) =>
        download.id === downloadId
          ? {
              ...download,
              status: 'paused',
              speedLabel: 'Paused',
              speedMbps: 0,
              etaLabel: 'Manual resume',
              note: 'Transfer paused from the inspector.',
              lastEvent: 'Download paused manually by the user.'
            }
          : download
      )
    );
  }

  cancelDownload(downloadId: string) {
    void window.downloadio?.cancelDownload(downloadId);

    this.updateDownloads((downloads) =>
      downloads.map((download) =>
        download.id === downloadId
          ? {
              ...download,
              status: 'cancelled',
              speedLabel: 'Cancelled',
              etaLabel: 'Stopped',
              note: 'Transfer cancelled from the inspector.',
              lastEvent: 'Download cancelled manually by the user.'
            }
          : download
      )
    );
  }

  async removeDownload(downloadId: string) {
    const download = this.downloads().find((item) => item.id === downloadId);

    if (!download) {
      return false;
    }

    try {
      await window.downloadio?.deleteDownload({
        downloadId,
        destinationPath: resolveDownloadDestinationPath(download)
      });
    } catch (error) {
      this.updateDownloads((downloads) =>
        downloads.map((item) =>
          item.id === downloadId
            ? {
                ...item,
                note: getErrorMessage(error),
                lastEvent: 'The desktop engine could not remove this item.'
              }
            : item
        )
      );

      return false;
    }

    this.updateDownloads((downloads) =>
      downloads.filter((item) => item.id !== downloadId)
    );

    return true;
  }

  private normalizeRestoredDownloads() {
    const normalizedDownloads: DownloadTask[] = this.downloads().map((download) => {
      if (download.status !== 'downloading') {
        return download;
      }

      return {
        ...download,
        status: 'queued',
        speedLabel: 'Queued',
        etaLabel: 'Resume required',
        note: 'Download restored after reopening the app.',
        lastEvent: 'Resume this task to continue the transfer.'
      };
    });

    if (JSON.stringify(normalizedDownloads) !== JSON.stringify(this.downloads())) {
      this.#downloads.set(normalizedDownloads);
      persistDownloads(normalizedDownloads);
    }
  }

  private async loadDefaultDownloadsPath() {
    const downloadsPath = await window.downloadio?.getDownloadsPath();

    if (!downloadsPath) {
      return;
    }

    this.#defaultDownloadsPath = downloadsPath;

    this.updateDownloads((downloads) =>
      downloads.map((download) =>
        download.destinationLabel === '~/Downloads'
          ? {
              ...download,
              destinationLabel: downloadsPath
            }
          : download
      )
    );
  }

  private async startRuntimeDownload(download: DownloadTask) {
    if (!window.downloadio?.startDownload) {
      this.updateDownloads((downloads) =>
        downloads.map((item) =>
          item.id === download.id
            ? {
                ...item,
                status: 'failed',
                speedLabel: 'Bridge missing',
                etaLabel: 'Unavailable',
                note: 'The desktop download bridge is not available in this renderer.',
                lastEvent: 'Download engine bridge is unavailable.'
              }
            : item
        )
      );
      return;
    }

    this.updateDownloads((downloads) =>
      downloads.map((item) =>
        item.id === download.id
          ? {
              ...item,
              status: 'downloading',
              speedLabel: 'Connecting...',
              etaLabel: 'Connecting',
              transferredLabel: item.progress > 0 ? item.transferredLabel : '0 B',
              note: 'Connecting to the source URL from the desktop engine.',
              lastEvent: `Preparing transfer from ${download.sourceUrl}.`
            }
          : item
      )
    );

    try {
      await window.downloadio.startDownload({
        id: download.id,
        sourceUrl: download.sourceUrl,
        suggestedFileName: download.fileName,
        destinationPath: resolveDownloadDestinationPath(download)
      });
    } catch (error) {
      this.updateDownloads((downloads) =>
        downloads.map((item) =>
          item.id === download.id
            ? {
                ...item,
                status: 'failed',
                speedLabel: 'Error',
                etaLabel: 'Blocked',
                note: getErrorMessage(error),
                lastEvent: 'The desktop engine could not start this transfer.'
              }
            : item
        )
      );
    }
  }

  private applyRuntimeEvent(event: DownloadioDownloadEvent) {
    switch (event.type) {
      case 'started':
        this.updateDownloads((downloads) =>
          downloads.map((download) =>
            download.id === event.id
              ? {
                  ...download,
                  fileName: event.fileName,
                  host: getHostLabel(event.sourceUrl),
                  sourceUrl: event.sourceUrl,
                  sourceLabel: `Direct link · ${getProtocolLabel(event.sourceUrl)}`,
                  destinationLabel: getDirectoryLabel(event.destinationPath),
                  destinationPath: event.destinationPath,
                  progress: getProgressPercentage(event.receivedBytes, event.totalBytes),
                  sizeLabel: formatBytes(event.totalBytes),
                  transferredLabel: formatTransferredBytes(event.receivedBytes),
                  speedLabel: event.receivedBytes > 0 ? 'Resuming...' : 'Starting...',
                  etaLabel: 'Preparing',
                  status: 'downloading',
                  note:
                    event.receivedBytes > 0
                      ? 'Transfer resumed in the desktop engine.'
                      : 'Transfer started in the desktop engine.',
                  lastEvent:
                    event.receivedBytes > 0
                      ? `Resuming from ${formatTransferredBytes(event.receivedBytes)} in ${event.destinationPath}.`
                      : `Saving to ${event.destinationPath}.`
                }
              : download
          )
        );
        return;

      case 'progress':
        this.updateDownloads((downloads) =>
          downloads.map((download) =>
            download.id === event.id
              ? {
                  ...download,
                  progress: getProgressPercentage(
                    event.receivedBytes,
                    event.totalBytes
                  ),
                  sizeLabel: formatBytes(event.totalBytes),
                  transferredLabel: formatTransferredBytes(event.receivedBytes),
                  speedLabel: formatSpeed(event.speedBytesPerSecond),
                  speedMbps: toMegabytesPerSecond(event.speedBytesPerSecond),
                  etaLabel: formatEta(
                    event.totalBytes,
                    event.receivedBytes,
                    event.speedBytesPerSecond
                  ),
                  status: 'downloading',
                  note: 'Transfer in progress.',
                  lastEvent: `Downloaded ${formatBytes(event.receivedBytes)} so far.`
                }
              : download
          )
        );
        return;

      case 'paused':
        this.updateDownloads((downloads) =>
          downloads.map((download) =>
            download.id === event.id
              ? {
                  ...download,
                  destinationLabel: getDirectoryLabel(event.destinationPath),
                  destinationPath: event.destinationPath,
                  progress: getProgressPercentage(
                    event.receivedBytes,
                    event.totalBytes
                  ),
                  sizeLabel: formatBytes(event.totalBytes),
                  transferredLabel: formatTransferredBytes(event.receivedBytes),
                  speedLabel: 'Paused',
                  speedMbps: 0,
                  etaLabel: 'Manual resume',
                  status: 'paused',
                  note: 'Transfer paused. Resume to continue from the saved data.',
                  lastEvent: `Paused at ${formatTransferredBytes(event.receivedBytes)}.`
                }
              : download
          )
        );
        return;

      case 'completed':
        this.updateDownloads((downloads) =>
          downloads.map((download) =>
            download.id === event.id
              ? {
                  ...download,
                  destinationPath: event.destinationPath,
                  progress: 100,
                  sizeLabel: formatBytes(event.totalBytes),
                  transferredLabel: formatTransferredBytes(event.receivedBytes),
                  speedLabel: 'Done',
                  speedMbps: 0,
                  etaLabel: 'Completed',
                  status: 'completed',
                  note: 'Transfer completed successfully.',
                  lastEvent: `Saved to ${event.destinationPath}.`
                }
              : download
          )
        );
        return;

      case 'failed':
        this.updateDownloads((downloads) =>
          downloads.map((download) =>
            download.id === event.id
              ? {
                  ...download,
                  status: 'failed',
                  speedLabel: 'Error',
                  speedMbps: 0,
                  etaLabel: 'Blocked',
                  note: event.message,
                  lastEvent: event.message
                }
              : download
          )
        );
        return;

      case 'cancelled':
        this.updateDownloads((downloads) =>
          downloads.map((download) =>
            download.id === event.id
              ? {
                  ...download,
                  status: 'cancelled',
                  speedLabel: 'Cancelled',
                  speedMbps: 0,
                  etaLabel: 'Stopped',
                  note: 'Transfer cancelled from the inspector.',
                  lastEvent: 'Download cancelled manually by the user.'
                }
              : download
          )
        );
        return;
    }
  }

  private updateDownloads(
    updater: (downloads: DownloadTask[]) => DownloadTask[]
  ) {
    this.#downloads.update((downloads) => {
      const nextDownloads = updater(downloads);

      persistDownloads(nextDownloads);

      return nextDownloads;
    });
  }
}

function loadPersistedDownloads(): DownloadTask[] {
  const storedValue = getStorage().getItem(DOWNLOADS_STORAGE_KEY);

  if (!storedValue) {
    return MOCK_DOWNLOADS;
  }

  try {
    const parsedValue = JSON.parse(storedValue) as unknown;

    if (!Array.isArray(parsedValue)) {
      console.error('Downloadio persistence is invalid: expected an array.');
      return MOCK_DOWNLOADS;
    }

    const downloads = parsedValue.filter(isDownloadTask).map(normalizeDownloadTask);

    if (downloads.length !== parsedValue.length) {
      console.error('Downloadio persistence is invalid: some records were discarded.');
    }

    if (downloads.length === 0 && parsedValue.length > 0) {
      return MOCK_DOWNLOADS;
    }

    return downloads;
  } catch (error) {
    console.error('Downloadio persistence could not be parsed.', error);
    return MOCK_DOWNLOADS;
  }
}

function persistDownloads(downloads: DownloadTask[]) {
  getStorage().setItem(
    DOWNLOADS_STORAGE_KEY,
    JSON.stringify(downloads)
  );
}

export function clearPersistedDownloadsForTests() {
  getStorage().removeItem(DOWNLOADS_STORAGE_KEY);
}

function isDownloadTask(value: unknown): value is DownloadTask {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as Partial<DownloadTask>;

  return (
    typeof candidate.id === 'string' &&
    typeof candidate.fileName === 'string' &&
    typeof candidate.host === 'string' &&
    typeof candidate.sourceUrl === 'string' &&
    typeof candidate.sourceLabel === 'string' &&
    typeof candidate.destinationLabel === 'string' &&
    (typeof candidate.destinationPath === 'string' ||
      candidate.destinationPath === null ||
      candidate.destinationPath === undefined) &&
    typeof candidate.createdAt === 'string' &&
    typeof candidate.progress === 'number' &&
    typeof candidate.sizeLabel === 'string' &&
    typeof candidate.transferredLabel === 'string' &&
    typeof candidate.speedLabel === 'string' &&
    typeof candidate.speedMbps === 'number' &&
    typeof candidate.etaLabel === 'string' &&
    typeof candidate.status === 'string' &&
    typeof candidate.resumeSupported === 'boolean' &&
    typeof candidate.segments === 'number' &&
    typeof candidate.note === 'string' &&
    typeof candidate.lastEvent === 'string'
  );
}

function createDownloadTask(
  input: CreateDownloadInput,
  defaultDestinationPath: string
): DownloadTask {
  const sourceUrl = new URL(input.sourceUrl.trim());
  const now = new Date().toISOString();
  const fileName = getFileNameFromUrl(sourceUrl);
  const protocolLabel = sourceUrl.protocol === 'https:' ? 'HTTPS' : 'HTTP';

  return {
    id: createDownloadId(),
    fileName,
    host: sourceUrl.hostname,
    sourceUrl: sourceUrl.toString(),
    sourceLabel: `Direct link · ${protocolLabel}`,
    destinationLabel: defaultDestinationPath,
    destinationPath: null,
    createdAt: now,
    progress: 0,
    sizeLabel: 'Unknown',
    transferredLabel: 'Waiting',
    speedLabel: 'Queued',
    speedMbps: 0,
    etaLabel: 'Queued',
    status: 'queued',
    resumeSupported: true,
    segments: 1,
    note: 'Added from the UI. Waiting for the desktop engine to start.',
    lastEvent: 'Download registered from manual URL input.'
  };
}

function normalizeDownloadTask(download: DownloadTask): DownloadTask {
  return {
    ...download,
    destinationPath: download.destinationPath ?? null
  };
}

function getFileNameFromUrl(sourceUrl: URL) {
  const pathSegments = sourceUrl.pathname.split('/').filter(Boolean);
  const rawFileName = pathSegments.at(-1);

  if (rawFileName) {
    return safeDecodeURIComponent(rawFileName);
  }

  return `${sourceUrl.hostname.replace(/^www\./, '')}-download.bin`;
}

function safeDecodeURIComponent(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function createDownloadId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `download-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  return 'Unknown download error.';
}

function getProgressPercentage(receivedBytes: number, totalBytes: number | null) {
  if (!totalBytes || totalBytes <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((receivedBytes / totalBytes) * 100));
}

function formatBytes(bytes: number | null) {
  if (!bytes || bytes <= 0) {
    return 'Unknown';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;

  return `${value.toFixed(precision)} ${units[unitIndex]}`;
}

function formatTransferredBytes(bytes: number) {
  if (bytes <= 0) {
    return '0 B';
  }

  return formatBytes(bytes);
}

function formatSpeed(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return 'Starting...';
  }

  return `${formatBytes(bytesPerSecond)}/s`;
}

function formatEta(
  totalBytes: number | null,
  receivedBytes: number,
  bytesPerSecond: number
) {
  if (!totalBytes || !Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return 'Calculating';
  }

  const secondsRemaining = Math.max(
    0,
    Math.round((totalBytes - receivedBytes) / bytesPerSecond)
  );

  if (secondsRemaining < 60) {
    return `${secondsRemaining}s`;
  }

  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;

  if (minutes < 60) {
    return `${minutes}m ${seconds}s`;
  }

  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;

  return `${hours}h ${remainingMinutes}m`;
}

function toMegabytesPerSecond(bytesPerSecond: number) {
  if (!Number.isFinite(bytesPerSecond) || bytesPerSecond <= 0) {
    return 0;
  }

  return bytesPerSecond / (1024 * 1024);
}

function getHostLabel(sourceUrl: string) {
  return new URL(sourceUrl).hostname;
}

function getProtocolLabel(sourceUrl: string) {
  return new URL(sourceUrl).protocol === 'https:' ? 'HTTPS' : 'HTTP';
}

function getDirectoryLabel(destinationPath: string) {
  const normalizedPath = destinationPath.replaceAll('\\', '/');
  const pathSegments = normalizedPath.split('/').filter(Boolean);

  if (pathSegments.length <= 1) {
    return normalizedPath;
  }

  return normalizedPath.slice(0, normalizedPath.lastIndexOf('/'));
}

function getStorage() {
  const storage = globalThis.localStorage;

  if (
    storage &&
    typeof storage.getItem === 'function' &&
    typeof storage.setItem === 'function' &&
    typeof storage.removeItem === 'function'
  ) {
    return storage;
  }

  return FALLBACK_STORAGE;
}

function createMemoryStorage() {
  const entries = new Map<string, string>();

  return {
    getItem(key: string) {
      return entries.get(key) ?? null;
    },
    setItem(key: string, value: string) {
      entries.set(key, value);
    },
    removeItem(key: string) {
      entries.delete(key);
    }
  };
}
