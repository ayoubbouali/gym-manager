import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfigService } from '../../core/config.service';
import { FrDatePipe, MoneyPipe, monthName } from '../../core/format';
import { BusinessDue, BusinessMonth, BusinessView, MemberView } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ConfirmService } from '../../shared/confirm.service';
import { DateField } from '../../shared/date-field';
import { SelectOption } from '../../shared/multi-select';
import { Pager, Paged } from '../../shared/table';
import { today } from '../charges/charge-dialogs';
import { BusinessFormDialog, BusinessPayDialog } from './business-dialogs';

/** Club business of a month (sales and services), past or coming: what is collected and what is left to collect. */
@Component({
  selector: 'app-business',
  imports: [FormsModule, MatButtonModule, MatMenuModule, MatTooltipModule, RouterLink, LucideAngularModule, DateField, Pager, MoneyPipe, FrDatePipe],
  template: `
    <div class="toolbar">
      <button class="icon-btn" (click)="shift(-1)" aria-label="Mois précédent"><lucide-icon name="chevron-left" /></button>
      <app-date-field mode="month" label="Mois" subscriptSizing="dynamic" [ngModel]="month()" (ngModelChange)="pickMonth($event)" />
      <button class="icon-btn" (click)="shift(1)" aria-label="Mois suivant"><lucide-icon name="chevron-right" /></button>
      <h2 class="month-title">{{ title() }}</h2>
      <span class="grow"></span>
      <button mat-flat-button (click)="create()"><lucide-icon name="plus" [size]="16" /> Nouveau business</button>
    </div>

    @if (data(); as d) {
      <div class="kpis">
        <div class="kpi-card"><span class="kpi-icon green"><lucide-icon name="circle-check" /></span>
          <span><span class="kpi-label">Encaissé pour ce mois</span><span class="kpi-value">{{ d.totalPaid | money }}</span></span></div>
        <div class="kpi-card"><span class="kpi-icon red"><lucide-icon name="hourglass" /></span>
          <span><span class="kpi-label">Reste à encaisser</span><span class="kpi-value" [class.red]="d.toCollectCount > 0">{{ d.toCollectCount }}</span></span></div>
        <div class="kpi-card"><span class="kpi-icon amber"><lucide-icon name="shopping-bag" /></span>
          <span><span class="kpi-label">Montant connu à encaisser</span><span class="kpi-value">{{ d.toCollectKnown | money }}</span></span></div>
      </div>

      <div class="table-wrap">
        <table class="table compact">
          <thead><tr><th>Business</th><th>Adhérent</th><th>Catégorie</th><th>Type</th><th class="num">Montant</th><th>Statut</th><th>Encaissé le</th><th>Mode</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            @for (r of rows.page(); track r.item.id) {
              <tr>
                <td class="strong">{{ r.item.label }}@if (r.item.note) {<div class="muted small">{{ r.item.note }}</div>}</td>
                <td>@if (r.item.member; as m) {<a class="code-link" [routerLink]="['/fiche', m.code]">{{ m.code }}</a> {{ m.name }}} @else {<span class="muted">—</span>}</td>
                <td>{{ r.item.categoryLabel }}</td>
                <td>{{ type(r.item) }}</td>
                <td class="num">
                  @if (r.payment) {<span class="strong">{{ r.payment.amount | money }}</span>}
                  @else if (r.expected !== null) {{{ r.expected | money }}}
                  @else {<span class="muted">À saisir</span>}
                </td>
                <td>
                  @if (r.payment) {<span class="badge ok">Encaissé</span>}
                  @else if (r.scheduled) {<span class="badge info" matTooltip="Encaissé automatiquement quand le mois arrive">Automatique</span>}
                  @else {<span class="badge ko">À encaisser</span>}
                </td>
                <td>{{ r.payment ? (r.payment.paidOn | frDate) : '—' }}</td>
                <td>@if (r.payment) {<span [matTooltip]="r.payment.note">{{ r.payment.methodLabel }}</span>} @else {<span class="muted">—</span>}</td>
                <td class="actions">
                  @if (r.payment) {
                    @if (canManage()) {
                      <button class="icon-btn" (click)="correct(r)" matTooltip="Corriger l’encaissement" [attr.aria-label]="'Corriger l’encaissement de ' + r.item.label"><lucide-icon name="pencil" [size]="16" /></button>
                      <button class="icon-btn danger" (click)="deletePayment(r)" matTooltip="Supprimer l’encaissement" [attr.aria-label]="'Supprimer l’encaissement de ' + r.item.label"><lucide-icon name="trash-2" [size]="16" /></button>
                    }
                  } @else if (!r.scheduled) {
                    <button mat-flat-button class="sm pay-action" (click)="pay(r)">Encaisser</button>
                  }
                  <button class="icon-btn" [matMenuTriggerFor]="itemMenu" matTooltip="Actions sur le business" [attr.aria-label]="'Actions sur ' + r.item.label">
                    <lucide-icon name="ellipsis-vertical" [size]="16" /></button>
                  <mat-menu #itemMenu="matMenu" xPosition="before">
                    <button mat-menu-item (click)="edit(r.item)"><lucide-icon name="pencil" [size]="16" /> Modifier</button>
                    @if (r.item.permanent) {
                      <button mat-menu-item (click)="toggle(r.item)"><lucide-icon [name]="r.item.active ? 'power' : 'rotate-ccw'" [size]="16" />
                        {{ r.item.active ? 'Arrêter (plus dû après ce mois)' : 'Reprendre' }}</button>
                    }
                    <button mat-menu-item class="danger" (click)="remove(r.item)"><lucide-icon name="trash-2" [size]="16" /> Supprimer</button>
                  </mat-menu>
                </td>
              </tr>
            } @empty {<tr><td colspan="9" class="empty">Aucun business pour ce mois : créez-en un avec « Nouveau business ».</td></tr>}
          </tbody>
        </table>
      </div>
      <app-pager [table]="rows" />
    } @else {
      <div class="loading">Chargement…</div>
    }
  `,
})
export class BusinessPage {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private confirm = inject(ConfirmService);
  private notify = inject(NotifyService);
  private config = inject(ConfigService);
  private auth = inject(AuthService);
  canManage = computed(() => this.auth.can('MANAGE_BUSINESS'));
  month = signal(today(this.config).slice(0, 7));
  data = signal<BusinessMonth | null>(null);
  rows = new Paged(() => this.data()?.rows ?? [], () => this.config.pageSize());
  members = signal<MemberView[]>([]);
  title = computed(() => `Business de ${monthName(this.month())}`);

