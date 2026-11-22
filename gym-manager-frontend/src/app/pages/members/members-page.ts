import { Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { csvNumber, exportCsv } from '../../core/csv';
import { FrDatePipe, MoneyPipe, PAYMENT_STATUS_LABELS, formatDate } from '../../core/format';
import { MemberView, PackView, SportView } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ConfirmService } from '../../shared/confirm.service';
import { DaysLeft, PaidBadge, SportChip } from '../../shared/badges';
import { Pager, SortHeader, TableState } from '../../shared/table';
import { openMemberForm } from './member-form-dialog';
import { openMemberNote } from './member-note-dialog';

/** Shared by the table and the count pill, so the filtered count can never exceed the base. */
const isActive = (m: MemberView) => m.active;

@Component({
  selector: 'app-members',
  imports: [RouterLink, FormsModule, MatButtonModule, MatSelectModule, MatFormFieldModule, MatSlideToggleModule, MatTooltipModule,
    LucideAngularModule, SortHeader, Pager, SportChip, PaidBadge, DaysLeft, MoneyPipe, FrDatePipe],
  template: `
    <div class="toolbar">
      <div class="count-pill" role="status">
        <lucide-icon name="users" [size]="18" aria-hidden="true" />
        <strong class="count-pill-num" aria-hidden="true">{{ t.filtered().length }}</strong>
        @if (narrowed()) {<span class="count-pill-of" aria-hidden="true">sur {{ base() }}</span>}
        <span class="count-pill-unit" aria-hidden="true">{{ unit() }}</span>
        <span class="sr-only">{{ count() }}</span>
      </div>
      <label class="search grow">
        <lucide-icon name="search" [size]="18" />
        <input #searchInput type="search" placeholder="Rechercher par ID, nom, prénom, téléphone…" [ngModel]="t.search()" (ngModelChange)="t.setSearch($event)" aria-label="Rechercher un adhérent" />
      </label>
      <button mat-stroked-button (click)="csv()"><lucide-icon name="download" [size]="16" /> CSV</button>
      <button mat-flat-button (click)="add()"><lucide-icon name="user-plus" [size]="16" /> Ajouter un adhérent</button>
    </div>
    <div class="filters">
      <mat-form-field subscriptSizing="dynamic"><mat-label>Sport</mat-label>
        <mat-select [ngModel]="fSport()" (ngModelChange)="fSport.set($event); t.resetPage()">
          <mat-option [value]="null">Tous</mat-option>
          @for (s of sports(); track s.id) {<mat-option [value]="s.id">{{ s.name }}</mat-option>}
        </mat-select>
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic"><mat-label>Pack</mat-label>
        <mat-select [ngModel]="fPack()" (ngModelChange)="fPack.set($event); t.resetPage()">
          <mat-option [value]="null">Tous</mat-option>
          @for (p of packs(); track p.id) {<mat-option [value]="p.id">{{ p.name }}</mat-option>}
        </mat-select>
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic"><mat-label>Statut</mat-label>
        <mat-select [ngModel]="fStatus()" (ngModelChange)="fStatus.set($event); t.resetPage()">
          <mat-option [value]="null">Tous</mat-option><mat-option value="PAYE">Payé</mat-option><mat-option value="PARTIEL">Partiel</mat-option><mat-option value="IMPAYE">Impayé</mat-option>
        </mat-select>
      </mat-form-field>
      <mat-form-field subscriptSizing="dynamic"><mat-label>Assurance</mat-label>
        <mat-select [ngModel]="fInsurance()" (ngModelChange)="fInsurance.set($event); t.resetPage()">
          <mat-option [value]="null">Toutes</mat-option><mat-option value="PAYE">Payé</mat-option><mat-option value="IMPAYE">Impayé</mat-option>
        </mat-select>
      </mat-form-field>
      <mat-slide-toggle [ngModel]="t.showInactive()" (ngModelChange)="t.showInactive.set($event)">Afficher les inactifs</mat-slide-toggle>
      @if (!filtersAtDefault()) {
        <button type="button" class="reset-fab" animate.enter="reset-in" animate.leave="reset-out" (click)="resetFilters(); searchInput.focus()"
                matTooltip="Réinitialiser les filtres" aria-label="Réinitialiser les filtres">
          <lucide-icon name="funnel-x" [size]="18" />
          <span class="reset-badge" aria-hidden="true">{{ activeFilters() }}</span>
        </button>
      }
    </div>

    <div class="table-wrap">
      <table class="table">
        <thead>
          <tr>
            <th [attr.aria-sort]="t.ariaSort('code')"><app-sort [table]="t" key="code">ID</app-sort></th>
            <th [attr.aria-sort]="t.ariaSort('lastName')"><app-sort [table]="t" key="lastName">Nom</app-sort></th>
            <th [attr.aria-sort]="t.ariaSort('firstName')"><app-sort [table]="t" key="firstName">Prénom</app-sort></th>
            <th>Téléphone</th>
            <th [attr.aria-sort]="t.ariaSort('birthDate')"><app-sort [table]="t" key="birthDate">Naissance</app-sort></th>
            <th>Sport(s)</th>
            <th [attr.aria-sort]="t.ariaSort('registrationDate')"><app-sort [table]="t" key="registrationDate">Inscription</app-sort></th>
            <th [attr.aria-sort]="t.ariaSort('pack')"><app-sort [table]="t" key="pack">Abonnement</app-sort></th>
            <th class="num" [attr.aria-sort]="t.ariaSort('price')"><app-sort [table]="t" key="price">Prix</app-sort></th>
            <th>Remise</th>
            <th [attr.aria-sort]="t.ariaSort('status')"><app-sort [table]="t" key="status">Statut</app-sort></th>
            <th class="num" [attr.aria-sort]="t.ariaSort('balance')"><app-sort [table]="t" key="balance">Reste à payer</app-sort></th>
            <th [attr.aria-sort]="t.ariaSort('days')"><app-sort [table]="t" key="days">Reste jours</app-sort></th>
            <th [attr.aria-sort]="t.ariaSort('insurance')"><app-sort [table]="t" key="insurance">Assurance</app-sort></th>
            <th>Note</th>
            <th><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          @for (m of t.page(); track m.id) {
            <tr [class.inactive]="!m.active">
              <td><a class="code-link" [routerLink]="['/fiche', m.code]">{{ m.code }}</a></td>
              <td class="strong">{{ m.lastName }}</td>
              <td>{{ m.firstName }}</td>
              <td>{{ m.phone }}</td>
              <td>{{ m.birthDate | frDate }}</td>
              <td>@for (s of m.sports; track s.id) {<app-sport-chip [name]="s.name" [color]="s.color" [inactive]="!s.active" />}</td>
              <td>{{ m.registrationDate | frDate }}</td>
              <td>{{ m.pack.name }}</td>
              <td class="num">{{ m.price | money }}</td>
              <td>{{ m.discount.name }}</td>
              <td><app-paid-badge [value]="m.paymentStatus" /></td>
              <td class="num" [class.red]="m.balance > 0">{{ m.balance > 0 ? (m.balance | money) : '—' }}</td>
              <td><app-days [days]="m.remainingDays" /></td>
              <td><app-paid-badge [value]="m.insurance" /></td>
              <td>
                @if (m.notes.trim()) {
                  <button class="icon-btn" (click)="note(m)" [matTooltip]="m.notes" matTooltipClass="note-tooltip" aria-label="Note de {{ m.code }}"><lucide-icon name="sticky-note" [size]="16" /></button>
                }
              </td>
              <td class="actions">
                <button class="icon-btn" (click)="edit(m)" matTooltip="Modifier" aria-label="Modifier {{ m.code }}"><lucide-icon name="pencil" [size]="16" /></button>
                <button class="icon-btn" (click)="toggle(m)" [matTooltip]="m.active ? 'Désactiver' : 'Réactiver'" [attr.aria-label]="(m.active ? 'Désactiver ' : 'Réactiver ') + m.code"><lucide-icon name="power" [size]="16" /></button>
                <button class="icon-btn danger" (click)="remove(m)" matTooltip="Supprimer" aria-label="Supprimer {{ m.code }}"><lucide-icon name="trash-2" [size]="16" /></button>
              </td>
            </tr>
          } @empty {
            <tr><td colspan="16" class="empty">{{ loaded() ? 'Aucun adhérent ne correspond à la recherche.' : 'Chargement…' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
    <app-pager [table]="t" />
  `,
})
export class MembersPage {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private confirm = inject(ConfirmService);
  private notify = inject(NotifyService);
  private config = inject(ConfigService);

