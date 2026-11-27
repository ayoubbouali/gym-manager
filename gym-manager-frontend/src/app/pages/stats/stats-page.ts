import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { csvNumber, exportCsv } from '../../core/csv';
import { FrDatePipe, MoneyPipe, formatAmount, formatMonth } from '../../core/format';
import { Stats } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DateField } from '../../shared/date-field';
import { SportChip } from '../../shared/badges';
import { ChartComponent, barChart, pieChart, seriesChart, seriesColor, share } from '../../shared/chart';
import { StatsPeriod, StatsPeriodToggle, monthsBack, rollingMonths } from '../../shared/stats-period';
import { Pager, Paged } from '../../shared/table';
import { ChargeStats } from './charge-stats';
import { RegistrationStats } from './registration-stats';
import { StaffPayStats } from './staff-pay-stats';

/** Club revenue statistics: members' payments, paying activities and business. */
@Component({
  selector: 'app-club-stats',
  imports: [FormsModule, MatButtonModule, MatFormFieldModule, MatInputModule, LucideAngularModule, DateField,
    ChartComponent, SportChip, StatsPeriodToggle, Pager, MoneyPipe, FrDatePipe],
  template: `
    <div class="toolbar">
      <app-stats-period [value]="period()" (changed)="setPeriod($event)" />
      @if (period() === 'CUSTOM') {
        <app-date-field label="Du" subscriptSizing="dynamic" [(ngModel)]="from" #fromField="ngModel" />
        <app-date-field label="Au" subscriptSizing="dynamic" [(ngModel)]="to" #toField="ngModel" />
        <button mat-flat-button (click)="load()" [disabled]="fromField.invalid || toField.invalid">Appliquer</button>
      }
      <span class="grow"></span>
      @if (s(); as d) {<span class="muted">Du {{ d.from | frDate }} au {{ d.to | frDate }}</span>}
    </div>

    @if (s(); as d) {
      <div class="kpis four">
        <div class="kpi-card"><span class="kpi-icon green"><lucide-icon name="trending-up" /></span><span><span class="kpi-label">CA encaissé (période)</span><span class="kpi-value">{{ d.kpis.revenue | money: 0 }}</span></span></div>
        <div class="kpi-card"><span class="kpi-icon red"><lucide-icon name="wallet" /></span><span><span class="kpi-label">Reste à encaisser</span><span class="kpi-value red">{{ d.kpis.unpaidAmount | money: 0 }}</span></span></div>
        <div class="kpi-card"><span class="kpi-icon amber"><lucide-icon name="shield-check" /></span><span><span class="kpi-label">Assurances impayées</span><span class="kpi-value">{{ d.kpis.unpaidInsuranceCount }}</span></span></div>
        <div class="kpi-card"><span class="kpi-icon blue"><lucide-icon name="users" /></span><span><span class="kpi-label">Adhérents actifs</span><span class="kpi-value">{{ d.kpis.activeMembers }}</span></span></div>
      </div>
      <div class="kpis">
        @for (x of d.bySource; track x.key) {
          <div class="kpi-card"><span [class]="'kpi-icon ' + sourceStyle[x.key].color"><lucide-icon [name]="sourceStyle[x.key].icon" /></span>
            <span><span class="kpi-label">{{ x.label }}</span><span class="kpi-value">{{ x.amount | money: 0 }}</span>
              <small class="muted">{{ sourceShare(x.amount) }} du CA</small></span></div>
        }
      </div>
      <p class="muted small note">
        CA = paiements des adhérents (à leur date) + activités payantes (prix × inscrits, au mois de l’activité) + encaissements business (à leur date).
      </p>

      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h3>Chiffre d'affaires mensuel par source</h3><span class="grow"></span>
            <button mat-stroked-button (click)="csvMonthly()"><lucide-icon name="download" [size]="16" /> CSV</button></div>
          <app-chart [config]="monthlyChart()" label="Chiffre d'affaires mensuel par source" />
          <details class="data-table-toggle">
            <summary>Voir le tableau</summary>
            <div class="table-wrap"><table class="table compact"><thead><tr><th>Mois</th><th class="num">Abonnements</th><th class="num">Activités</th><th class="num">Business</th><th class="num">Total</th></tr></thead>
              <tbody>@for (m of monthlyRows.page(); track m.month) {<tr><td>{{ month(m.month) }}</td><td class="num">{{ m.subscriptions | money }}</td>
                <td class="num">{{ m.activities | money }}</td><td class="num">{{ m.business | money }}</td><td class="num strong">{{ m.total | money }}</td></tr>}</tbody></table></div>
            <app-pager [table]="monthlyRows" [auto]="true" />
          </details>
        </section>
        <section class="card">
          <h3>CA des abonnements par sport</h3>
          <app-chart [config]="sportChart()" label="Chiffre d'affaires des abonnements par sport" />
          <table class="table compact">
            <tbody>@for (x of sportRows.page(); track x.id) {<tr><td><app-sport-chip [name]="x.name" [color]="x.color" [inactive]="!x.active" /></td><td class="num">{{ x.amount | money }}</td></tr>}</tbody>
          </table>
          <app-pager [table]="sportRows" [auto]="true" />
        </section>
      </div>

      @if (businessCategories().length) {
        <section class="card">
          <div class="card-head"><h3>Business par catégorie</h3></div>
          <div class="grid-2">
            <app-chart [config]="businessChart()" label="Business encaissé par catégorie" />
            <div>
              <table class="table compact"><tbody>
                @for (c of businessRows.page(); track c.category) {
                  <tr><td><i class="dot" [style.background]="c.color"></i> {{ c.label }}</td><td class="num">{{ c.amount | money }}</td><td class="num muted">{{ c.share }}</td></tr>
                }
              </tbody></table>
              <app-pager [table]="businessRows" [auto]="true" />
            </div>
          </div>
        </section>
      }

      <section class="card">
        <h3>Encaissements par mode de paiement <span class="muted small">(adhérents et business)</span></h3>
        <div class="method-row">
          @for (m of d.byMethod; track m.method) {
            <div class="method-box">
              <span class="muted">{{ m.label }}</span><b>{{ m.amount | money }}</b><small class="muted">{{ m.count }} paiement(s)</small>
              <div class="bar"><i [style.width.%]="d.kpis.revenue ? (m.amount / d.kpis.revenue) * 100 : 0" style="background: var(--brand)"></i></div>
            </div>
          }
        </div>
      </section>

      <div class="grid-3">
        <section class="card">
          <h3>Trimestriel</h3>
          <table class="table compact"><thead><tr><th>Trimestre</th><th class="num">CA</th></tr></thead>
            <tbody>@for (q of quarterRows.page(); track $index) {<tr><td>T{{ q.quarter }} {{ q.year }}</td><td class="num">{{ q.amount | money }}</td></tr>}</tbody></table>
          <app-pager [table]="quarterRows" [auto]="true" />
        </section>
        <section class="card">
          <h3>Annuel</h3>
          <table class="table compact"><thead><tr><th>Année</th><th class="num">CA</th></tr></thead>
            <tbody>@for (y of yearRows.page(); track y.year) {<tr><td>{{ y.year }}</td><td class="num strong">{{ y.amount | money }}</td></tr>}</tbody></table>
          <app-pager [table]="yearRows" [auto]="true" />
        </section>
        <section class="card">
          <h3>Activités</h3>
          <table class="table compact"><thead><tr><th>Activité</th><th class="num">Inscrits</th><th class="num">Recettes</th></tr></thead>
            <tbody>
              @for (a of activityRows.page(); track a.id) {<tr><td>{{ a.name }}@if (a.price === 0) { <span class="muted small">(gratuite)</span>}</td><td class="num">{{ a.count }}</td><td class="num">{{ a.revenue | money }}</td></tr>}
              @empty {<tr><td colspan="3" class="empty">Aucune activité sur la période.</td></tr>}
            </tbody></table>
          <app-pager [table]="activityRows" [auto]="true" />
        </section>
      </div>
    } @else {
      <div class="loading">Chargement…</div>
    }
  `,
  styles: `.note { margin: -6px 0 18px; }`,
})
export class ClubStats {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private config = inject(ConfigService);
  s = signal<Stats | null>(null);
  private today = this.config.config()?.today ?? new Date().toISOString().slice(0, 10);
  /** Default: custom period on the current month, from its first day to today. */
  period = signal<StatsPeriod>('CUSTOM');
  from = `${this.today.slice(0, 7)}-01`;
  to = this.today;
  month = (ym: string) => formatMonth(ym, true);
  monthlyRows = new Paged(() => this.s()?.monthlyBySource ?? []);
  sportRows = new Paged(() => this.s()?.bySport ?? []);
  quarterRows = new Paged(() => this.s()?.quarterly ?? [], 8);
  yearRows = new Paged(() => this.s()?.yearly ?? [], 8);
  activityRows = new Paged(() => this.s()?.activities ?? []);
  readonly sourceStyle: Record<string, { icon: string; color: string }> = {
    SUBSCRIPTIONS: { icon: 'ticket', color: 'blue' }, ACTIVITIES: { icon: 'calendar-days', color: 'amber' }, BUSINESS: { icon: 'shopping-bag', color: 'green' },
  };
  sourceShare = (amount: number) => share(amount, this.s()?.kpis.revenue ?? 0);

