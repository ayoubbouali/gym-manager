import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfigService } from '../../core/config.service';
import { csvNumber, exportCsv } from '../../core/csv';
import { MoneyPipe } from '../../core/format';
import { SportView } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ActiveBadge, SportChip } from '../../shared/badges';
import { ConfirmService } from '../../shared/confirm.service';
import { Pager, SortHeader, TableState } from '../../shared/table';
import { SportFormDialog } from './sport-form-dialog';

@Component({
  selector: 'app-sports',
  imports: [FormsModule, MatButtonModule, MatSlideToggleModule, MatTooltipModule, LucideAngularModule, SortHeader, Pager, SportChip, ActiveBadge, MoneyPipe],
  template: `
    <div class="toolbar">
      <label class="search grow"><lucide-icon name="search" [size]="18" />
        <input type="search" placeholder="Rechercher un sport ou un coach" [ngModel]="t.search()" (ngModelChange)="t.setSearch($event)" aria-label="Rechercher un sport" /></label>
      <mat-slide-toggle [ngModel]="t.showInactive()" (ngModelChange)="t.showInactive.set($event)">Afficher les inactifs</mat-slide-toggle>
      <button mat-stroked-button (click)="csv()"><lucide-icon name="download" [size]="16" /> CSV</button>
      @if (canEdit()) {<button mat-flat-button (click)="edit()"><lucide-icon name="plus" [size]="16" /> Ajouter un sport</button>}
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr>
          <th [attr.aria-sort]="t.ariaSort('code')"><app-sort [table]="t" key="code">ID</app-sort></th>
          <th [attr.aria-sort]="t.ariaSort('name')"><app-sort [table]="t" key="name">Sport</app-sort></th>
          <th>Coach(s)</th><th>Horaires</th>
          <th class="num" [attr.aria-sort]="t.ariaSort('capacity')"><app-sort [table]="t" key="capacity">Capacité</app-sort></th>
          <th class="num" [attr.aria-sort]="t.ariaSort('price')"><app-sort [table]="t" key="price">Prix mensuel</app-sort></th>
          <th class="num" [attr.aria-sort]="t.ariaSort('count')"><app-sort [table]="t" key="count">Inscrits</app-sort></th>
          <th [attr.aria-sort]="t.ariaSort('fill')"><app-sort [table]="t" key="fill">Remplissage</app-sort></th>
          <th>Actif</th>@if (canEdit()) {<th><span class="sr-only">Actions</span></th>}
        </tr></thead>
        <tbody>
          @for (s of t.page(); track s.id) {
            <tr [class.inactive]="!s.active">
              <td class="code">{{ s.code }}</td>
              <td><app-sport-chip [name]="s.name" [color]="s.color" /></td>
              <td>@for (c of s.coaches; track c.id) {<span class="chip" [class.chip-inactive]="!c.active">{{ c.name }}</span>} @empty {<span class="muted">—</span>}</td>
              <td class="muted wrap">{{ s.scheduleSummary || '—' }}</td>
              <td class="num">{{ s.capacity }}</td>
              <td class="num">{{ s.monthlyPrice | money }}</td>
              <td class="num strong">{{ s.memberCount }}</td>
              <td class="fill-cell">
                <div class="bar" role="img" [attr.aria-label]="s.fillPercent + ' % de remplissage'">
                  <i [style.width.%]="s.fillPercent > 100 ? 100 : (s.fillPercent < 3 ? 3 : s.fillPercent)" [style.background]="s.fillPercent > 100 ? 'var(--ko)' : s.color"></i>
                </div>
                <small [class.red]="s.fillPercent > 100" [class.muted]="s.fillPercent <= 100">{{ s.fillPercent }} %</small>
              </td>
              <td><app-active-badge [active]="s.active" /></td>
              @if (canEdit()) {
                <td class="actions">
                  <button class="icon-btn" (click)="edit(s)" matTooltip="Modifier" [attr.aria-label]="'Modifier ' + s.name"><lucide-icon name="pencil" [size]="16" /></button>
                  <button class="icon-btn" (click)="toggle(s)" [matTooltip]="s.active ? 'Désactiver' : 'Réactiver'" [attr.aria-label]="(s.active ? 'Désactiver ' : 'Réactiver ') + s.name"><lucide-icon name="power" [size]="16" /></button>
                  <button class="icon-btn danger" (click)="remove(s)" matTooltip="Supprimer" [attr.aria-label]="'Supprimer ' + s.name"><lucide-icon name="trash-2" [size]="16" /></button>
                </td>
              }
            </tr>
          } @empty {<tr><td colspan="10" class="empty">Aucun sport.</td></tr>}
        </tbody>
      </table>
    </div>
    <app-pager [table]="t" />
  `,
})
export class SportsPage {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private confirm = inject(ConfirmService);
  private notify = inject(NotifyService);
  private config = inject(ConfigService);
  private auth = inject(AuthService);
  canEdit = computed(() => this.auth.can('EDIT_REFERENTIALS'));

