import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { csvNumber, exportCsv } from '../../core/csv';
import { FrDatePipe, MoneyPipe, formatAmount, formatMonth } from '../../core/format';
import { ChargeCategory, ChargeStats as Stats } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ChartComponent, pieChart, seriesChart, seriesColor, share } from '../../shared/chart';
import { DateField } from '../../shared/date-field';

type Period = 'LAST12' | 'YEAR' | 'CUSTOM';

/** Fixed slice order and color slot of each category: a category keeps its color whatever the period. */
const CATEGORY_ORDER: ChargeCategory[] = ['ELECTRICITE', 'EAU', 'INTERNET', 'LOYER', 'MENAGE', 'ENTRETIEN', 'AUTRE'];

/** Charges by month concerned, still to pay, and profit = revenue − salaries − charges (RG-CHARGE). */
@Component({
  selector: 'app-charge-stats',
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, LucideAngularModule, DateField, ChartComponent, MoneyPipe, FrDatePipe],
  template: `
    <div class="toolbar">
      <mat-button-toggle-group [ngModel]="period()" (ngModelChange)="setPeriod($event)" aria-label="Période">
        <mat-button-toggle value="LAST12">12 derniers mois</mat-button-toggle>
        <mat-button-toggle value="YEAR">Année en cours</mat-button-toggle>
        <mat-button-toggle value="CUSTOM">Période personnalisée</mat-button-toggle>
      </mat-button-toggle-group>
      @if (period() === 'CUSTOM') {
        <app-date-field mode="month" label="Du mois" subscriptSizing="dynamic" [(ngModel)]="from" [max]="currentMonth" #fromField="ngModel" />
        <app-date-field mode="month" label="Au mois" subscriptSizing="dynamic" [(ngModel)]="to" [max]="currentMonth" #toField="ngModel" />
        <button mat-flat-button (click)="load()" [disabled]="!from || !to || fromField.invalid || toField.invalid">Appliquer</button>
      }
      <span class="grow"></span>
      @if (s(); as d) {<span class="muted">De {{ month(d.from) }} à {{ month(d.to) }}</span>}
    </div>

    @if (s(); as d) {
      <div class="kpis four">
        <div class="kpi-card"><span class="kpi-icon green"><lucide-icon name="trending-up" /></span><span><span class="kpi-label">Revenus encaissés</span><span class="kpi-value">{{ d.revenue | money: 0 }}</span></span></div>
        <div class="kpi-card"><span class="kpi-icon blue"><lucide-icon name="briefcase" /></span><span><span class="kpi-label">Salaires versés</span><span class="kpi-value">{{ d.salaries | money: 0 }}</span></span></div>
        <div class="kpi-card"><span class="kpi-icon amber"><lucide-icon name="receipt" /></span><span><span class="kpi-label">Charges réglées</span><span class="kpi-value">{{ d.totalCharges | money: 0 }}</span></span></div>
        <div class="kpi-card"><span class="kpi-icon" [class.green]="d.profit >= 0" [class.red]="d.profit < 0"><lucide-icon [name]="d.profit >= 0 ? 'trending-up' : 'trending-down'" /></span>
          <span><span class="kpi-label">Bénéfice</span><span class="kpi-value" [class.red]="d.profit < 0">{{ d.profit | money: 0 }}</span></span></div>
      </div>
      <p class="muted small note">
        Bénéfice = revenus encaissés (à la date du paiement) − salaires versés − charges réglées (au mois qu’ils concernent).
        @if (d.toPayCount) {<strong class="red">{{ d.toPayCount }} charge(s) encore à régler</strong>@if (d.toPayKnown > 0) {, dont {{ d.toPayKnown | money }} de montants connus} : elles ne sont pas déduites.}
      </p>

      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h3>Revenus, salaires et charges par mois</h3><span class="grow"></span>
            <button mat-stroked-button (click)="csvMonthly()"><lucide-icon name="download" [size]="16" /> CSV</button></div>
          <app-chart [config]="monthlyChart()" label="Revenus, salaires et charges par mois" />
          <details class="data-table-toggle">
            <summary>Voir le tableau</summary>
            <table class="table compact"><thead><tr><th>Mois</th><th class="num">Revenus</th><th class="num">Salaires</th><th class="num">Charges</th><th class="num">Bénéfice</th></tr></thead>
              <tbody>@for (m of d.monthly; track m.month) {<tr><td>{{ month(m.month) }}</td><td class="num">{{ m.revenue | money }}</td><td class="num">{{ m.salaries | money }}</td>
                <td class="num">{{ m.charges | money }}</td><td class="num strong" [class.red]="m.profit < 0">{{ m.profit | money }}</td></tr>}</tbody></table>
          </details>
        </section>
        <section class="card">
          <div class="card-head"><h3>Charges réglées par catégorie</h3></div>
          @if (categories().length) {
            <app-chart [config]="categoryChart()" label="Charges réglées par catégorie" />
            <table class="table compact"><tbody>
              @for (c of categories(); track c.category) {
                <tr><td><i class="dot" [style.background]="c.color"></i> {{ c.label }}</td><td class="num">{{ c.amount | money }}</td><td class="num muted">{{ c.share }}</td></tr>
              }
            </tbody></table>
          } @else {<p class="empty">Aucune charge réglée sur la période.</p>}
        </section>
      </div>

      <section class="card">
        <div class="card-head"><h3>Charges à régler</h3></div>
        <div class="table-wrap">
          <table class="table compact">
            <thead><tr><th>Mois</th><th>Charge</th><th>Catégorie</th><th>Type</th><th class="num">Montant connu</th></tr></thead>
            <tbody>
              @for (r of d.toPay; track r.charge.id + r.period) {
                <tr><td>{{ month(r.period) }}</td><td class="strong">{{ r.charge.label }}</td><td>{{ r.charge.categoryLabel }}</td>
                  <td>{{ r.charge.permanent ? 'Permanente' : 'Ponctuelle' }}</td>
                  <td class="num">@if (r.expected !== null) {{{ r.expected | money }}} @else {<span class="muted">À saisir</span>}</td></tr>
              } @empty {<tr><td colspan="5" class="empty">Tout est réglé sur la période.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h3>Règlements de la période</h3><span class="grow"></span>
          <button mat-stroked-button (click)="csvPaid()"><lucide-icon name="download" [size]="16" /> CSV</button></div>
        <div class="table-wrap">
          <table class="table compact">
            <thead><tr><th>Mois</th><th>Charge</th><th>Catégorie</th><th>Réglée le</th><th>Mode</th><th>Note</th><th class="num">Montant</th></tr></thead>
            <tbody>
              @for (r of d.paid; track r.payment!.id) {
                <tr><td>{{ month(r.period) }}</td><td class="strong">{{ r.charge.label }}</td><td>{{ r.charge.categoryLabel }}</td>
                  <td>{{ r.payment!.paidOn | frDate }}</td><td>{{ r.payment!.methodLabel }}</td><td class="muted">{{ r.payment!.note }}</td>
                  <td class="num strong">{{ r.payment!.amount | money }}</td></tr>
              } @empty {<tr><td colspan="7" class="empty">Aucun règlement sur la période.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    } @else {
      <div class="loading">Chargement…</div>
    }
  `,
  styles: `.note { margin: -6px 0 18px; } .red { color: var(--ko); }`,
})
export class ChargeStats {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private config = inject(ConfigService);
  currentMonth = (this.config.config()?.today ?? new Date().toISOString()).slice(0, 7);
  s = signal<Stats | null>(null);
  /** Default: custom period on the current month. */
  period = signal<Period>('CUSTOM');
  from: string | null = this.currentMonth;
  to: string | null = this.currentMonth;
  month = (ym: string) => formatMonth(ym, true);

