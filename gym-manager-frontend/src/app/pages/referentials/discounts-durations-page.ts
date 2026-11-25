import { Component, computed, inject } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfigService } from '../../core/config.service';
import { csvNumber, exportCsv } from '../../core/csv';
import { DiscountView, DurationView } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ActiveBadge } from '../../shared/badges';
import { ConfirmService } from '../../shared/confirm.service';
import { openSimpleForm } from '../../shared/simple-form-dialog';
import { Pager, SortHeader, TableState } from '../../shared/table';

@Component({
  selector: 'app-discounts-durations',
  imports: [FormsModule, MatButtonModule, MatSlideToggleModule, MatTooltipModule, LucideAngularModule, SortHeader, Pager, ActiveBadge],
  template: `
    <div class="grid-2">
      <section class="card">
        <div class="card-head">
          <h3>Remises</h3><span class="grow"></span>
          <button mat-stroked-button (click)="csvDiscounts()"><lucide-icon name="download" [size]="16" /> CSV</button>
          @if (canEdit()) {<button mat-flat-button (click)="editDiscount()"><lucide-icon name="plus" [size]="16" /> Ajouter</button>}
        </div>
        <div class="toolbar">
          <label class="search grow"><lucide-icon name="search" [size]="18" /><input type="search" placeholder="Rechercher une remise" [ngModel]="d.search()" (ngModelChange)="d.setSearch($event)" aria-label="Rechercher une remise" /></label>
          <mat-slide-toggle [ngModel]="d.showInactive()" (ngModelChange)="d.showInactive.set($event)">Inactives</mat-slide-toggle>
        </div>
        <table class="table">
          <thead><tr>
            <th [attr.aria-sort]="d.ariaSort('code')"><app-sort [table]="d" key="code">ID</app-sort></th>
            <th [attr.aria-sort]="d.ariaSort('name')"><app-sort [table]="d" key="name">Nom</app-sort></th>
            <th class="num" [attr.aria-sort]="d.ariaSort('percent')"><app-sort [table]="d" key="percent">%</app-sort></th>
            <th>Actif</th>@if (canEdit()) {<th><span class="sr-only">Actions</span></th>}
          </tr></thead>
          <tbody>
            @for (x of d.page(); track x.id) {
              <tr [class.inactive]="!x.active">
                <td class="code">{{ x.code }}</td><td class="strong">{{ x.name }}</td><td class="num">{{ x.percent }} %</td>
                <td><app-active-badge [active]="x.active" /></td>
                @if (canEdit()) {
                  <td class="actions">
                    @if (x.system) {
                      <span class="muted" matTooltip="Remise par défaut : non supprimable"><lucide-icon name="lock" [size]="16" /></span>
                    } @else {
                      <button class="icon-btn" (click)="editDiscount(x)" matTooltip="Modifier" [attr.aria-label]="'Modifier ' + x.name"><lucide-icon name="pencil" [size]="16" /></button>
                      <button class="icon-btn" (click)="toggle('discounts', x.id, x.name, x.active)" [matTooltip]="x.active ? 'Désactiver' : 'Réactiver'" [attr.aria-label]="(x.active ? 'Désactiver ' : 'Réactiver ') + x.name"><lucide-icon name="power" [size]="16" /></button>
                      <button class="icon-btn danger" (click)="remove('discounts', x.id, x.name)" matTooltip="Supprimer" [attr.aria-label]="'Supprimer ' + x.name"><lucide-icon name="trash-2" [size]="16" /></button>
                    }
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
        <app-pager [table]="d" />
      </section>

      <section class="card">
        <div class="card-head">
          <h3>Durées</h3><span class="grow"></span>
          <button mat-stroked-button (click)="csvDurations()"><lucide-icon name="download" [size]="16" /> CSV</button>
          @if (canEdit()) {<button mat-flat-button (click)="editDuration()"><lucide-icon name="plus" [size]="16" /> Ajouter</button>}
        </div>
        <div class="toolbar">
          <label class="search grow"><lucide-icon name="search" [size]="18" /><input type="search" placeholder="Rechercher une durée" [ngModel]="u.search()" (ngModelChange)="u.setSearch($event)" aria-label="Rechercher une durée" /></label>
          <mat-slide-toggle [ngModel]="u.showInactive()" (ngModelChange)="u.showInactive.set($event)">Inactives</mat-slide-toggle>
        </div>
        <table class="table">
          <thead><tr>
            <th [attr.aria-sort]="u.ariaSort('label')"><app-sort [table]="u" key="label">Libellé</app-sort></th>
            <th class="num" [attr.aria-sort]="u.ariaSort('months')"><app-sort [table]="u" key="months">Mois</app-sort></th>
            <th>Actif</th>@if (canEdit()) {<th><span class="sr-only">Actions</span></th>}
          </tr></thead>
          <tbody>
            @for (x of u.page(); track x.id) {
              <tr [class.inactive]="!x.active">
                <td class="strong">{{ x.label }}</td><td class="num">{{ x.months }}</td><td><app-active-badge [active]="x.active" /></td>
                @if (canEdit()) {
                  <td class="actions">
                    <button class="icon-btn" (click)="editDuration(x)" matTooltip="Modifier" [attr.aria-label]="'Modifier ' + x.label"><lucide-icon name="pencil" [size]="16" /></button>
                    <button class="icon-btn" (click)="toggle('durations', x.id, x.label, x.active)" [matTooltip]="x.active ? 'Désactiver' : 'Réactiver'" [attr.aria-label]="(x.active ? 'Désactiver ' : 'Réactiver ') + x.label"><lucide-icon name="power" [size]="16" /></button>
                    <button class="icon-btn danger" (click)="remove('durations', x.id, x.label)" matTooltip="Supprimer" [attr.aria-label]="'Supprimer ' + x.label"><lucide-icon name="trash-2" [size]="16" /></button>
                  </td>
                }
              </tr>
            }
          </tbody>
        </table>
        <app-pager [table]="u" />
      </section>
    </div>
  `,
})
export class DiscountsDurationsPage {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private confirm = inject(ConfirmService);
  private notify = inject(NotifyService);
  private config = inject(ConfigService);
  private auth = inject(AuthService);
  canEdit = computed(() => this.auth.can('EDIT_REFERENTIALS'));
  private pageSize = computed(() => this.config.pageSize());

