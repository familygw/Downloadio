declare global {
  interface DownloadioAppInfo {
    name: string;
    version: string;
    platform: string;
    runtime: 'electron';
  }

  interface DownloadioStartDownloadInput {
    id: string;
    sourceUrl: string;
    suggestedFileName: string;
    destinationPath: string | null;
  }

  interface DownloadioDeleteDownloadInput {
    downloadId: string;
    destinationPath: string | null;
  }

  type DownloadioDownloadEvent =
    | {
        type: 'started';
        id: string;
        fileName: string;
        sourceUrl: string;
        destinationPath: string;
        totalBytes: number | null;
        receivedBytes: number;
      }
    | {
        type: 'progress';
        id: string;
        receivedBytes: number;
        totalBytes: number | null;
        speedBytesPerSecond: number;
      }
    | {
        type: 'paused';
        id: string;
        destinationPath: string;
        receivedBytes: number;
        totalBytes: number | null;
      }
    | {
        type: 'completed';
        id: string;
        destinationPath: string;
        totalBytes: number;
        receivedBytes: number;
      }
    | {
        type: 'failed';
        id: string;
        message: string;
      }
    | {
        type: 'cancelled';
        id: string;
      };

  interface DownloadioDesktopBridge {
    getAppInfo(): Promise<DownloadioAppInfo>;
    getDownloadsPath(): Promise<string>;
    pickDirectory(): Promise<string | null>;
    startDownload(input: DownloadioStartDownloadInput): Promise<void>;
    pauseDownload(downloadId: string): Promise<void>;
    cancelDownload(downloadId: string): Promise<void>;
    deleteDownload(input: DownloadioDeleteDownloadInput): Promise<void>;
    revealItem(filePath: string): Promise<void>;
    onDownloadEvent(
      listener: (event: DownloadioDownloadEvent) => void
    ): () => void;
  }

  interface Window {
    downloadio?: DownloadioDesktopBridge;
  }
}

export {};