  private money = (v: number) => `${formatAmount(v, 0)} ${this.config.currency()}`;
  monthlyChart = computed(() => {
    const m = this.s()!.monthlyBySource;
    return seriesChart(m.map((x) => formatMonth(x.month)), [
      { label: 'Abonnements', data: m.map((x) => x.subscriptions), color: seriesColor(1) },
      { label: 'Activités payantes', data: m.map((x) => x.activities), color: seriesColor(2) },
      { label: 'Business', data: m.map((x) => x.business), color: seriesColor(3) },
    ], this.money, true);
  });
  /** Business categories with their color and share of the business total. */
  businessCategories = computed(() => {
    const list = this.s()?.businessByCategory ?? [];
    const total = list.reduce((a, c) => a + c.amount, 0);
    return list.map((c, i) => ({ ...c, color: seriesColor(i + 1), share: share(c.amount, total) }));
  });
  businessRows = new Paged(() => this.businessCategories());
  businessChart = computed(() => {
    const c = this.businessCategories();
    return pieChart(c.map((x) => x.label), c.map((x) => x.amount), c.map((x) => x.color), this.money);
  });
  sportChart = computed(() => {
    const d = this.s()!;
    return barChart(d.bySport.map((x) => x.name), d.bySport.map((x) => x.amount), d.bySport.map((x) => x.color), this.money, true);
  });

