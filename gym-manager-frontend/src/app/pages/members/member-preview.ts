import { Component, computed, input, signal } from '@angular/core';
import { FrDatePipe, MoneyPipe } from '../../core/format';
import { MemberView } from '../../core/models';
import { DaysLeft, PaidBadge, SportChip, StateBadge } from '../../shared/badges';

/** Read-only summary card shown when hovering or focusing a member ID. */
@Component({
  selector: 'app-member-preview',
  imports: [StateBadge, PaidBadge, DaysLeft, SportChip, MoneyPipe, FrDatePipe],
  host: { class: 'member-preview', role: 'tooltip' },
  template: `
    @let m = member();
    <div class="mp-banner"></div>
    <div class="mp-head">
      @if (showPhoto()) {
        <img class="mp-photo" [src]="photoUrl()" alt="" (error)="failedFor.set(m.id)" />
      } @else {
        <div class="mp-photo mp-initials" aria-hidden="true">{{ initials() }}</div>
      }
      <div class="mp-identity">
        <div class="mp-name">{{ m.lastName }} {{ m.firstName }}</div>
        <div class="mp-tags">
          <span class="mp-code">{{ m.code }}</span>
          @if (!m.active) {<span class="badge neutral mp-inactive">Inactif</span>}
          <app-state-badge [member]="m" />
        </div>
      </div>
    </div>
    <dl class="mp-grid">
      <dt>Abonnement</dt><dd>{{ m.pack?.name ?? '—' }}</dd>
      <dt>Fin</dt><dd>{{ m.endDate | frDate }} @if (m.remainingDays !== null) {<span class="mp-sep">·</span> <app-days [days]="m.remainingDays" />}</dd>
      <dt>Paiement</dt><dd><app-paid-badge [value]="m.paymentStatus" /></dd>
      @if (m.balance > 0) {<dt>Reste à payer</dt><dd class="red">{{ m.balance | money }}</dd>}
      <dt>Téléphone</dt><dd>{{ m.phone || '—' }}</dd>
      <dt>Assurance</dt><dd><app-paid-badge [value]="m.insurance" /></dd>
    </dl>
    @if (m.sports.length) {
      <div class="mp-sports">@for (s of m.sports; track s.id) {<app-sport-chip [name]="s.name" [color]="s.color" [inactive]="!s.active" />}</div>
    }
    @if (m.notes.trim()) {<p class="mp-note">{{ m.notes }}</p>}
  `,
})
export class MemberPreview {
  member = input.required<MemberView>();

  /** Id of the member whose photo failed to load: falls back to initials without leaking to the next member. */
  failedFor = signal<number | null>(null);
  showPhoto = computed(() => this.member().hasPhoto && this.failedFor() !== this.member().id);
  photoUrl = computed(() => `/api/members/${this.member().id}/photo`);
  initials = computed(() => `${this.member().firstName.charAt(0)}${this.member().lastName.charAt(0)}`.toUpperCase());
}