  sports = signal<SportView[]>([]);
  packs = signal<PackView[]>([]);
  loaded = signal(false);
  fSport = signal<number | null>(null);
  fPack = signal<number | null>(null);
  fStatus = signal<string | null>(null);
  fInsurance = signal<string | null>(null);

  t = new TableState<MemberView>({
    searchText: (m) => `${m.code} ${m.lastName} ${m.firstName} ${m.phone}`,
    sort: {
      code: (m) => m.code, lastName: (m) => m.lastName, firstName: (m) => m.firstName, birthDate: (m) => m.birthDate,
      registrationDate: (m) => m.registrationDate, pack: (m) => m.pack.name, price: (m) => m.price,
      status: (m) => m.paymentStatus, balance: (m) => m.balance, days: (m) => m.remainingDays, insurance: (m) => m.insurance,
    },
    defaultSort: { key: 'code', dir: 'asc' },
    isActive,
    filter: () => {
      const [s, p, st, ins] = [this.fSport(), this.fPack(), this.fStatus(), this.fInsurance()];
      return (m) => (!s || m.sportIds.includes(s)) && (!p || m.packId === p) && (!st || m.paymentStatus === st) && (!ins || m.insurance === ins);
    },
    pageSize: computed(() => this.config.pageSize()),
  });

