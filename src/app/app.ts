import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  ElementRef,
  inject,
  signal,
  viewChild
} from '@angular/core';
import { NonNullableFormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';

import { DownloadInspectorComponent } from './components/download-inspector/download-inspector';
import { DownloadsListComponent } from './components/downloads-list/downloads-list';
import { QueueOverviewComponent } from './components/queue-overview/queue-overview';
import { StatusBarComponent } from './components/status-bar/status-bar';
import { FILTERS, STATUS_META } from './data/mock-downloads';
import { DownloadFilter, DownloadTask } from './models/download-task';
import { DownloadsStore } from './services/downloads.store';
import { resolveDownloadDestinationPath } from './utils/download-path';
import { httpUrlValidator } from './validators/http-url.validator';

@Component({
  selector: 'app-root',
  imports: [
    CommonModule,
    ReactiveFormsModule,
    QueueOverviewComponent,
    DownloadsListComponent,
    DownloadInspectorComponent,
    StatusBarComponent
  ],
  templateUrl: './app.html',
  styleUrl: './app.scss',
  host: { '[class.is-darwin]': 'isDarwin()' },
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class App {
  readonly #downloadsStore = inject(DownloadsStore);
  readonly #formBuilder = inject(NonNullableFormBuilder);

  protected readonly isDarwin = signal(false);
  protected readonly filters = FILTERS;
  protected readonly statusMeta = STATUS_META;
  protected readonly downloads = this.#downloadsStore.downloads;
  protected readonly activeFilter = signal<DownloadFilter>('all');
  protected readonly selectedDownloadId = signal(this.downloads()[0]?.id ?? '');
  protected readonly platformLabel = signal('Browser preview');
  protected readonly isComposerOpen = signal(false);
  protected readonly newDownloadForm = this.#formBuilder.group({
    sourceUrl: ['', [Validators.required, httpUrlValidator()]]
  });
  protected readonly sourceUrlControl = this.newDownloadForm.controls.sourceUrl;
  protected readonly sourceUrlInput = viewChild<ElementRef<HTMLInputElement>>('sourceUrlInput');

  protected readonly counts = computed(() => {
    const downloads = this.downloads();

    return {
      all: downloads.length,
      active: downloads.filter((download) =>
        download.status === 'downloading' || download.status === 'paused'
      ).length,
      queued: downloads.filter((download) => download.status === 'queued').length,
      completed: downloads.filter((download) => download.status === 'completed').length,
      failed: downloads.filter((download) => download.status === 'failed').length
    };
  });

  protected readonly visibleDownloads = computed(() =>
    this.downloads().filter((download) =>
      this.matchesFilter(download, this.activeFilter())
    )
  );

  protected readonly selectedDownload = computed(() => {
    const visibleDownloads = this.visibleDownloads();
    const selectedDownload = visibleDownloads.find(
      (download) => download.id === this.selectedDownloadId()
    );

    return selectedDownload ?? visibleDownloads[0] ?? null;
  });
  protected readonly canResumeSelected = computed(() => {
    const status = this.selectedDownload()?.status;
    return status === 'queued' || status === 'paused';
  });
  protected readonly canRetrySelected = computed(() => {
    const status = this.selectedDownload()?.status;
    return status === 'failed' || status === 'cancelled';
  });
  protected readonly canPauseSelected = computed(
    () => this.selectedDownload()?.status === 'downloading'
  );
  protected readonly canRevealSelected = computed(() => {
    const selectedDownload = this.selectedDownload();
    return (
      selectedDownload?.status === 'completed' &&
      !!resolveDownloadDestinationPath(selectedDownload)
    );
  });
  protected readonly canCancelSelected = computed(() => {
    const status = this.selectedDownload()?.status;
    return status === 'downloading' || status === 'queued' || status === 'paused';
  });
  protected readonly resumeActionLabel = computed(() =>
    this.selectedDownload()?.status === 'queued' ? 'Start download' : 'Resume download'
  );

  protected readonly globalSpeedLabel = computed(() => {
    const totalSpeed = this.downloads()
      .filter((download) => download.status === 'downloading')
      .reduce((sum, download) => sum + download.speedMbps, 0);

    return totalSpeed > 0 ? `${totalSpeed.toFixed(1)} MB/s` : 'Idle';
  });

  protected readonly completionRate = computed(() => {
    const downloads = this.downloads();

    if (downloads.length === 0) {
      return 0;
    }

    const totalProgress = downloads.reduce(
      (sum, download) => sum + download.progress,
      0
    );

    return Math.round(totalProgress / downloads.length);
  });

  constructor() {
    void this.loadDesktopInfo();
  }

  protected setFilter(filter: DownloadFilter) {
    this.activeFilter.set(filter);

    const visibleDownloads = this.downloads().filter((download) =>
      this.matchesFilter(download, filter)
    );

    if (!visibleDownloads.some((download) => download.id === this.selectedDownloadId())) {
      this.selectedDownloadId.set(visibleDownloads[0]?.id ?? '');
    }
  }

  protected selectDownload(id: string) {
    this.selectedDownloadId.set(id);
  }

  protected toggleComposer() {
    const nextState = !this.isComposerOpen();

    this.isComposerOpen.set(nextState);

    if (nextState) {
      this.focusSourceUrlInput();
      return;
    }

    this.newDownloadForm.reset();
  }

  protected closeComposer() {
    this.isComposerOpen.set(false);
    this.newDownloadForm.reset();
  }

  protected startDownloadFromComposer() {
    if (this.newDownloadForm.invalid) {
      this.newDownloadForm.markAllAsTouched();
      return;
    }

    const createdDownload = this.#downloadsStore.addFromUrl({
      sourceUrl: this.sourceUrlControl.getRawValue()
    });

    this.activeFilter.set('all');
    this.selectedDownloadId.set(createdDownload.id);
    this.closeComposer();
  }

  protected resumeSelectedDownload() {
    if (!this.canResumeSelected()) {
      return;
    }

    const selectedDownload = this.selectedDownload();

    if (!selectedDownload) {
      return;
    }

    this.#downloadsStore.resumeDownload(selectedDownload.id);
  }

  protected retrySelectedDownload() {
    if (!this.canRetrySelected()) {
      return;
    }

    const selectedDownload = this.selectedDownload();

    if (!selectedDownload) {
      return;
    }

    this.#downloadsStore.retryDownload(selectedDownload.id);
  }

  protected pauseSelectedDownload() {
    if (!this.canPauseSelected()) {
      return;
    }

    const selectedDownload = this.selectedDownload();

    if (!selectedDownload) {
      return;
    }

    this.#downloadsStore.pauseDownload(selectedDownload.id);
  }

  protected cancelSelectedDownload() {
    if (!this.canCancelSelected()) {
      return;
    }

    const selectedDownload = this.selectedDownload();

    if (!selectedDownload) {
      return;
    }

    this.#downloadsStore.cancelDownload(selectedDownload.id);
  }

  protected async removeSelectedDownload() {
    const selectedDownload = this.selectedDownload();

    if (!selectedDownload) {
      return;
    }

    const shouldRemove = window.confirm(this.getDeleteConfirmationMessage(selectedDownload));

    if (!shouldRemove) {
      return;
    }

    const removed = await this.#downloadsStore.removeDownload(selectedDownload.id);

    if (!removed) {
      return;
    }

    const nextDownload = this.visibleDownloads().find(
      (download) => download.id !== selectedDownload.id
    );

    this.selectedDownloadId.set(nextDownload?.id ?? '');
  }

  protected revealSelectedDownload() {
    const selectedDownload = this.selectedDownload();
    const destinationPath = selectedDownload
      ? resolveDownloadDestinationPath(selectedDownload)
      : null;

    if (!destinationPath || !this.canRevealSelected()) {
      return;
    }

    void window.downloadio?.revealItem(destinationPath);
  }

  private focusSourceUrlInput() {
    const focusInput = () => {
      this.sourceUrlInput()?.nativeElement.focus();
    };

    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => focusInput());
      return;
    }

    setTimeout(focusInput);
  }

  private matchesFilter(download: DownloadTask, filter: DownloadFilter) {
    switch (filter) {
      case 'active':
        return download.status === 'downloading' || download.status === 'paused';
      case 'queued':
        return download.status === 'queued';
      case 'completed':
        return download.status === 'completed';
      case 'failed':
        return download.status === 'failed';
      default:
        return true;
    }
  }

  private async loadDesktopInfo() {
    const appInfo = await window.downloadio?.getAppInfo();

    if (!appInfo) {
      return;
    }

    this.isDarwin.set(appInfo.platform === 'darwin');
    this.platformLabel.set(
      `${appInfo.name} ${appInfo.version} · ${appInfo.platform}`
    );
  }

  private getDeleteConfirmationMessage(download: DownloadTask) {
    if (download.status === 'completed') {
      return `Delete "${download.fileName}"?\n\nThis will remove the downloaded file from disk and remove the entry from Downloadio.`;
    }

    return `Delete "${download.fileName}"?\n\nThis will stop the transfer, remove the entry from Downloadio, and delete any downloaded data from disk.`;
  }
}
