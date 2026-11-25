import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfigService } from '../../core/config.service';
import { csvNumber, exportCsv } from '../../core/csv';
import { FrDatePipe, MoneyPipe, PAYMENT_METHODS, formatDate, openPdf } from '../../core/format';
import { PaymentView } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DateField } from '../../shared/date-field';
import { cancelWithReason, openPaymentDialog, receiptUrl } from '../../shared/payment-dialogs';
import { Pager, SortHeader, TableState } from '../../shared/table';

type Period = 'MONTH' | 'LAST_MONTH' | 'YEAR' | 'CUSTOM';

/** Cash journal: every payment with its receipt, totals per payment method. */
@Component({
  selector: 'app-payments',
  imports: [RouterLink, FormsModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatSlideToggleModule, MatTooltipModule, LucideAngularModule, DateField, SortHeader, Pager, MoneyPipe, FrDatePipe],
  template: `
    <div class="toolbar">
      <mat-button-toggle-group [ngModel]="period()" (ngModelChange)="setPeriod($event)" aria-label="Période">
        <mat-button-toggle value="MONTH">Ce mois</mat-button-toggle>
        <mat-button-toggle value="LAST_MONTH">Mois dernier</mat-button-toggle>
        <mat-button-toggle value="YEAR">Année</mat-button-toggle>
        <mat-button-toggle value="CUSTOM">Personnalisée</mat-button-toggle>
      </mat-button-toggle-group>
      @if (period() === 'CUSTOM') {
        <app-date-field label="Du" subscriptSizing="dynamic" [(ngModel)]="from" #fromField="ngModel" />
        <app-date-field label="Au" subscriptSizing="dynamic" [(ngModel)]="to" #toField="ngModel" />
        <button mat-flat-button (click)="load()" [disabled]="fromField.invalid || toField.invalid">Appliquer</button>
      }
      <span class="grow"></span>
      <span class="muted">Du {{ from | frDate }} au {{ to | frDate }}</span>
    </div>

    <div class="kpis four">
      <div class="kpi-card"><span class="kpi-icon green"><lucide-icon name="wallet" /></span>
        <span><span class="kpi-label">Total encaissé</span><span class="kpi-value">{{ total() | money }}</span></span></div>
      @for (m of byMethod(); track m.value) {
        <div class="kpi-card"><span class="kpi-icon" [class.blue]="m.value === 'CARTE'" [class.amber]="m.value === 'ESPECES'" [class.green]="m.value === 'VIREMENT'">
          <lucide-icon [name]="m.value === 'CARTE' ? 'credit-card' : m.value === 'ESPECES' ? 'banknote' : 'landmark'" /></span>
          <span><span class="kpi-label">{{ m.label }}</span><span class="kpi-value sm">{{ m.amount | money }}</span><span class="kpi-sub">{{ m.count }} paiement(s)</span></span></div>
      }
    </div>

    <div class="toolbar">
      <label class="search grow"><lucide-icon name="search" [size]="18" />
        <input type="search" placeholder="Rechercher un reçu, un adhérent…" [ngModel]="t.search()" (ngModelChange)="t.setSearch($event)" aria-label="Rechercher un paiement" /></label>
      <mat-form-field subscriptSizing="dynamic" class="w-200"><mat-label>Mode</mat-label>
        <mat-select [ngModel]="fMethod()" (ngModelChange)="fMethod.set($event); t.resetPage()">
          <mat-option [value]="null">Tous</mat-option>
          @for (m of methods; track m.value) {<mat-option [value]="m.value">{{ m.label }}</mat-option>}
        </mat-select>
      </mat-form-field>
      <mat-slide-toggle [ngModel]="t.showInactive()" (ngModelChange)="t.showInactive.set($event)">Afficher les annulés</mat-slide-toggle>
      <button mat-stroked-button (click)="csv()"><lucide-icon name="download" [size]="16" /> CSV</button>
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr>
          <th [attr.aria-sort]="t.ariaSort('number')"><app-sort [table]="t" key="number">N° reçu</app-sort></th>
          <th [attr.aria-sort]="t.ariaSort('date')"><app-sort [table]="t" key="date">Date</app-sort></th>
          <th [attr.aria-sort]="t.ariaSort('member')"><app-sort [table]="t" key="member">Adhérent</app-sort></th>
          <th>Abonnement / période</th>
          <th [attr.aria-sort]="t.ariaSort('method')"><app-sort [table]="t" key="method">Mode</app-sort></th>
          <th class="num" [attr.aria-sort]="t.ariaSort('amount')"><app-sort [table]="t" key="amount">Montant</app-sort></th>
          <th>Encaissé par</th><th><span class="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>
          @for (p of t.page(); track p.id) {
            <tr [class.cancelled]="p.cancelled">
              <td class="code">{{ p.receiptNumber }}</td>
              <td>{{ p.paidOn | frDate }}</td>
              <td><a class="code-link" [routerLink]="['/fiche', p.memberCode]">{{ p.memberCode }}</a> {{ p.memberName }}</td>
              <td>{{ p.packName }} <small class="muted">({{ p.periodStart | frDate }} → {{ p.periodEnd | frDate }})</small></td>
              <td>{{ p.methodLabel }}</td>
              <td class="num strong">{{ p.amount | money }}</td>
              <td class="muted">{{ p.createdBy }} @if (p.cancelled) {<span class="badge ko" [matTooltip]="(p.cancelReason ?? '') + ' — ' + (p.cancelledBy ?? '')">annulé</span>}</td>
              <td class="actions">
                <button class="icon-btn" (click)="open(p)" matTooltip="Voir le reçu (PDF)" [attr.aria-label]="'Reçu ' + p.receiptNumber"><lucide-icon name="file-text" [size]="16" /></button>
                @if (canManage() && !p.cancelled) {
                  <button class="icon-btn" (click)="edit(p)" matTooltip="Modifier" [attr.aria-label]="'Modifier ' + p.receiptNumber"><lucide-icon name="pencil" [size]="16" /></button>
                  <button class="icon-btn danger" (click)="cancel(p)" matTooltip="Annuler le paiement" [attr.aria-label]="'Annuler ' + p.receiptNumber"><lucide-icon name="ban" [size]="16" /></button>
                }
              </td>
            </tr>
          } @empty {<tr><td colspan="8" class="empty">Aucun paiement sur la période.</td></tr>}
        </tbody>
      </table>
    </div>
    <app-pager [table]="t" />
  `,
})
export class PaymentsPage {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private notify = inject(NotifyService);
  private config = inject(ConfigService);
  private auth = inject(AuthService);
  canManage = computed(() => this.auth.can('MANAGE_PAYMENTS'));
  methods = PAYMENT_METHODS;
  period = signal<Period>('MONTH');
  fMethod = signal<string | null>(null);
  from = '';
  to = '';

