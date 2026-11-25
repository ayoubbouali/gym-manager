import { Component, computed, inject, signal } from '@angular/core';
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
import { DiscountView, DurationView, PackView, SportView } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ActiveBadge, SportChip } from '../../shared/badges';
import { ConfirmService } from '../../shared/confirm.service';
import { Pager, SortHeader, TableState } from '../../shared/table';
import { GeneratePacksDialog, PackDialogData, PackFormDialog } from './pack-dialogs';

@Component({
  selector: 'app-packs',
  imports: [FormsModule, MatButtonModule, MatSlideToggleModule, MatTooltipModule, LucideAngularModule, SortHeader, Pager, SportChip, ActiveBadge, MoneyPipe],
  template: `
    <div class="toolbar">
      <label class="search grow"><lucide-icon name="search" [size]="18" />
        <input type="search" placeholder="Rechercher un pack" [ngModel]="t.search()" (ngModelChange)="t.setSearch($event)" aria-label="Rechercher un pack" /></label>
      <mat-slide-toggle [ngModel]="t.showInactive()" (ngModelChange)="t.showInactive.set($event)">Afficher les inactifs</mat-slide-toggle>
      <button mat-stroked-button (click)="csv()"><lucide-icon name="download" [size]="16" /> CSV</button>
      @if (canEdit()) {
        <button mat-stroked-button (click)="generate()"><lucide-icon name="zap" [size]="16" /> Générer les packs d'un sport</button>
        <button mat-flat-button (click)="edit()"><lucide-icon name="plus" [size]="16" /> Ajouter un pack</button>
      }
    </div>
    <div class="table-wrap">
      <table class="table">
        <thead><tr>
          <th [attr.aria-sort]="t.ariaSort('code')"><app-sort [table]="t" key="code">ID</app-sort></th>
          <th [attr.aria-sort]="t.ariaSort('name')"><app-sort [table]="t" key="name">Nom du pack</app-sort></th>
          <th [attr.aria-sort]="t.ariaSort('sport')"><app-sort [table]="t" key="sport">Sport</app-sort></th>
          <th [attr.aria-sort]="t.ariaSort('months')"><app-sort [table]="t" key="months">Durée</app-sort></th>
          <th class="num" [attr.aria-sort]="t.ariaSort('price')"><app-sort [table]="t" key="price">Prix / mois</app-sort></th>
          <th>Remise vs mensuel</th>
          <th class="num" [attr.aria-sort]="t.ariaSort('total')"><app-sort [table]="t" key="total">Prix total</app-sort></th>
          <th>Actif</th>
          @if (canEdit()) {<th><span class="sr-only">Actions</span></th>}
        </tr></thead>
        <tbody>
          @for (p of t.page(); track p.id) {
            <tr [class.inactive]="!p.active">
              <td class="code">{{ p.code }}</td><td class="strong">{{ p.name }}</td>
              <td><app-sport-chip [name]="p.sport.name" [color]="p.sport.color" [inactive]="!p.sport.active" /></td>
              <td>{{ p.duration.label }} <small class="muted">({{ p.duration.months }} mois)</small></td>
              <td class="num">{{ p.monthlyPrice | money }}</td>
              <td>{{ p.discount.name }}</td>
              <td class="num strong">{{ p.total | money }}</td>
              <td><app-active-badge [active]="p.active" /></td>
              @if (canEdit()) {
                <td class="actions">
                  <button class="icon-btn" (click)="edit(p)" matTooltip="Modifier" [attr.aria-label]="'Modifier ' + p.name"><lucide-icon name="pencil" [size]="16" /></button>
                  <button class="icon-btn" (click)="toggle(p)" [matTooltip]="p.active ? 'Désactiver' : 'Réactiver'" [attr.aria-label]="(p.active ? 'Désactiver ' : 'Réactiver ') + p.name"><lucide-icon name="power" [size]="16" /></button>
                  <button class="icon-btn danger" (click)="remove(p)" matTooltip="Supprimer" [attr.aria-label]="'Supprimer ' + p.name"><lucide-icon name="trash-2" [size]="16" /></button>
                </td>
              }
            </tr>
          } @empty {<tr><td colspan="9" class="empty">Aucun pack.</td></tr>}
        </tbody>
      </table>
    </div>
    <app-pager [table]="t" />
  `,
})
export class PacksPage {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private confirm = inject(ConfirmService);
  private notify = inject(NotifyService);
  private config = inject(ConfigService);
  private auth = inject(AuthService);
  canEdit = computed(() => this.auth.can('EDIT_REFERENTIALS'));
  sports = signal<SportView[]>([]);
  durations = signal<DurationView[]>([]);
  discounts = signal<DiscountView[]>([]);

