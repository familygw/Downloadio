import {
  DownloadFilterOption,
  DownloadStatus,
  type DownloadTask
} from '../models/download-task';

export const FILTERS: DownloadFilterOption[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active' },
  { key: 'queued', label: 'Queued' },
  { key: 'completed', label: 'Finished' },
  { key: 'failed', label: 'Failed' }
];

export const STATUS_META: Record<
  DownloadStatus,
  { label: string; tone: 'cool' | 'muted' | 'success' | 'danger' }
> = {
  downloading: { label: 'Downloading', tone: 'cool' },
  queued: { label: 'Queued', tone: 'muted' },
  paused: { label: 'Paused', tone: 'muted' },
  completed: { label: 'Completed', tone: 'success' },
  failed: { label: 'Needs attention', tone: 'danger' },
  cancelled: { label: 'Cancelled', tone: 'muted' }
};

export const MOCK_DOWNLOADS: DownloadTask[] = [
  {
    id: 'ubuntu-release',
    fileName: 'ubuntu-24.04.2-desktop-amd64.iso',
    host: 'releases.ubuntu.com',
    sourceUrl: 'https://releases.ubuntu.com/24.04.2/ubuntu-24.04.2-desktop-amd64.iso',
    sourceLabel: 'Primary mirror · HTTPS',
    destinationLabel: '~/Downloads/Linux',
    destinationPath: '/Users/carlos.leguizamon/Downloads/Linux/ubuntu-24.04.2-desktop-amd64.iso',
    createdAt: '2026-04-03T03:44:00.000Z',
    progress: 68,
    sizeLabel: '5.8 GB',
    transferredLabel: '3.9 GB',
    speedLabel: '14.2 MB/s',
    speedMbps: 14.2,
    etaLabel: '2m 18s',
    status: 'downloading',
    resumeSupported: true,
    segments: 6,
    note: 'Segmented transfer is stable. Mirror latency remains low.',
    lastEvent: 'Received final content length and resumed at byte 2,104,668,160.'
  },
  {
    id: 'figma-archive',
    fileName: 'product-marketing-archive-apr-2026.zip',
    host: 'assets.downloadio.cloud',
    sourceUrl: 'https://assets.downloadio.cloud/archives/product-marketing-archive-apr-2026.zip',
    sourceLabel: 'Signed link · HTTPS',
    destinationLabel: '~/Downloads/Creative',
    destinationPath: null,
    createdAt: '2026-04-03T03:45:20.000Z',
    progress: 0,
    sizeLabel: '1.2 GB',
    transferredLabel: 'Waiting',
    speedLabel: '—',
    speedMbps: 0,
    etaLabel: 'Queued',
    status: 'queued',
    resumeSupported: true,
    segments: 4,
    note: 'Waiting for a free slot in the active queue.',
    lastEvent: 'Queued behind one active transfer.'
  },
  {
    id: 'symbols-bundle',
    fileName: 'release-symbols-2026.04.03.tar.zst',
    host: 'build-cache.internal',
    sourceUrl: 'https://build-cache.internal/release-symbols-2026.04.03.tar.zst',
    sourceLabel: 'Authenticated mirror',
    destinationLabel: '~/Downloads/Builds',
    destinationPath: '/Users/carlos.leguizamon/Downloads/Builds/release-symbols-2026.04.03.tar.zst',
    createdAt: '2026-04-03T03:46:10.000Z',
    progress: 42,
    sizeLabel: '8.4 GB',
    transferredLabel: '3.5 GB',
    speedLabel: 'Paused',
    speedMbps: 0,
    etaLabel: 'Manual resume',
    status: 'paused',
    resumeSupported: true,
    segments: 8,
    note: 'The server supports ranges, so the task can continue cleanly.',
    lastEvent: 'Paused manually before switching networks.'
  },
  {
    id: 'ui-reference',
    fileName: 'downloadio-ui-reference-pack.tgz',
    host: 'cdn.design-source.net',
    sourceUrl: 'https://cdn.design-source.net/reference/downloadio-ui-reference-pack.tgz',
    sourceLabel: 'Edge cache',
    destinationLabel: '~/Downloads/References',
    destinationPath: '/Users/carlos.leguizamon/Downloads/References/downloadio-ui-reference-pack.tgz',
    createdAt: '2026-04-03T03:47:00.000Z',
    progress: 100,
    sizeLabel: '842 MB',
    transferredLabel: '842 MB',
    speedLabel: 'Done',
    speedMbps: 0,
    etaLabel: 'Completed',
    status: 'completed',
    resumeSupported: true,
    segments: 5,
    note: 'Archive verified and ready to unpack.',
    lastEvent: 'Transfer completed with matching final size.'
  },
  {
    id: 'mirror-sync',
    fileName: 'mirror-sync-2026-04-03.sql.gz',
    host: 'backup-03.remote.net',
    sourceUrl: 'https://backup-03.remote.net/snapshots/mirror-sync-2026-04-03.sql.gz',
    sourceLabel: 'Remote database snapshot',
    destinationLabel: '~/Downloads/Backups',
    destinationPath: '/Users/carlos.leguizamon/Downloads/Backups/mirror-sync-2026-04-03.sql.gz',
    createdAt: '2026-04-03T03:47:35.000Z',
    progress: 91,
    sizeLabel: '2.7 GB',
    transferredLabel: '2.5 GB',
    speedLabel: 'Retry required',
    speedMbps: 0,
    etaLabel: 'Blocked',
    status: 'failed',
    resumeSupported: false,
    segments: 1,
    note: 'The endpoint terminated the TLS session before the final chunk.',
    lastEvent: 'Handshake dropped during integrity verification.'
  }
];