  d = new TableState<DiscountView>({
    searchText: (x) => `${x.code} ${x.name} ${x.percent}`,
    sort: { code: (x) => x.code, name: (x) => x.name, percent: (x) => x.percent },
    defaultSort: { key: 'code', dir: 'asc' }, isActive: (x) => x.active, pageSize: this.pageSize,
  });
  u = new TableState<DurationView>({
    searchText: (x) => `${x.label} ${x.months}`,
    sort: { label: (x) => x.label, months: (x) => x.months },
    defaultSort: { key: 'months', dir: 'asc' }, isActive: (x) => x.active, pageSize: this.pageSize,
  });

  constructor() {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const [d, u] = await Promise.all([this.api.discounts(), this.api.durations()]);
      this.d.rows.set(d);
      this.u.rows.set(u);
    } catch (e) {
      this.notify.error(e);
    }
  }

  async editDiscount(x?: DiscountView): Promise<void> {
    const ok = await openSimpleForm(this.dialog, {
      title: x ? `Modifier la remise ${x.code}` : 'Nouvelle remise',
      fields: [
        { key: 'name', label: 'Nom', required: true },
        { key: 'percent', label: 'Pourcentage', type: 'number', min: 0, max: 100, step: 0.01, suffix: '%', required: true },
      ],
      value: { name: x?.name ?? '', percent: x?.percent ?? 0 },
      submit: (v) => this.api.save('discounts', x?.id, v),
    });
    if (ok) this.load();
  }

  async editDuration(x?: DurationView): Promise<void> {
    const ok = await openSimpleForm(this.dialog, {
      title: x ? `Modifier la durée « ${x.label} »` : 'Nouvelle durée',
      fields: [
        { key: 'label', label: 'Libellé', required: true, hint: 'Ex. : Semestriel' },
        { key: 'months', label: 'Nombre de mois', type: 'number', min: 1, max: 120, step: 1, required: true },
      ],
      value: { label: x?.label ?? '', months: x?.months ?? 1 },
      submit: (v) => this.api.save('durations', x?.id, v),
    });
    if (ok) this.load();
  }

  async toggle(resource: string, id: number, name: string, active: boolean): Promise<void> {
    const ok = await this.confirm.confirm({
      title: `${active ? 'Désactiver' : 'Réactiver'} « ${name} » ?`,
      message: active ? "L'élément ne sera plus proposé dans les listes, mais reste affiché là où il est déjà utilisé." : undefined,
      confirmLabel: active ? 'Désactiver' : 'Réactiver', danger: active,
    });
    if (!ok) return;
    try {
      await this.api.setActive(resource, id, !active);
      this.load();
    } catch (e) {
      this.notify.error(e);
    }
  }

  async remove(resource: string, id: number, name: string): Promise<void> {
    if (!(await this.confirm.confirm({ title: `Supprimer « ${name} » ?`, message: 'Un élément utilisé ne peut pas être supprimé : désactivez-le.', confirmLabel: 'Supprimer', danger: true }))) return;
    try {
      await this.api.remove(resource, id);
      this.notify.success('Élément supprimé.');
      this.load();
    } catch (e) {
      this.notify.error(e);
    }
  }

  csvDiscounts(): void {
    exportCsv('remises', [{ header: 'ID', value: (x) => x.code }, { header: 'Nom', value: (x) => x.name },
      { header: 'Pourcentage', value: (x) => csvNumber(x.percent) }, { header: 'Actif', value: (x) => (x.active ? 'Oui' : 'Non') }], this.d.filtered());
  }

  csvDurations(): void {
    exportCsv('durees', [{ header: 'Libellé', value: (x) => x.label }, { header: 'Mois', value: (x) => x.months },
      { header: 'Actif', value: (x) => (x.active ? 'Oui' : 'Non') }], this.u.filtered());
  }
}
