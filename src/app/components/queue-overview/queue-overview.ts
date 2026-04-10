import { ChangeDetectionStrategy, Component, input } from '@angular/core';

@Component({
  selector: 'app-queue-overview',
  templateUrl: './queue-overview.html',
  styleUrl: './queue-overview.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QueueOverviewComponent {
  readonly completionRate = input.required<number>();
  readonly globalSpeedLabel = input.required<string>();
  readonly activeCount = input.required<number>();
  readonly failedCount = input.required<number>();
  readonly platformLabel = input.required<string>();
}