  t = new TableState<PaymentView>({
    searchText: (p) => `${p.receiptNumber} ${p.memberCode} ${p.memberName} ${p.packName} ${p.note} ${p.createdBy}`,
    sort: { number: (p) => p.receiptNumber, date: (p) => p.paidOn, member: (p) => p.memberName, method: (p) => p.methodLabel, amount: (p) => p.amount },
    defaultSort: { key: 'date', dir: 'desc' },
    isActive: (p) => !p.cancelled,
    filter: () => {
      const m = this.fMethod();
      return (p) => !m || p.method === m;
    },
    pageSize: computed(() => this.config.pageSize()),
  });

  private valid = computed(() => this.t.rows().filter((p) => !p.cancelled));
  total = computed(() => this.valid().reduce((a, p) => a + p.amount, 0));
  byMethod = computed(() => PAYMENT_METHODS.map((m) => {
    const list = this.valid().filter((p) => p.method === m.value);
    return { ...m, count: list.length, amount: list.reduce((a, p) => a + p.amount, 0) };
  }));

  constructor() {
    this.setPeriod('MONTH');
  }

  setPeriod(p: Period): void {
    this.period.set(p);
    const today = this.config.config()?.today ?? new Date().toISOString().slice(0, 10);
    const [y, m] = today.split('-').map(Number);
    const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
    const iso = (yy: number, mm: number, dd: number) => `${yy}-${String(mm).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
    if (p === 'MONTH') [this.from, this.to] = [iso(y, m, 1), today];
    if (p === 'LAST_MONTH') {
      const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
      [this.from, this.to] = [iso(py, pm, 1), iso(py, pm, last(py, pm))];
    }
    if (p === 'YEAR') [this.from, this.to] = [iso(y, 1, 1), today];
    if (p !== 'CUSTOM') this.load();
  }

  async load(): Promise<void> {
    try {
      this.t.rows.set(await this.api.payments(this.from, this.to));
      this.t.resetPage();
    } catch (e) {
      this.notify.error(e);
    }
  }

  open(p: PaymentView): void {
    openPdf(receiptUrl(p));
  }

  async edit(p: PaymentView): Promise<void> {
    if (await openPaymentDialog(this.dialog, { memberId: p.memberId, memberLabel: `${p.memberCode} — ${p.memberName}`, payment: p })) {
      this.notify.success(`Paiement ${p.receiptNumber} modifié.`);
      this.load();
    }
  }

  async cancel(p: PaymentView): Promise<void> {
    if (await cancelWithReason(this.dialog, `Annuler le paiement ${p.receiptNumber} ?`, (reason) => this.api.post(`/payments/${p.id}/cancel`, { reason }))) {
      this.notify.success(`Paiement ${p.receiptNumber} annulé.`);
      this.load();
    }
  }

  csv(): void {
    exportCsv(`paiements-${this.from}-${this.to}`, [
      { header: 'N° reçu', value: (p) => p.receiptNumber }, { header: 'Date', value: (p) => formatDate(p.paidOn) },
      { header: 'Code adhérent', value: (p) => p.memberCode }, { header: 'Adhérent', value: (p) => p.memberName },
      { header: 'Abonnement', value: (p) => p.packName }, { header: 'Période', value: (p) => `${formatDate(p.periodStart)} - ${formatDate(p.periodEnd)}` },
      { header: 'Mode', value: (p) => p.methodLabel }, { header: 'Montant', value: (p) => csvNumber(p.amount) },
      { header: 'Encaissé par', value: (p) => p.createdBy }, { header: 'Statut', value: (p) => (p.cancelled ? `Annulé (${p.cancelReason})` : 'Valide') },
      { header: 'Note', value: (p) => p.note },
    ], this.t.filtered());
  }
}