  t = new TableState<PackView>({
    searchText: (p) => `${p.code} ${p.name} ${p.sport.name} ${p.duration.label} ${p.discount.name}`,
    sort: { code: (p) => p.code, name: (p) => p.name, sport: (p) => p.sport.name, months: (p) => p.duration.months, price: (p) => p.monthlyPrice, total: (p) => p.total },
    defaultSort: { key: 'code', dir: 'asc' },
    isActive: (p) => p.active,
    pageSize: computed(() => this.config.pageSize()),
  });

  constructor() {
    this.load();
  }

  async load(): Promise<void> {
    try {
      const [p, s, du, di] = await Promise.all([this.api.packs(), this.api.sports(), this.api.durations(), this.api.discounts()]);
      this.t.rows.set(p);
      this.sports.set(s);
      this.durations.set(du);
      this.discounts.set(di);
    } catch (e) {
      this.notify.error(e);
    }
  }

  private data(pack?: PackView): PackDialogData {
    return { pack, sports: this.sports(), durations: this.durations(), discounts: this.discounts() };
  }

  async edit(pack?: PackView): Promise<void> {
    if (await firstValueFrom(this.dialog.open(PackFormDialog, { data: this.data(pack), width: '640px', maxWidth: '96vw' }).afterClosed())) this.load();
  }

  async generate(): Promise<void> {
    if (await firstValueFrom(this.dialog.open(GeneratePacksDialog, { data: this.data(), width: '820px', maxWidth: '96vw' }).afterClosed())) this.load();
  }

  async toggle(p: PackView): Promise<void> {
    const ok = await this.confirm.confirm({
      title: `${p.active ? 'Désactiver' : 'Réactiver'} le pack « ${p.name} » ?`,
      message: p.active ? 'Il ne sera plus proposé, mais reste affiché sur les adhérents qui l’ont déjà.' : undefined,
      confirmLabel: p.active ? 'Désactiver' : 'Réactiver', danger: p.active,
    });
    if (!ok) return;
    try {
      await this.api.setActive('packs', p.id, !p.active);
      this.load();
    } catch (e) {
      this.notify.error(e);
    }
  }

  async remove(p: PackView): Promise<void> {
    if (!(await this.confirm.confirm({ title: `Supprimer le pack « ${p.name} » ?`, message: 'Un pack utilisé par un adhérent ne peut pas être supprimé : désactivez-le.', confirmLabel: 'Supprimer', danger: true }))) return;
    try {
      await this.api.remove('packs', p.id);
      this.notify.success('Pack supprimé.');
      this.load();
    } catch (e) {
      this.notify.error(e);
    }
  }

  csv(): void {
    exportCsv('packs', [
      { header: 'ID', value: (p) => p.code }, { header: 'Nom du pack', value: (p) => p.name }, { header: 'Sport', value: (p) => p.sport.name },
      { header: 'Durée', value: (p) => p.duration.label }, { header: 'Prix / mois', value: (p) => csvNumber(p.monthlyPrice) },
      { header: 'Remise', value: (p) => p.discount.name }, { header: 'Prix total', value: (p) => csvNumber(p.total) },
      { header: 'Actif', value: (p) => (p.active ? 'Oui' : 'Non') },
    ], this.t.filtered());
  }
}