  /** Search, each select and the inactive toggle count as one active filter each. */
  activeFilters = computed(() => [!!this.t.search(), this.t.showInactive(), this.fSport() !== null, this.fPack() !== null,
    this.fStatus() !== null, this.fInsurance() !== null].filter(Boolean).length);
  filtersAtDefault = computed(() => this.activeFilters() === 0);

  /** Rows under the current inactive toggle, before search and selects: the filtered count never exceeds it. */
  base = computed(() => {
    const all = this.t.showInactive();
    return this.t.rows().filter((m) => all || isActive(m)).length;
  });
  narrowed = computed(() => this.t.filtered().length < this.base());
  unit = computed(() => ((this.narrowed() ? this.base() : this.t.filtered().length) > 1 ? 'adhérents' : 'adhérent'));
  count = computed(() => `${this.t.filtered().length} ${this.narrowed() ? `sur ${this.base()} ` : ''}${this.unit()}`);

  constructor() {
    this.load();
    Promise.all([this.api.sports(), this.api.packs()]).then(([s, p]) => {
      this.sports.set(s);
      this.packs.set(p);
    });
  }

  async load(): Promise<void> {
    try {
      this.t.rows.set(await this.api.members());
    } catch (e) {
      this.notify.error(e);
    } finally {
      this.loaded.set(true);
    }
  }

  async add(): Promise<void> {
    if (await openMemberForm(this.dialog)) this.load();
  }

  async edit(m: MemberView): Promise<void> {
    if (await openMemberForm(this.dialog, m)) this.load();
  }

  /** Clears the search, the selects and the inactive toggle; the sort is kept. */
  resetFilters(): void {
    this.fSport.set(null);
    this.fPack.set(null);
    this.fStatus.set(null);
    this.fInsurance.set(null);
    this.t.showInactive.set(false);
    this.t.setSearch('');
  }

  async note(m: MemberView): Promise<void> {
    if (await openMemberNote(this.dialog, m)) this.load();
  }

  async toggle(m: MemberView): Promise<void> {
    const ok = await this.confirm.confirm({
      title: `${m.active ? 'Désactiver' : 'Réactiver'} ${m.code} — ${m.firstName} ${m.lastName} ?`,
      message: m.active ? "L'adhérent n'est plus compté comme actif, mais reste consultable." : undefined,
      confirmLabel: m.active ? 'Désactiver' : 'Réactiver',
      danger: m.active,
    });
    if (!ok) return;
    try {
      await this.api.setActive('members', m.id, !m.active);
      this.notify.success(m.active ? 'Adhérent désactivé.' : 'Adhérent réactivé.');
      this.load();
    } catch (e) {
      this.notify.error(e);
    }
  }

  async remove(m: MemberView): Promise<void> {
    const ok = await this.confirm.confirm({
      title: `Supprimer l'adhérent ${m.code} — ${m.firstName} ${m.lastName} ?`,
      message: 'Ses inscriptions aux activités et sa photo seront supprimées. Cette action est irréversible.',
      confirmLabel: 'Supprimer',
      danger: true,
    });
    if (!ok) return;
    try {
      await this.api.remove('members', m.id);
      this.notify.success(`Adhérent ${m.code} supprimé.`);
      this.load();
    } catch (e) {
      this.notify.error(e);
    }
  }

  csv(): void {
    exportCsv('adherents', [
      { header: 'ID', value: (m) => m.code }, { header: 'Nom', value: (m) => m.lastName }, { header: 'Prénom', value: (m) => m.firstName },
      { header: 'Téléphone', value: (m) => m.phone }, { header: 'Date de naissance', value: (m) => formatDate(m.birthDate) },
      { header: 'Sport(s)', value: (m) => m.sports.map((s) => s.name).join(', ') },
      { header: "Date d'inscription", value: (m) => formatDate(m.registrationDate) }, { header: 'Abonnement', value: (m) => m.pack.name },
      { header: 'Prix', value: (m) => csvNumber(m.price) }, { header: 'Remise', value: (m) => m.discount.name },
      { header: 'Statut', value: (m) => PAYMENT_STATUS_LABELS[m.paymentStatus] }, { header: 'Reste à payer', value: (m) => csvNumber(m.balance) },
      { header: 'Reste jours', value: (m) => m.remainingDays },
      { header: 'Assurance', value: (m) => (m.insurance === 'PAYE' ? 'Payé' : 'Impayé') },
    ], this.t.filtered());
  }
}
