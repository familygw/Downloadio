import type { DownloadTask } from '../models/download-task';

export function resolveDownloadDestinationPath(
  download: Pick<
    DownloadTask,
    'destinationPath' | 'destinationLabel' | 'fileName' | 'status' | 'progress'
  >
) {
  if (download.destinationPath) {
    return download.destinationPath;
  }

  if (
    download.status !== 'completed' &&
    download.status !== 'paused' &&
    download.progress <= 0
  ) {
    return null;
  }

  const separator = download.destinationLabel.includes('\\') ? '\\' : '/';
  const normalizedDirectory = download.destinationLabel.replace(/[\\/]+$/, '');

  if (!normalizedDirectory) {
    return null;
  }

  return `${normalizedDirectory}${separator}${download.fileName}`;
}
