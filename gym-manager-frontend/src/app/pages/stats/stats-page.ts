import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { csvNumber, exportCsv } from '../../core/csv';
import { FrDatePipe, MoneyPipe, formatAmount, formatMonth } from '../../core/format';
import { Stats } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { DateField } from '../../shared/date-field';
import { SportChip } from '../../shared/badges';
import { ChartComponent, barChart, cssColor } from '../../shared/chart';

type Period = 'LAST12' | 'YEAR' | 'CUSTOM';

@Component({
  selector: 'app-stats',
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, LucideAngularModule, DateField,
    ChartComponent, SportChip, MoneyPipe, FrDatePipe],
  template: `
    <div class="toolbar">
      <mat-button-toggle-group [ngModel]="period()" (ngModelChange)="setPeriod($event)" aria-label="Période">
        <mat-button-toggle value="LAST12">12 derniers mois</mat-button-toggle>
        <mat-button-toggle value="YEAR">Année en cours</mat-button-toggle>
        <mat-button-toggle value="CUSTOM">Période personnalisée</mat-button-toggle>
      </mat-button-toggle-group>
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

      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h3>Chiffre d'affaires mensuel</h3><span class="grow"></span>
            <button mat-stroked-button (click)="csvMonthly()"><lucide-icon name="download" [size]="16" /> CSV</button></div>
          <app-chart [config]="monthlyChart()" label="Chiffre d'affaires mensuel" />
          <details class="data-table-toggle">
            <summary>Voir le tableau</summary>
            <table class="table compact"><thead><tr><th>Mois</th><th class="num">Chiffre d'affaires</th></tr></thead>
              <tbody>@for (m of d.monthly; track m.month) {<tr><td>{{ month(m.month) }}</td><td class="num">{{ m.amount | money }}</td></tr>}</tbody></table>
          </details>
        </section>
        <section class="card">
          <h3>CA par sport</h3>
          <app-chart [config]="sportChart()" label="Chiffre d'affaires par sport" />
          <table class="table compact">
            <tbody>@for (x of d.bySport; track x.id) {<tr><td><app-sport-chip [name]="x.name" [color]="x.color" [inactive]="!x.active" /></td><td class="num">{{ x.amount | money }}</td></tr>}</tbody>
          </table>
        </section>
      </div>

      <section class="card">
        <h3>Encaissements par mode de paiement</h3>
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
            <tbody>@for (q of d.quarterly; track $index) {<tr><td>T{{ q.quarter }} {{ q.year }}</td><td class="num">{{ q.amount | money }}</td></tr>}</tbody></table>
        </section>
        <section class="card">
          <h3>Annuel</h3>
          <table class="table compact"><thead><tr><th>Année</th><th class="num">CA</th></tr></thead>
            <tbody>@for (y of d.yearly; track y.year) {<tr><td>{{ y.year }}</td><td class="num strong">{{ y.amount | money }}</td></tr>}</tbody></table>
        </section>
        <section class="card">
          <h3>Activités</h3>
          <table class="table compact"><thead><tr><th>Activité</th><th class="num">Inscrits</th><th class="num">Recettes</th></tr></thead>
            <tbody>
              @for (a of d.activities; track a.id) {<tr><td>{{ a.name }}</td><td class="num">{{ a.count }}</td><td class="num">{{ a.revenue | money }}</td></tr>}
              @empty {<tr><td colspan="3" class="empty">Aucune activité sur la période.</td></tr>}
            </tbody></table>
        </section>
      </div>
    } @else {
      <div class="loading">Chargement…</div>
    }
  `,
})
export class StatsPage {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private config = inject(ConfigService);
  s = signal<Stats | null>(null);
  period = signal<Period>('LAST12');
  from = '';
  to = '';
  month = (ym: string) => formatMonth(ym, true);

  private money = (v: number) => `${formatAmount(v, 0)} ${this.config.currency()}`;
  monthlyChart = computed(() => {
    const d = this.s()!;
    const brand = cssColor('--brand', '#C62828');
    return barChart(d.monthly.map((m) => formatMonth(m.month)), d.monthly.map((m) => m.amount), brand, this.money);
  });
  sportChart = computed(() => {
    const d = this.s()!;
    return barChart(d.bySport.map((x) => x.name), d.bySport.map((x) => x.amount), d.bySport.map((x) => x.color), this.money, true);
  });

  constructor() {
    this.load();
  }

  setPeriod(p: Period): void {
    this.period.set(p);
    const today = this.config.config()?.today ?? new Date().toISOString().slice(0, 10);
    if (p === 'YEAR') {
      this.from = `${today.slice(0, 4)}-01-01`;
      this.to = today;
    }
    if (p !== 'CUSTOM') this.load();
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
    exportCsv('ca-mensuel', [{ header: 'Mois', value: (m) => formatMonth(m.month, true) }, { header: "Chiffre d'affaires", value: (m) => csvNumber(m.amount) }], this.s()?.monthly ?? []);
  }
}
