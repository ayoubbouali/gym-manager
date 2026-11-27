import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { FrDateTimePipe, MoneyPipe } from '../../core/format';
import { Dashboard } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { visibleNav } from '../../layout/nav';
import { SportChip } from '../../shared/badges';
import { Pager, Paged } from '../../shared/table';

@Component({
  selector: 'app-dashboard',
  imports: [RouterLink, LucideAngularModule, SportChip, Pager, FrDateTimePipe, MoneyPipe],
  template: `
    @if (data(); as d) {
      <div class="kpis four">
        <a class="kpi-card" routerLink="/adherents">
          <span class="kpi-icon green"><lucide-icon name="users" /></span>
          <span><span class="kpi-label">Adhérents actifs</span><span class="kpi-value">{{ d.activeMembers }}</span></span>
        </a>
        <a class="kpi-card" routerLink="/alertes">
          <span class="kpi-icon red"><lucide-icon name="triangle-alert" /></span>
          <span><span class="kpi-label">En alerte de paiement</span><span class="kpi-value red">{{ d.alertCount }}</span></span>
          <lucide-icon name="arrow-right" class="kpi-go" [size]="18" />
        </a>
        <a class="kpi-card" routerLink="/paiements">
          <span class="kpi-icon green"><lucide-icon name="wallet" /></span>
          <span><span class="kpi-label">Encaissé ce mois</span><span class="kpi-value">{{ d.cashedThisMonth | money: 0 }}</span></span>
        </a>
        <a class="kpi-card" routerLink="/adherents">
          <span class="kpi-icon amber"><lucide-icon name="hourglass" /></span>
          <span><span class="kpi-label">Reste à encaisser</span><span class="kpi-value">{{ d.toCollect | money: 0 }}</span></span>
        </a>
      </div>

      <div class="grid-2">
        <section class="card">
          <h3>Adhérents actifs par sport</h3>
          <table class="table compact">
            <tbody>
              @for (s of sportRows.page(); track s.id) {
                <tr>
                  <td><app-sport-chip [name]="s.name" [color]="s.color" /></td>
                  <td class="w-60">
                    <div class="bar" role="img" [attr.aria-label]="s.count + ' adhérents actifs'">
                      <i [style.width.%]="max() ? (s.count / max()) * 100 : 0" [style.background]="s.color"></i>
                    </div>
                  </td>
                  <td class="num strong">{{ s.count }}</td>
                </tr>
              } @empty {
                <tr><td class="muted">Aucun sport actif.</td></tr>
              }
            </tbody>
          </table>
          <app-pager [table]="sportRows" [auto]="true" />
        </section>
        <section class="card">
          <div class="card-head"><h3>Prochaines activités</h3><span class="grow"></span><span class="badge info">{{ d.upcomingActivityCount }} à venir</span></div>
          @for (a of d.upcoming; track a.id) {
            <div class="list-item">
              <div class="date-pill"><b>{{ a.startsAt.slice(8, 10) }}</b><small>{{ a.startsAt.slice(5, 7) }}</small></div>
              <div class="grow"><div class="strong">{{ a.name }}</div><small class="muted">{{ a.startsAt | frDateTime }} · {{ a.location || '—' }}</small></div>
              <span class="badge info">{{ a.registrationCount }}{{ a.maxPlaces ? ' / ' + a.maxPlaces : '' }} inscrit(s)</span>
            </div>
          } @empty {
            <p class="muted empty-inline"><lucide-icon name="calendar-clock" [size]="18" /> Aucune activité à venir.</p>
          }
        </section>
      </div>

      <section class="card">
        <h3>Raccourcis</h3>
        <div class="shortcuts">
          @for (g of shortcuts(); track $index) {
            <div>
              <div class="nav-sep dark">{{ g.label }}</div>
              <div class="shortcut-row">
                @for (i of g.items; track i.path) {
                  <a class="shortcut" [routerLink]="i.path"><lucide-icon [name]="i.icon" [size]="18" /> {{ i.label }}</a>
                }
              </div>
            </div>
          }
        </div>
      </section>
    } @else {
      <div class="loading">Chargement…</div>
    }
  `,
})
export class DashboardPage {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private notify = inject(NotifyService);
  data = signal<Dashboard | null>(null);
  sportRows = new Paged(() => this.data()?.bySport ?? []);
  max = computed(() => Math.max(0, ...(this.data()?.bySport ?? []).map((s) => s.count)));
  shortcuts = computed(() => {
    return visibleNav((p) => this.auth.can(p))
      .filter((g) => g.label !== null || g.items[0].path !== '/')
      .map((g) => ({ label: g.label ?? 'Paramètres', items: g.items }));
  });

  constructor() {
    this.api.dashboard().then((d) => this.data.set(d), (e) => this.notify.error(e));
  }
}
