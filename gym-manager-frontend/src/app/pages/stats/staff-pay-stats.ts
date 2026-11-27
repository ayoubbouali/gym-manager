import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { csvNumber, exportCsv } from '../../core/csv';
import { FrDatePipe, MoneyPipe, formatAmount, formatMonth, openPdf } from '../../core/format';
import { PayrollStats, SalaryPaymentView, StaffRef } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DateField } from '../../shared/date-field';
import { ChartComponent, barChart, cssColor, seriesChart } from '../../shared/chart';
import { salaryReceiptUrl } from '../../shared/payment-dialogs';
import { StatsPeriod, StatsPeriodToggle, monthsBack, rollingMonths } from '../../shared/stats-period';
import { Pager, Paged } from '../../shared/table';

/** Salary payment statistics of the staff, by salary month, optionally for one staff member. */
@Component({
  selector: 'app-staff-pay-stats',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatSelectModule, MatTooltipModule, LucideAngularModule,
    DateField, ChartComponent, StatsPeriodToggle, Pager, MoneyPipe, FrDatePipe],
  template: `
    <div class="toolbar">
      <mat-form-field subscriptSizing="dynamic" class="staff-filter">
        <mat-label>Coach / personnel</mat-label>
        <mat-select [ngModel]="staffId()" (ngModelChange)="staffId.set($event); load()">
          <mat-option [value]="null">Tout le personnel</mat-option>
          @for (o of staff(); track o.id) {<mat-option [value]="o.id">{{ o.code }} · {{ o.name }}@if (!o.active) { (inactif)}</mat-option>}
        </mat-select>
      </mat-form-field>
      <app-stats-period [value]="period()" (changed)="setPeriod($event)" />
      @if (period() === 'CUSTOM') {
        <app-date-field mode="month" label="Du mois" subscriptSizing="dynamic" [(ngModel)]="from" [max]="currentMonth" #fromField="ngModel" />
        <app-date-field mode="month" label="Au mois" subscriptSizing="dynamic" [(ngModel)]="to" [max]="currentMonth" #toField="ngModel" />
        <button mat-flat-button (click)="load()" [disabled]="!from || !to || fromField.invalid || toField.invalid">Appliquer</button>
      }
      <span class="grow"></span>
      @if (s(); as d) {<span class="muted">Salaires de {{ month(d.from) }} à {{ month(d.to) }}</span>}
    </div>

    @if (s(); as d) {
      <div class="kpis four">
        <div class="kpi-card"><span class="kpi-icon blue"><lucide-icon name="briefcase" /></span><span><span class="kpi-label">Salaires dus</span><span class="kpi-value">{{ d.totalDue | money: 0 }}</span></span></div>
        <div class="kpi-card"><span class="kpi-icon green"><lucide-icon name="circle-check" /></span><span><span class="kpi-label">Versé</span><span class="kpi-value">{{ d.totalPaid | money: 0 }}</span></span></div>
        <div class="kpi-card"><span class="kpi-icon red"><lucide-icon name="hourglass" /></span><span><span class="kpi-label">Reste à verser</span><span class="kpi-value" [class.red]="d.totalBalance > 0">{{ d.totalBalance | money: 0 }}</span></span></div>
        <div class="kpi-card"><span class="kpi-icon amber"><lucide-icon name="file-text" /></span><span><span class="kpi-label">Versements</span><span class="kpi-value">{{ d.paymentCount }}</span></span></div>
      </div>

      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h3>Salaire par coach / personnel</h3><span class="grow"></span><span class="muted small">Reste à verser</span></div>
          <app-chart [config]="staffChart()" label="Salaire restant à verser par coach / personnel" />
          <table class="table compact">
            <tbody>
              @for (x of staffRows.page(); track x.staffId) {
                <tr [class.inactive]="!x.active"><td class="strong">{{ x.name }} <span class="muted small">{{ x.code }}</span></td><td class="num" [class.red]="x.balance > 0">{{ x.balance | money }}</td></tr>
              } @empty {<tr><td colspan="2" class="empty">Aucun membre du personnel sur la période.</td></tr>}
            </tbody>
          </table>
          <app-pager [table]="staffRows" [auto]="true" />
        </section>
        <section class="card">
          <div class="card-head"><h3>Salaires dus et versés par mois</h3><span class="grow"></span>
            <button mat-stroked-button (click)="csvMonthly()"><lucide-icon name="download" [size]="16" /> CSV</button></div>
          <app-chart [config]="monthlyChart()" label="Salaires dus et versés par mois" />
          <details class="data-table-toggle">
            <summary>Voir le tableau</summary>
            <table class="table compact"><thead><tr><th>Mois</th><th class="num">Dû</th><th class="num">Versé</th><th class="num">Reste</th></tr></thead>
              <tbody>@for (m of monthlyRows.page(); track m.month) {<tr><td>{{ month(m.month) }}</td><td class="num">{{ m.due | money }}</td><td class="num">{{ m.paid | money }}</td><td class="num" [class.red]="m.balance > 0">{{ m.balance | money }}</td></tr>}</tbody></table>
            <app-pager [table]="monthlyRows" [auto]="true" />
          </details>
        </section>
      </div>

      <section class="card">
        <div class="card-head"><h3>Versements de la période</h3><span class="grow"></span>
          <button mat-stroked-button (click)="csvPayments()"><lucide-icon name="download" [size]="16" /> CSV</button></div>
        <div class="table-wrap">
          <table class="table compact">
            <thead><tr><th>Reçu</th><th>Date</th><th>Nom</th><th>Mois payé</th><th>Mode</th><th>Note</th><th class="num">Montant</th><th></th></tr></thead>
            <tbody>
              @for (p of paymentRows.page(); track p.id) {
                <tr [class.cancelled]="p.cancelled">
                  <td class="code">{{ p.slipNumber }}</td><td>{{ p.paidOn | frDate }}</td><td>{{ p.staffName }}</td><td>{{ month(p.period) }}</td>
                  <td>{{ p.methodLabel }}</td><td class="muted">{{ p.note }}</td>
                  <td class="num strong">{{ p.amount | money }} @if (p.cancelled) {<span class="badge ko">annulé</span>}</td>
                  <td class="actions"><button class="icon-btn" (click)="open(p)" matTooltip="Reçu (PDF)" [attr.aria-label]="'Reçu ' + p.slipNumber"><lucide-icon name="file-text" [size]="16" /></button></td>
                </tr>
              } @empty {<tr><td colspan="8" class="empty">Aucun versement sur la période.</td></tr>}
            </tbody>
          </table>
        </div>
        <app-pager [table]="paymentRows" [auto]="true" />
      </section>
    } @else {
      <div class="loading">Chargement…</div>
    }
  `,
  styles: `.staff-filter { width: 260px; }`,
})
export class StaffPayStats {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private config = inject(ConfigService);
  currentMonth = (this.config.config()?.today ?? new Date().toISOString()).slice(0, 7);
  s = signal<PayrollStats | null>(null);
  staff = signal<StaffRef[]>([]);
  staffId = signal<number | null>(null);
  /** Default: custom period on the current month. */
  period = signal<StatsPeriod>('CUSTOM');
  from: string | null = this.currentMonth;
  to: string | null = this.currentMonth;
  month = (ym: string) => formatMonth(ym, true);
  monthlyRows = new Paged(() => this.s()?.monthly ?? []);
  paymentRows = new Paged(() => this.s()?.payments ?? [], () => this.config.pageSize());