  constructor() {
    this.load();
  }

  setPeriod(p: StatsPeriod): void {
    this.period.set(p);
    const n = rollingMonths(p);
    if (p === 'YEAR') this.from = `${this.today.slice(0, 4)}-01-01`;
    if (n) this.from = `${monthsBack(this.today.slice(0, 7), n)}-01`;
    if (p !== 'CUSTOM') {
      this.to = this.today;
      this.load();
    }
  }

  async load(): Promise<void> {
    try {
      const p = this.period();
      this.s.set(p === 'LAST12' ? await this.api.stats() : await this.api.stats(this.from, this.to));
    } catch (e) {
      this.notify.error(e);
    }
  }

  csvMonthly(): void {
    exportCsv('ca-mensuel', [
      { header: 'Mois', value: (m) => formatMonth(m.month, true) }, { header: 'Abonnements', value: (m) => csvNumber(m.subscriptions) },
      { header: 'Activités payantes', value: (m) => csvNumber(m.activities) }, { header: 'Business', value: (m) => csvNumber(m.business) },
      { header: "Chiffre d'affaires", value: (m) => csvNumber(m.total) },
    ], this.s()?.monthlyBySource ?? []);
  }
}

const HIDE_FIGURES_KEY = 'stats.hideFigures';

@Component({
  selector: 'app-stats',
  imports: [MatTabsModule, MatTooltipModule, LucideAngularModule, StaffPayStats, ClubStats, RegistrationStats, ChargeStats],
  template: `
    <div class="stats-shell" [class.figures-hidden]="hidden()">
      <button type="button" class="figures-toggle" [class.on]="hidden()" (click)="toggle()" [attr.aria-pressed]="hidden()"
              [matTooltip]="hidden() ? 'Afficher les montants et les chiffres' : 'Masquer les montants et les chiffres'">
        <span class="figures-toggle-icon"><lucide-icon [name]="hidden() ? 'eye-off' : 'eye'" [size]="16" /></span>
        <span>{{ hidden() ? 'Chiffres masqués' : 'Chiffres visibles' }}</span>
        <span class="figures-toggle-switch" aria-hidden="true"><i></i></span>
      </button>
      <mat-tab-group [selectedIndex]="tab()" (selectedIndexChange)="tab.set($event)" animationDuration="0ms" mat-stretch-tabs="false">
        <mat-tab label="Suivi des salaires"><ng-template matTabContent><div class="stats-tab"><app-staff-pay-stats /></div></ng-template></mat-tab>
        <mat-tab label="Suivi des revenus"><ng-template matTabContent><div class="stats-tab"><app-club-stats /></div></ng-template></mat-tab>
        <mat-tab label="Suivi des inscriptions"><ng-template matTabContent><div class="stats-tab"><app-registration-stats /></div></ng-template></mat-tab>
        <mat-tab label="Suivi des charges"><ng-template matTabContent><div class="stats-tab"><app-charge-stats /></div></ng-template></mat-tab>
      </mat-tab-group>
    </div>
  `,
  styles: `.stats-tab { padding-top: 18px; }`,
})
export class StatsPage {
  tab = signal(0);
  /** Hides every figure of all tabs (e.g. when the screen is shared); remembered on this browser. */
  hidden = signal(localStorage.getItem(HIDE_FIGURES_KEY) === '1');

  toggle(): void {
    this.hidden.update((v) => !v);
    localStorage.setItem(HIDE_FIGURES_KEY, this.hidden() ? '1' : '0');
  }
}
