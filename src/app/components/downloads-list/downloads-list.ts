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
  selector: 'app-downloads-list',
  templateUrl: './downloads-list.html',
  styleUrl: './downloads-list.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DownloadsListComponent {
  readonly downloads = input.required<DownloadTask[]>();
  readonly selectedDownloadId = input('');
  readonly statusMeta = input.required<DownloadStatusMeta>();
  readonly downloadSelected = output<string>();
}
