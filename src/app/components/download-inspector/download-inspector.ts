import {
  ChangeDetectionStrategy,
  Component,
  input,
  output
} from '@angular/core';

import { DownloadStatus, type DownloadTask } from '../../models/download-task';

type DownloadStatusMeta = Record<
  DownloadStatus,
  { label: string; tone: 'cool' | 'muted' | 'success' | 'danger' }
>;

@Component({
  selector: 'app-download-inspector',
  templateUrl: './download-inspector.html',
  styleUrl: './download-inspector.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DownloadInspectorComponent {
  readonly selectedDownload = input<DownloadTask | null>(null);
  readonly statusMeta = input.required<DownloadStatusMeta>();
  readonly canResume = input(false);
  readonly canPause = input(false);
  readonly canRetry = input(false);
  readonly canReveal = input(false);
  readonly canCancel = input(false);
  readonly resumeActionLabel = input('Resume download');

  readonly resumeRequested = output<void>();
  readonly pauseRequested = output<void>();
  readonly retryRequested = output<void>();
  readonly revealRequested = output<void>();
  readonly cancelRequested = output<void>();
  readonly removeRequested = output<void>();
}
