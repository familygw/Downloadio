export type DownloadStatus =
  | 'downloading'
  | 'queued'
  | 'paused'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type DownloadFilter =
  | 'all'
  | 'active'
  | 'queued'
  | 'completed'
  | 'failed';

export interface DownloadTask {
  id: string;
  fileName: string;
  host: string;
  sourceUrl: string;
  sourceLabel: string;
  destinationLabel: string;
  destinationPath: string | null;
  createdAt: string;
  progress: number;
  sizeLabel: string;
  transferredLabel: string;
  speedLabel: string;
  speedMbps: number;
  etaLabel: string;
  status: DownloadStatus;
  resumeSupported: boolean;
  segments: number;
  note: string;
  lastEvent: string;
}

export interface DownloadFilterOption {
  key: DownloadFilter;
  label: string;
}

export interface CreateDownloadInput {
  sourceUrl: string;
}