  private money = (v: number) => `${formatAmount(v, 0)} ${this.config.currency()}`;
  monthlyChart = computed(() => {
    const d = this.s()!;
    return seriesChart(d.monthly.map((m) => formatMonth(m.month)), [
      { label: 'Revenus', data: d.monthly.map((m) => m.revenue), color: seriesColor(1) },
      { label: 'Salaires', data: d.monthly.map((m) => m.salaries), color: seriesColor(2) },
      { label: 'Charges', data: d.monthly.map((m) => m.charges), color: seriesColor(3) },
    ], this.money);
  });
  /** Paid categories in their fixed order, with their color and share of the total. */
  categories = computed(() => {
    const list = this.s()?.byCategory ?? [];
    const total = list.reduce((a, c) => a + c.amount, 0);
    return CATEGORY_ORDER.map((cat, i) => ({ cat, slot: i + 1, row: list.find((c) => c.category === cat) }))
      .filter((x) => x.row && x.row.amount > 0)
      .map((x) => ({ category: x.cat, label: x.row!.label, amount: x.row!.amount, color: seriesColor(x.slot), share: share(x.row!.amount, total) }));
  });
  categoryChart = computed(() => {
    const c = this.categories();
    return pieChart(c.map((x) => x.label), c.map((x) => x.amount), c.map((x) => x.color), this.money);
  });

  constructor() {
    this.load();
  }

  setPeriod(p: Period): void {
    this.period.set(p);
    if (p === 'YEAR') this.from = `${this.currentMonth.slice(0, 4)}-01`;
    if (p === 'LAST12') {
      const [y, m] = this.currentMonth.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 12, 1));
      this.from = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
    }
    if (p !== 'CUSTOM') {
      this.to = this.currentMonth;
      this.load();
    }
  }

  async load(): Promise<void> {
    try {
      this.s.set(await this.api.chargeStats(this.from ?? undefined, this.to ?? undefined));
    } catch (e) {
      this.notify.error(e);
    }
  }

  csvMonthly(): void {
    const d = this.s();
    exportCsv(`resultat-mensuel-${d?.from}_${d?.to}`, [
      { header: 'Mois', value: (m) => formatMonth(m.month, true) }, { header: 'Revenus', value: (m) => csvNumber(m.revenue) },
      { header: 'Salaires', value: (m) => csvNumber(m.salaries) }, { header: 'Charges', value: (m) => csvNumber(m.charges) },
      { header: 'Bénéfice', value: (m) => csvNumber(m.profit) },
    ], d?.monthly ?? []);
  }

  csvPaid(): void {
    const d = this.s();
    exportCsv(`charges-reglees-${d?.from}_${d?.to}`, [
      { header: 'Mois', value: (r) => formatMonth(r.period, true) }, { header: 'Charge', value: (r) => r.charge.label },
      { header: 'Catégorie', value: (r) => r.charge.categoryLabel }, { header: 'Réglée le', value: (r) => r.payment!.paidOn },
      { header: 'Mode', value: (r) => r.payment!.methodLabel }, { header: 'Montant', value: (r) => csvNumber(r.payment!.amount) },
      { header: 'Note', value: (r) => r.payment!.note },
    ], d?.paid ?? []);
  }
}
