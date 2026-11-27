import { Component, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';

/** Period of a statistics tab: the last 3, 6 or 12 months (current one included), the current year, or chosen dates. */
export type StatsPeriod = 'LAST3' | 'LAST6' | 'LAST12' | 'YEAR' | 'CUSTOM';

/** Number of months of a rolling period, null for the others. */
export function rollingMonths(p: StatsPeriod): number | null {
  return p === 'LAST3' ? 3 : p === 'LAST6' ? 6 : p === 'LAST12' ? 12 : null;
}

/** First month ("YYYY-MM") of the {@code n} months ending with {@code month}: 3 months to 2026-11 start in 2026-09. */
export function monthsBack(month: string, n: number): string {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - n, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

/** Period choice shared by the statistics tabs. */
@Component({
  selector: 'app-stats-period',
  imports: [FormsModule, MatButtonToggleModule, MatTooltipModule],
  template: `
    <mat-button-toggle-group class="period-toggle" [ngModel]="value()" (ngModelChange)="pick($event)" aria-label="Période">
      <mat-button-toggle value="LAST3" matTooltip="Les 3 derniers mois, mois en cours compris">3 mois</mat-button-toggle>
      <mat-button-toggle value="LAST6" matTooltip="Les 6 derniers mois, mois en cours compris">6 mois</mat-button-toggle>
      <mat-button-toggle value="LAST12" matTooltip="Les 12 derniers mois, mois en cours compris">12 mois</mat-button-toggle>
      <mat-button-toggle value="YEAR" matTooltip="Depuis le 1er janvier">Année en cours</mat-button-toggle>
      <mat-button-toggle value="CUSTOM" matTooltip="Choisir les dates">Personnalisée</mat-button-toggle>
    </mat-button-toggle-group>
  `,
})
export class StatsPeriodToggle {
  value = model.required<StatsPeriod>();
  changed = output<StatsPeriod>();

  pick(p: StatsPeriod): void {
    this.value.set(p);
    this.changed.emit(p);
  }
}