  constructor() {
    this.reload();
    this.api.members().then((m) => this.members.set(m)).catch(() => this.members.set([]));
  }

  async reload(): Promise<void> {
    try {
      this.data.set(await this.api.businessMonth(this.month()));
    } catch (e) {
      this.notify.error(e);
    }
  }

  type(b: BusinessView): string {
    if (!b.permanent) return `Ponctuel · ${monthName(b.period!)}`;
    const since = `Permanent${b.autoPay ? ', encaissé automatiquement,' : ''} depuis ${monthName(b.startPeriod!)}`;
    return b.endPeriod ? `${since}, arrêté après ${monthName(b.endPeriod)}` : since;
  }

  /** Members offered when linking an item: active ones, plus the one already linked. */
  private memberOptions(current?: number | null): SelectOption[] {
    return this.members().filter((m) => m.active || m.id === current)
      .map((m) => ({ id: m.id, label: `${m.code} · ${m.firstName} ${m.lastName}`, hint: m.phone }));
  }

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

  private async open(component: typeof BusinessFormDialog | typeof BusinessPayDialog, data: object, done: string): Promise<void> {
    const r = await firstValueFrom(this.dialog.open<unknown>(component, { data, width: '560px', maxWidth: '96vw' }).afterClosed());
    if (!r) return;
    this.notify.success(done);
    this.reload();
  }

  create(): Promise<void> {
    return this.open(BusinessFormDialog, { period: this.month(), members: this.memberOptions() }, 'Business créé.');
  }

  edit(b: BusinessView): Promise<void> {
    return this.open(BusinessFormDialog, { item: b, members: this.memberOptions(b.memberId) }, 'Business modifié.');
  }

  pay(r: BusinessDue): Promise<void> {
    return this.open(BusinessPayDialog, { item: r.item, period: r.period, expected: r.expected }, 'Encaissement enregistré.');
  }

  correct(r: BusinessDue): Promise<void> {
    return this.open(BusinessPayDialog, { item: r.item, period: r.period, expected: r.expected, payment: r.payment }, 'Encaissement corrigé.');
  }

  async deletePayment(r: BusinessDue): Promise<void> {
    if (!(await this.confirm.confirm({ title: `Supprimer l’encaissement de « ${r.item.label} » (${monthName(r.period)}) ?`,
      message: 'Le business redevient à encaisser pour ce mois.', confirmLabel: 'Supprimer', danger: true }))) return;
    await this.run(() => this.api.delete(`/business/payments/${r.payment!.id}`), 'Encaissement supprimé.');
  }

  async toggle(b: BusinessView): Promise<void> {
    if (b.active && !(await this.confirm.confirm({ title: `Arrêter « ${b.label} » ?`,
      message: 'Il reste dû jusqu’à ce mois-ci inclus, puis plus du tout. Ses encaissements sont conservés ; vous pourrez le reprendre.',
      confirmLabel: 'Arrêter' }))) return;
    await this.run(() => this.api.setActive('business', b.id, !b.active), b.active ? 'Business arrêté.' : 'Business repris.');
  }

  async remove(b: BusinessView): Promise<void> {
    if (!(await this.confirm.confirm({ title: `Supprimer « ${b.label} » ?`, confirmLabel: 'Supprimer', danger: true }))) return;
    await this.run(() => this.api.remove('business', b.id), 'Business supprimé.');
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
