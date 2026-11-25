import { Component, computed, input } from '@angular/core';
import { MoneyPipe, monthName } from '../../core/format';
import { StaffView } from '../../core/models';
import { SportChip } from '../../shared/badges';

/** Initials of a staff member: no photo is stored for the staff. */
export function staffInitials(s: Pick<StaffView, 'firstName' | 'lastName'>): string {
  return `${s.firstName?.charAt(0) ?? ''}${s.lastName?.charAt(0) ?? ''}`.toUpperCase();
}

/** Read-only summary card shown when hovering or focusing a staff ID; same look as the member preview. */
@Component({
  selector: 'app-staff-preview',
  imports: [SportChip, MoneyPipe],
  host: { class: 'member-preview', role: 'tooltip' },
  template: `
    @let s = staff();
    <div class="mp-banner"></div>
    <div class="mp-head">
      <div class="mp-photo mp-initials" aria-hidden="true">{{ initials() }}</div>
      <div class="mp-identity">
        <div class="mp-name">{{ s.name }}</div>
        <div class="mp-tags">
          <span class="mp-code">{{ s.code }}</span>
          @if (!s.active) {<span class="badge neutral mp-inactive">Inactif</span>}
        </div>
      </div>
    </div>
    <dl class="mp-grid">
      <dt>Fonction</dt><dd>{{ s.function?.label ?? '—' }}</dd>
      <dt>Mode de paie</dt><dd>{{ s.payMode === 'FIXED' ? 'Fixe' : 'Commission' }}</dd>
      <dt>Salaire du mois</dt><dd><span class="strong">{{ monthSalary() | money }}</span> <span class="mp-sep">·</span> {{ monthLabel() }}</dd>
      <dt>Téléphone</dt><dd>{{ s.phone || '—' }}</dd>
    </dl>
    @if (s.sports.length) {
      <div class="mp-sports">@for (x of s.sports; track x.id) {<app-sport-chip [name]="x.name" [color]="x.color" [inactive]="!x.active" />}</div>
    }
  `,
})
export class StaffPreview {
  staff = input.required<StaffView>();
  /** Salary of the month shown by the page; defaults to the current month's ({@code staff.salary}). */
  salary = input<number | null>(null);
  /** "YYYY-MM" of {@code salary}; defaults to the current month. */
  month = input<string | null>(null);

  initials = computed(() => staffInitials(this.staff()));
  monthSalary = computed(() => this.salary() ?? this.staff().salary);
  monthLabel = computed(() => monthName(this.month() ?? this.staff().salaryDetail.month));
}
