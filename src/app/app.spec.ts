import { TestBed } from '@angular/core/testing';
import { vi } from 'vitest';

import { App } from './app';
import {
  clearPersistedDownloadsForTests,
  DownloadsStore
} from './services/downloads.store';

describe('App', () => {
  let downloadListener: ((event: DownloadioDownloadEvent) => void) | null = null;
  let startDownloadMock: (input: DownloadioStartDownloadInput) => Promise<void>;
  let pauseDownloadMock: (downloadId: string) => Promise<void>;
  let cancelDownloadMock: (downloadId: string) => Promise<void>;
  let deleteDownloadMock: (input: DownloadioDeleteDownloadInput) => Promise<void>;
  let revealItemMock: (filePath: string) => Promise<void>;

  beforeEach(async () => {
    clearPersistedDownloadsForTests();
    startDownloadMock = vi.fn(async (_input: DownloadioStartDownloadInput) => undefined);
    pauseDownloadMock = vi.fn(async (_downloadId: string) => undefined);
    cancelDownloadMock = vi.fn(async (_downloadId: string) => undefined);
    deleteDownloadMock = vi.fn(async (_input: DownloadioDeleteDownloadInput) => undefined);
    revealItemMock = vi.fn(async (_filePath: string) => undefined);
    downloadListener = null;
    vi.spyOn(window, 'confirm').mockReturnValue(true);

    window.downloadio = {
      getAppInfo: async () => ({
        name: 'Downloadio',
        version: '0.1.0',
        platform: 'darwin',
        runtime: 'electron'
      }),
      getDownloadsPath: async () => '/Users/test/Downloads',
      pickDirectory: async () => null,
      startDownload: startDownloadMock,
      pauseDownload: pauseDownloadMock,
      cancelDownload: cancelDownloadMock,
      deleteDownload: deleteDownloadMock,
      revealItem: revealItemMock,
      onDownloadEvent: (listener) => {
        downloadListener = listener;
        return () => {
          downloadListener = null;
        };
      }
    };

    await TestBed.configureTestingModule({
      imports: [App]
    }).compileComponents();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create the app shell', () => {
    const fixture = TestBed.createComponent(App);
    const app = fixture.componentInstance;

    expect(app).toBeTruthy();
  });

  it('should render the Downloadio title and seeded downloads', async () => {
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(compiled.querySelector('.brand-copy h1')?.textContent).toContain(
      'Downloadio'
    );
    expect(compiled.querySelectorAll('.download-row').length).toBeGreaterThan(0);
  });

  it('should register a new download from the URL composer', async () => {
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const initialRows = compiled.querySelectorAll('.download-row').length;

    (compiled.querySelector('[data-testid="new-download-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    const input = compiled.querySelector('#source-url') as HTMLInputElement;

    input.value = 'https://example.com/releases/downloadio-alpha.zip';
    input.dispatchEvent(new Event('input'));

    (compiled.querySelector('[data-testid="new-download-form"]') as HTMLFormElement).dispatchEvent(
      new Event('submit')
    );

    fixture.detectChanges();
    await fixture.whenStable();

    expect(compiled.querySelectorAll('.download-row').length).toBe(initialRows + 1);
    expect(compiled.querySelector('.download-row strong')?.textContent).toContain(
      'downloadio-alpha.zip'
    );
    expect(startDownloadMock).toHaveBeenCalled();
  });

  it('should focus the URL input when opening the composer', async () => {
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;

    (compiled.querySelector('[data-testid="new-download-toggle"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    await new Promise((resolve) => setTimeout(resolve));

    const input = compiled.querySelector('#source-url') as HTMLInputElement;

    expect(document.activeElement).toBe(input);
  });

  it('should cancel the selected download from the inspector', async () => {
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;

    (compiled.querySelector('[data-testid="cancel-download"]') as HTMLButtonElement).click();
    fixture.detectChanges();

    expect(compiled.querySelector('.inspector-topline .status-badge')?.textContent).toContain(
      'Cancelled'
    );
  });

  it('should show pause as the active action for actively downloading items', async () => {
    const fixture = TestBed.createComponent(App);
    const store = TestBed.inject(DownloadsStore);

    fixture.detectChanges();
    await fixture.whenStable();

    const createdDownload = store.addFromUrl({
      sourceUrl: 'https://example.com/releases/downloadio-active.zip'
    });

    downloadListener?.({
      type: 'started',
      id: createdDownload.id,
      fileName: 'downloadio-active.zip',
      sourceUrl: 'https://example.com/releases/downloadio-active.zip',
      destinationPath: '/Users/test/Downloads/downloadio-active.zip',
      totalBytes: 2048,
      receivedBytes: 0
    });

    fixture.componentInstance['selectDownload'](createdDownload.id);
    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;

    expect(
      (compiled.querySelector('[data-testid="resume-download"]') as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (compiled.querySelector('[data-testid="retry-download"]') as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (compiled.querySelector('[data-testid="pause-download"]') as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it('should delete the selected download from the inspector', async () => {
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const initialRows = compiled.querySelectorAll('.download-row').length;

    (compiled.querySelector('[data-testid="delete-download"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(compiled.querySelectorAll('.download-row').length).toBe(initialRows - 1);
    expect(window.confirm).toHaveBeenCalled();
    expect(deleteDownloadMock).toHaveBeenCalled();
  });

  it('should disable transfer actions and enable reveal for completed downloads', async () => {
    const fixture = TestBed.createComponent(App);

    fixture.detectChanges();
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    const completedRow = Array.from(compiled.querySelectorAll('.download-row')).find((row) =>
      row.querySelector('strong')?.textContent?.includes('downloadio-ui-reference-pack.tgz')
    ) as HTMLButtonElement;

    completedRow.click();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(
      (compiled.querySelector('[data-testid="resume-download"]') as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (compiled.querySelector('[data-testid="retry-download"]') as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (compiled.querySelector('[data-testid="pause-download"]') as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (compiled.querySelector('[data-testid="cancel-download"]') as HTMLButtonElement).disabled
    ).toBe(true);
    expect(
      (compiled.querySelector('[data-testid="reveal-download"]') as HTMLButtonElement).disabled
    ).toBe(false);
  });

  it('should persist downloads across store instances', async () => {
    const firstStore = new DownloadsStore();
    const createdDownload = firstStore.addFromUrl({
      sourceUrl: 'https://example.com/releases/downloadio-persisted.zip'
    });

    await firstStore.removeDownload('ubuntu-release');

    const secondStore = new DownloadsStore();
    const downloads = secondStore.downloads();

    expect(downloads.some((download) => download.id === createdDownload.id)).toBe(true);
    expect(downloads.some((download) => download.id === 'ubuntu-release')).toBe(false);
  });

  it('should apply runtime progress events to the download state', () => {
    const store = new DownloadsStore();
    const createdDownload = store.addFromUrl({
      sourceUrl: 'https://example.com/releases/downloadio-runtime.zip'
    });

    downloadListener?.({
      type: 'started',
      id: createdDownload.id,
      fileName: 'downloadio-runtime.zip',
      sourceUrl: 'https://example.com/releases/downloadio-runtime.zip',
      destinationPath: '/Users/test/Downloads/downloadio-runtime.zip',
      totalBytes: 1024,
      receivedBytes: 0
    });

    downloadListener?.({
      type: 'progress',
      id: createdDownload.id,
      receivedBytes: 512,
      totalBytes: 1024,
      speedBytesPerSecond: 256
    });

    const updatedDownload = store
      .downloads()
      .find((download) => download.id === createdDownload.id);

    expect(updatedDownload?.status).toBe('downloading');
    expect(updatedDownload?.progress).toBe(50);
    expect(updatedDownload?.transferredLabel).toContain('512');
  });
});
