import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfigService } from '../../core/config.service';
import { FrDatePipe, MoneyPipe, monthName } from '../../core/format';
import { ChargeDue, ChargeMonth, ChargeView } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ConfirmService } from '../../shared/confirm.service';
import { DateField } from '../../shared/date-field';
import { ChargeFormDialog, ChargePayDialog, today } from './charge-dialogs';

/** Club charges of a month, past or coming: their payments and the actions on each charge (edit, stop, delete). */
@Component({
  selector: 'app-charges',
  imports: [FormsModule, MatButtonModule, MatMenuModule, MatTooltipModule, LucideAngularModule, DateField, MoneyPipe, FrDatePipe],
  template: `
    <div class="toolbar">
      <button class="icon-btn" (click)="shift(-1)" aria-label="Mois précédent"><lucide-icon name="chevron-left" /></button>
      <app-date-field mode="month" label="Mois" subscriptSizing="dynamic" [ngModel]="month()" (ngModelChange)="pickMonth($event)" />
      <button class="icon-btn" (click)="shift(1)" aria-label="Mois suivant"><lucide-icon name="chevron-right" /></button>
      <h2 class="month-title">{{ title() }}</h2>
      <span class="grow"></span>
      <button mat-flat-button (click)="create()"><lucide-icon name="plus" [size]="16" /> Nouvelle charge</button>
    </div>

    @if (data(); as d) {
      <div class="kpis">
        <div class="kpi-card"><span class="kpi-icon green"><lucide-icon name="circle-check" /></span>
          <span><span class="kpi-label">Réglé pour ce mois</span><span class="kpi-value">{{ d.totalPaid | money }}</span></span></div>
        <div class="kpi-card"><span class="kpi-icon red"><lucide-icon name="hourglass" /></span>
          <span><span class="kpi-label">Charges à régler</span><span class="kpi-value" [class.red]="d.toPayCount > 0">{{ d.toPayCount }}</span></span></div>
        <div class="kpi-card"><span class="kpi-icon amber"><lucide-icon name="receipt" /></span>
          <span><span class="kpi-label">Montant connu à régler</span><span class="kpi-value">{{ d.toPayKnown | money }}</span></span></div>
      </div>

      <div class="table-wrap">
        <table class="table compact">
          <thead><tr><th>Charge</th><th>Catégorie</th><th>Type</th><th class="num">Montant</th><th>Statut</th><th>Réglée le</th><th>Mode</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            @for (r of d.rows; track r.charge.id) {
              <tr>
                <td class="strong">{{ r.charge.label }}@if (r.charge.note) {<div class="muted small">{{ r.charge.note }}</div>}</td>
                <td>{{ r.charge.categoryLabel }}</td>
                <td>{{ type(r.charge) }}</td>
                <td class="num">
                  @if (r.payment) {<span class="strong">{{ r.payment.amount | money }}</span>}
                  @else if (r.expected !== null) {{{ r.expected | money }}}
                  @else {<span class="muted">À saisir</span>}
                </td>
                <td>
                  @if (r.payment) {<span class="badge ok">Réglée</span>}
                  @else if (r.scheduled) {<span class="badge info" matTooltip="Réglée automatiquement quand le mois arrive">Automatique</span>}
                  @else {<span class="badge ko">À régler</span>}
                </td>
                <td>{{ r.payment ? (r.payment.paidOn | frDate) : '—' }}</td>
                <td>@if (r.payment) {<span [matTooltip]="r.payment.note">{{ r.payment.methodLabel }}</span>} @else {<span class="muted">—</span>}</td>
                <td class="actions">
                  @if (r.payment) {
                    @if (canManage()) {
                      <button class="icon-btn" (click)="correct(r)" matTooltip="Corriger le règlement" [attr.aria-label]="'Corriger le règlement de ' + r.charge.label"><lucide-icon name="pencil" [size]="16" /></button>
                      <button class="icon-btn danger" (click)="deletePayment(r)" matTooltip="Supprimer le règlement" [attr.aria-label]="'Supprimer le règlement de ' + r.charge.label"><lucide-icon name="trash-2" [size]="16" /></button>
                    }
                  } @else if (!r.scheduled) {
                    <button mat-flat-button class="sm pay-action" (click)="pay(r)">Régler</button>
                  }
                  <button class="icon-btn" [matMenuTriggerFor]="chargeMenu" matTooltip="Actions sur la charge" [attr.aria-label]="'Actions sur la charge ' + r.charge.label">
                    <lucide-icon name="ellipsis-vertical" [size]="16" /></button>
                  <mat-menu #chargeMenu="matMenu" xPosition="before">
                    <button mat-menu-item (click)="edit(r.charge)"><lucide-icon name="pencil" [size]="16" /> Modifier la charge</button>
                    @if (r.charge.permanent) {
                      <button mat-menu-item (click)="toggle(r.charge)"><lucide-icon [name]="r.charge.active ? 'power' : 'rotate-ccw'" [size]="16" />
                        {{ r.charge.active ? 'Arrêter (plus due après ce mois)' : 'Reprendre' }}</button>
                    }
                    <button mat-menu-item class="danger" (click)="remove(r.charge)"><lucide-icon name="trash-2" [size]="16" /> Supprimer la charge</button>
                  </mat-menu>
                </td>
              </tr>
            } @empty {<tr><td colspan="8" class="empty">Aucune charge pour ce mois : créez-en une avec « Nouvelle charge ».</td></tr>}
          </tbody>
        </table>
      </div>
    } @else {
      <div class="loading">Chargement…</div>
    }
  `,
})
export class ChargesPage {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private confirm = inject(ConfirmService);
  private notify = inject(NotifyService);
  private config = inject(ConfigService);
  private auth = inject(AuthService);
  canManage = computed(() => this.auth.can('MANAGE_CHARGES'));
  month = signal(today(this.config).slice(0, 7));
  data = signal<ChargeMonth | null>(null);
  title = computed(() => `Charges de ${monthName(this.month())}`);