  private money = (v: number) => `${formatAmount(v, 0)} ${this.config.currency()}`;
  monthlyChart = computed(() => {
    const d = this.s()!;
    return seriesChart(d.monthly.map((m) => formatMonth(m.month)), [
      { label: 'Dû', data: d.monthly.map((m) => m.due), color: cssColor('--muted', '#9ca3af') },
      { label: 'Versé', data: d.monthly.map((m) => m.paid), color: cssColor('--brand', '#C62828') },
    ], this.money);
  });

  /** Staff sorted by amount still to pay, largest first. */
  toPay = computed(() => [...(this.s()?.byStaff ?? [])].sort((a, b) => b.balance - a.balance || a.code.localeCompare(b.code)));
  staffRows = new Paged(() => this.toPay());
  staffChart = computed(() => {
    const rows = this.toPay();
    return barChart(rows.map((x) => x.name), rows.map((x) => x.balance), '#f97316', this.money, true);
  });

  constructor() {
    this.api.staffOptions().then((o) => this.staff.set(o)).catch((e) => this.notify.error(e));
    this.load();
  }

  setPeriod(p: StatsPeriod): void {
    this.period.set(p);
    const n = rollingMonths(p);
    if (p === 'YEAR') this.from = `${this.currentMonth.slice(0, 4)}-01`;
    if (n) this.from = monthsBack(this.currentMonth, n);
    if (p !== 'CUSTOM') {
      this.to = this.currentMonth;
      this.load();
    }
  }

  async load(): Promise<void> {
    try {
      const p = this.period();
      this.s.set(await this.api.payrollStats(p === 'LAST12' ? undefined : this.from ?? undefined, p === 'LAST12' ? undefined : this.to ?? undefined, this.staffId()));
    } catch (e) {
      this.notify.error(e);
    }
  }

  open(p: SalaryPaymentView): void {
    openPdf(salaryReceiptUrl(p));
  }

  private suffix(): string {
    const d = this.s()!;
    const who = d.staffId ? `-${this.staff().find((o) => o.id === d.staffId)?.code ?? d.staffId}` : '';
    return `${d.from}_${d.to}${who}`;
  }

  csvMonthly(): void {
    exportCsv(`salaires-mensuels-${this.suffix()}`, [
      { header: 'Mois', value: (m) => formatMonth(m.month, true) }, { header: 'Dû', value: (m) => csvNumber(m.due) },
      { header: 'Versé', value: (m) => csvNumber(m.paid) }, { header: 'Reste', value: (m) => csvNumber(m.balance) },
    ], this.s()?.monthly ?? []);
  }

  csvPayments(): void {
    exportCsv(`versements-salaires-${this.suffix()}`, [
      { header: 'Reçu', value: (p) => p.slipNumber }, { header: 'Date', value: (p) => p.paidOn }, { header: 'ID', value: (p) => p.staffCode },
      { header: 'Nom', value: (p) => p.staffName }, { header: 'Mois payé', value: (p) => formatMonth(p.period, true) },
      { header: 'Mode', value: (p) => p.methodLabel }, { header: 'Montant', value: (p) => csvNumber(p.amount) },
      { header: 'Annulé', value: (p) => (p.cancelled ? 'Oui' : 'Non') }, { header: 'Note', value: (p) => p.note },
    ], this.s()?.payments ?? []);
  }
}
