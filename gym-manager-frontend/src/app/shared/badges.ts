import { Component, computed, input } from '@angular/core';
import { MEMBER_STATE_LABELS, MoneyPipe, SITUATION_LABELS } from '../core/format';
import { MemberView } from '../core/models';

@Component({
  selector: 'app-sport-chip',
  template: `<span class="chip" [class.chip-inactive]="inactive()"><i class="dot" [style.background]="color()"></i>{{ name() }}</span>`,
})
export class SportChip {
  name = input.required<string>();
  color = input<string>('#999');
  inactive = input(false);
}

/** Payé (green) / Partiel (orange) / Impayé (red), "—" without status. Also used for the insurance (Payé / Impayé). */
@Component({
  selector: 'app-paid-badge',
  template: `@if (value(); as v) {<span class="badge" [class.ok]="v === 'PAYE'" [class.warn]="v === 'PARTIEL'" [class.ko]="v === 'IMPAYE'">{{ label() }}</span>} @else {<span class="muted">—</span>}`,
})
export class PaidBadge {
  value = input.required<string | null>();
  label = computed(() => ({ PAYE: 'Payé', PARTIEL: 'Partiel', IMPAYE: 'Impayé' } as Record<string, string>)[this.value() ?? ''] ?? this.value());
}

@Component({
  selector: 'app-situation-badge',
  template: `<span class="badge" [class]="cls()">{{ label() }}</span>`,
})
export class SituationBadge {
  value = input.required<string>();
  label = computed(() => SITUATION_LABELS[this.value()] ?? this.value());
  cls = computed(() => 'badge ' + ({ EXPIRED: 'ko', SOON: 'warn', FOLLOW: 'info', OK: 'ok', NONE: 'neutral' } as Record<string, string>)[this.value()]);
}

/** Member state badge followed by its detail: days since expiry, days left, amount still due. */
@Component({
  selector: 'app-state-badge',
  imports: [MoneyPipe],
  template: `@let m = member();
    <span [class]="cls()">{{ label() }}</span>
    @switch (m.state) {
      @case ('EXPIRED') {<span class="state-detail">depuis {{ -(m.remainingDays ?? 0) }} j</span>}
      @case ('SOON') {<span class="state-detail">J-{{ m.remainingDays }}</span>}
    }
    @if (m.state !== 'NONE' && m.balance > 0) {
      <span class="state-detail" [class.red]="m.state === 'EXPIRED' || m.state === 'UNPAID'" [class.state-due]="m.state === 'SOON' || m.state === 'UP_TO_DATE'">reste {{ m.balance | money }}</span>
    }`,
})
export class StateBadge {
  member = input.required<Pick<MemberView, 'state' | 'remainingDays' | 'balance'>>();
  label = computed(() => MEMBER_STATE_LABELS[this.member().state] ?? this.member().state);
  cls = computed(() => 'badge ' + ({ EXPIRED: 'ko', UNPAID: 'ko', SOON: 'warn', UP_TO_DATE: 'ok', NONE: 'neutral' } as Record<string, string>)[this.member().state]);
}

@Component({
  selector: 'app-active-badge',
  template: `<span class="badge" [class.ok]="active()" [class.neutral]="!active()">{{ active() ? 'Oui' : 'Non' }}</span>`,
})
export class ActiveBadge {
  active = input.required<boolean>();
}

/** Remaining days: "Expiré depuis N j" in red when negative, "—" without subscription. */
@Component({
  selector: 'app-days',
  template: `@let d = days();
    @if (d === null) {<span class="muted">—</span>} @else if (d < 0) {<span class="red">Expiré depuis {{ -d }} j</span>} @else {<span>{{ d }} j</span>}`,
})
export class DaysLeft {
  days = input.required<number | null>();
}
