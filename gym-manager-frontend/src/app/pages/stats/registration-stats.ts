import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { exportCsv } from '../../core/csv';
import { FrDatePipe, formatMonth } from '../../core/format';
import { RegistrationStats as Stats } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { SportChip } from '../../shared/badges';
import { ChartComponent, barChart, lineChart, seriesColor } from '../../shared/chart';
import { DateField } from '../../shared/date-field';

type Period = 'LAST12' | 'YEAR' | 'CUSTOM';

/** New members, renewals and departures (RG-INSCR). */
@Component({
  selector: 'app-registration-stats',
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, LucideAngularModule, DateField, ChartComponent, SportChip, FrDatePipe],
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
        <div class="kpi-card"><span class="kpi-icon blue"><lucide-icon name="user-plus" /></span><span><span class="kpi-label">Nouvelles inscriptions</span><span class="kpi-value">{{ d.newMembers }}</span></span></div>
        <div class="kpi-card"><span class="kpi-icon green"><lucide-icon name="refresh-cw" /></span><span><span class="kpi-label">Renouvellements</span><span class="kpi-value">{{ d.renewals }}</span></span></div>
        <div class="kpi-card"><span class="kpi-icon red"><lucide-icon name="user-minus" /></span><span><span class="kpi-label">Départs</span><span class="kpi-value">{{ d.departures }}</span></span></div>
        <div class="kpi-card"><span class="kpi-icon amber"><lucide-icon name="trending-up" /></span><span><span class="kpi-label">Solde net</span><span class="kpi-value" [class.red]="d.net < 0">{{ signed(d.net) }}</span></span></div>
      </div>
      <p class="muted small rate">
        Taux de renouvellement : <strong>{{ d.renewalRate === null ? '—' : d.renewalRate + ' %' }}</strong>
        ({{ d.renewed }} renouvelé(s) sur {{ d.ended }} abonnement(s) arrivé(s) à terme sur la période).
        Un départ est un abonnement terminé sans renouvellement.
      </p>

      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h3>Inscriptions, renouvellements et départs par mois</h3></div>
          <app-chart [config]="monthlyChart()" label="Inscriptions, renouvellements et départs par mois" />
          <details class="data-table-toggle">
            <summary>Voir le tableau</summary>
            <table class="table compact"><thead><tr><th>Mois</th><th class="num">Inscriptions</th><th class="num">Renouvellements</th><th class="num">Départs</th></tr></thead>
              <tbody>@for (m of d.monthly; track m.month) {<tr><td>{{ month(m.month) }}</td><td class="num">{{ m.newMembers }}</td><td class="num">{{ m.renewals }}</td><td class="num">{{ m.departures }}</td></tr>}</tbody></table>
          </details>
        </section>
        <section class="card">
          <div class="card-head"><h3>Nouvelles inscriptions par sport</h3></div>
          @if (d.bySport.length) {<app-chart [config]="sportChart()" label="Nouvelles inscriptions par sport" />}
          @else {<p class="empty">Aucune nouvelle inscription sur la période.</p>}
        </section>
      </div>

      <div class="grid-2">
        <section class="card">
          <div class="card-head"><h3>Par durée d’abonnement</h3></div>
          <table class="table compact"><tbody>
            @for (x of d.byDuration; track x.label) {<tr><td>{{ x.label }}</td><td class="num">{{ x.count }}</td></tr>}
            @empty {<tr><td colspan="2" class="empty">Aucune nouvelle inscription sur la période.</td></tr>}
          </tbody></table>
        </section>
        <section class="card">
          <div class="card-head"><h3>Par âge à l’inscription</h3></div>
          <table class="table compact"><tbody>
            @for (x of d.byAge; track x.label) {<tr><td>{{ x.label }}</td><td class="num">{{ x.count }}</td></tr>}
          </tbody></table>
        </section>
      </div>

      <section class="card">
        <div class="card-head"><h3>Nouvelles inscriptions de la période</h3><span class="grow"></span>
          <button mat-stroked-button (click)="csv()"><lucide-icon name="download" [size]="16" /> CSV</button></div>
        <div class="table-wrap">
          <table class="table compact">
            <thead><tr><th>ID</th><th>Adhérent</th><th>Inscrit le</th><th>Sports</th><th>Pack</th></tr></thead>
            <tbody>
              @for (m of d.newMemberRows; track m.id) {
                <tr><td class="code">{{ m.code }}</td><td class="strong">{{ m.name }}</td><td>{{ m.registrationDate | frDate }}</td>
                  <td class="wrap">@for (sp of m.sports; track sp.id) {<app-sport-chip [name]="sp.name" [color]="sp.color" [inactive]="!sp.active" />}</td><td>{{ m.packName ?? '—' }}</td></tr>
              } @empty {<tr><td colspan="5" class="empty">Aucune nouvelle inscription sur la période.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    } @else {
      <div class="loading">Chargement…</div>
    }
  `,
  styles: `.rate { margin: -6px 0 18px; }`,
})
export class RegistrationStats {
  private api = inject(ApiService);
  private notify = inject(NotifyService);
  private config = inject(ConfigService);
  private today = this.config.config()?.today ?? new Date().toISOString().slice(0, 10);
  s = signal<Stats | null>(null);
  /** Default: custom period on the current month, from its first day to today. */
  period = signal<Period>('CUSTOM');
  from = `${this.today.slice(0, 7)}-01`;
  to = this.today;
  month = (ym: string) => formatMonth(ym, true);
  signed = (n: number) => (n > 0 ? `+${n}` : String(n));

  private count = (v: number) => String(v);
  monthlyChart = computed(() => {
    const d = this.s()!;
    return lineChart(d.monthly.map((m) => formatMonth(m.month)), [
      { label: 'Inscriptions', data: d.monthly.map((m) => m.newMembers), color: seriesColor(1) },
      { label: 'Renouvellements', data: d.monthly.map((m) => m.renewals), color: seriesColor(2) },
      { label: 'Départs', data: d.monthly.map((m) => m.departures), color: seriesColor(3) },
    ], this.count);
  });
  sportChart = computed(() => {
    const d = this.s()!;
    return barChart(d.bySport.map((x) => x.name), d.bySport.map((x) => x.count), d.bySport.map((x) => x.color), this.count, true);
  });

  constructor() {
    this.load();
  }

  setPeriod(p: Period): void {
    this.period.set(p);
    if (p === 'YEAR') {
      this.from = `${this.today.slice(0, 4)}-01-01`;
      this.to = this.today;
    }
    if (p === 'LAST12') {
      const [y, m] = this.today.split('-').map(Number);
      const d = new Date(Date.UTC(y, m - 12, 1));
      this.from = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
      this.to = this.today;
    }
    if (p !== 'CUSTOM') this.load();
  }

  async load(): Promise<void> {
    try {
      this.s.set(await this.api.registrationStats(this.from, this.to));
    } catch (e) {
      this.notify.error(e);
    }
  }

  csv(): void {
    const d = this.s();
    exportCsv(`inscriptions-${d?.from}_${d?.to}`, [
      { header: 'ID', value: (m) => m.code }, { header: 'Adhérent', value: (m) => m.name }, { header: 'Inscrit le', value: (m) => m.registrationDate },
      { header: 'Sports', value: (m) => m.sports.map((x) => x.name).join(', ') }, { header: 'Pack', value: (m) => m.packName ?? '' },
    ], d?.newMemberRows ?? []);
  }
}