  t = new TableState<SportView>({
    searchText: (s) => `${s.code} ${s.name} ${s.coaches.map((c) => c.name).join(' ')} ${s.scheduleSummary}`,
    sort: { code: (s) => s.code, name: (s) => s.name, capacity: (s) => s.capacity, price: (s) => s.monthlyPrice, count: (s) => s.memberCount, fill: (s) => s.fillPercent },
    defaultSort: { key: 'code', dir: 'asc' },
    isActive: (s) => s.active,
    pageSize: computed(() => this.config.pageSize()),
  });

  constructor() {
    this.load();
  }

  async load(): Promise<void> {
    try {
      this.t.rows.set(await this.api.sports());
    } catch (e) {
      this.notify.error(e);
    }
  }

  async edit(sport?: SportView): Promise<void> {
    const staff = await this.api.staffOptions();
    const ok = await firstValueFrom(this.dialog.open(SportFormDialog, { data: { sport, staff }, width: '720px', maxWidth: '96vw' }).afterClosed());
    if (ok) this.load();
  }

  async toggle(s: SportView): Promise<void> {
    const ok = await this.confirm.confirm({
      title: `${s.active ? 'Désactiver' : 'Réactiver'} le sport « ${s.name} » ?`,
      message: s.active ? 'Il disparaît des listes de choix et du tableau de bord, mais reste affiché sur les fiches existantes.' : undefined,
      confirmLabel: s.active ? 'Désactiver' : 'Réactiver', danger: s.active,
    });
    if (!ok) return;
    try {
      await this.api.setActive('sports', s.id, !s.active);
      this.load();
    } catch (e) {
      this.notify.error(e);
    }
  }

  async remove(s: SportView): Promise<void> {
    if (!(await this.confirm.confirm({ title: `Supprimer le sport « ${s.name} » ?`, message: 'Un sport utilisé (packs, adhérents) ne peut pas être supprimé : désactivez-le.', confirmLabel: 'Supprimer', danger: true }))) return;
    try {
      await this.api.remove('sports', s.id);
      this.notify.success('Sport supprimé.');
      this.load();
    } catch (e) {
      this.notify.error(e);
    }
  }

  csv(): void {
    exportCsv('sports', [
      { header: 'ID', value: (s) => s.code }, { header: 'Sport', value: (s) => s.name }, { header: 'Couleur', value: (s) => s.color },
      { header: 'Coach(s)', value: (s) => s.coaches.map((c) => c.name).join(', ') }, { header: 'Horaires', value: (s) => s.scheduleSummary },
      { header: 'Capacité', value: (s) => s.capacity }, { header: 'Prix mensuel', value: (s) => csvNumber(s.monthlyPrice) },
      { header: 'Inscrits', value: (s) => s.memberCount }, { header: 'Remplissage %', value: (s) => s.fillPercent },
      { header: 'Actif', value: (s) => (s.active ? 'Oui' : 'Non') },
    ], this.t.filtered());
  }
}