  constructor() {
    this.reload();
  }

  async reload(): Promise<void> {
    try {
      this.data.set(await this.api.chargeMonth(this.month()));
    } catch (e) {
      this.notify.error(e);
    }
  }

  type(c: ChargeView): string {
    if (!c.permanent) return `Ponctuelle · ${monthName(c.period!)}`;
    const since = `Permanente${c.autoPay ? ', réglée automatiquement,' : ''} depuis ${monthName(c.startPeriod!)}`;
    return c.endPeriod ? `${since}, arrêtée après ${monthName(c.endPeriod)}` : since;
  }

  /** Typed or picked month; an incomplete or invalid entry (null) keeps the current one. */
  pickMonth(value: string | null): void {
    if (!value || value === this.month()) return;
    this.month.set(value);
    this.reload();
  }

  shift(delta: number): void {
    const [y, m] = this.month().split('-').map(Number);
    const d = new Date(Date.UTC(y, m - 1 + delta, 1));
    this.month.set(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
    this.reload();
  }

  private async open(component: typeof ChargeFormDialog | typeof ChargePayDialog, data: object, done: string): Promise<void> {
    const r = await firstValueFrom(this.dialog.open<unknown>(component, { data, width: '520px', maxWidth: '96vw' }).afterClosed());
    if (!r) return;
    this.notify.success(done);
    this.reload();
  }

  create(): Promise<void> {
    return this.open(ChargeFormDialog, { period: this.month() }, 'Charge créée.');
  }

  edit(c: ChargeView): Promise<void> {
    return this.open(ChargeFormDialog, { charge: c }, 'Charge modifiée.');
  }

  pay(r: ChargeDue): Promise<void> {
    return this.open(ChargePayDialog, { charge: r.charge, period: r.period, expected: r.expected }, 'Règlement enregistré.');
  }

  correct(r: ChargeDue): Promise<void> {
    return this.open(ChargePayDialog, { charge: r.charge, period: r.period, expected: r.expected, payment: r.payment }, 'Règlement corrigé.');
  }

  async deletePayment(r: ChargeDue): Promise<void> {
    if (!(await this.confirm.confirm({ title: `Supprimer le règlement de « ${r.charge.label} » (${monthName(r.period)}) ?`,
      message: 'La charge redevient à régler pour ce mois.', confirmLabel: 'Supprimer', danger: true }))) return;
    await this.run(() => this.api.delete(`/charges/payments/${r.payment!.id}`), 'Règlement supprimé.');
  }

  async toggle(c: ChargeView): Promise<void> {
    if (c.active && !(await this.confirm.confirm({ title: `Arrêter la charge « ${c.label} » ?`,
      message: 'Elle reste due jusqu’à ce mois-ci inclus, puis plus du tout. Ses règlements sont conservés ; vous pourrez la reprendre.',
      confirmLabel: 'Arrêter' }))) return;
    await this.run(() => this.api.setActive('charges', c.id, !c.active), c.active ? 'Charge arrêtée.' : 'Charge reprise.');
  }

  async remove(c: ChargeView): Promise<void> {
    if (!(await this.confirm.confirm({ title: `Supprimer la charge « ${c.label} » ?`, confirmLabel: 'Supprimer', danger: true }))) return;
    await this.run(() => this.api.remove('charges', c.id), 'Charge supprimée.');
  }

  private async run(action: () => Promise<unknown>, done: string): Promise<void> {
    try {
      await action();
      this.notify.success(done);
      this.reload();
    } catch (e) {
      this.notify.error(e);
    }
  }
}
