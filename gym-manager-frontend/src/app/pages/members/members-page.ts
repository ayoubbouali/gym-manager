import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { CdkConnectedOverlay, ConnectedPosition } from '@angular/cdk/overlay';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { CdkDrag, CdkDropList } from '@angular/cdk/drag-drop';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatPseudoCheckbox } from '@angular/material/core';
import { MatDividerModule } from '@angular/material/divider';
import { MatMenuModule } from '@angular/material/menu';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { csvNumber, exportCsv } from '../../core/csv';
import { FrDatePipe, MoneyPipe, PAYMENT_STATUS_LABELS, formatDate } from '../../core/format';
import { MemberView, Situation, SportView } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ConfirmService } from '../../shared/confirm.service';
import { DaysLeft, PaidBadge, SituationBadge, SportChip } from '../../shared/badges';
import { Pager, SortHeader, TableState } from '../../shared/table';
import { openMemberForm } from './member-form-dialog';
import { openMemberNote } from './member-note-dialog';
import { MemberColumnId, MemberColumns } from './member-columns';
import { MemberPreview } from './member-preview';

/** Shared by the table and the count pill, so the filtered count can never exceed the base. */
const isActive = (m: MemberView) => m.active;
/** Same rule as the Note column: a blank note does not count. */
const hasNote = (m: MemberView) => !!m.notes.trim();

const DEFAULT_SORT = { key: 'code', dir: 'asc' } as const;

/** Most urgent first when sorting the Situation column. */
const SITUATION_RANK: Record<Situation, number> = { EXPIRED: 0, SOON: 1, FOLLOW: 2, OK: 3 };

/** Hover delay before the preview card opens, so sweeping the mouse across the ID column does not flicker. */
export const PREVIEW_DELAY_MS = 300;
export const PREVIEW_ID = 'member-preview';

/** Right of the ID, then left, then below, then above: the card always stays in the viewport. */
const PREVIEW_POSITIONS: ConnectedPosition[] = [
  { originX: 'end', originY: 'center', overlayX: 'start', overlayY: 'center', offsetX: 10 },
  { originX: 'start', originY: 'center', overlayX: 'end', overlayY: 'center', offsetX: -10 },
  { originX: 'start', originY: 'bottom', overlayX: 'start', overlayY: 'top', offsetY: 8 },
  { originX: 'start', originY: 'top', overlayX: 'start', overlayY: 'bottom', offsetY: -8 },
];

@Component({
  selector: 'app-members',
  imports: [RouterLink, FormsModule, MatButtonModule, MatSelectModule, MatFormFieldModule, MatSlideToggleModule, MatTooltipModule,
    MatMenuModule, MatPseudoCheckbox, MatDividerModule, LucideAngularModule, SortHeader, Pager, SportChip, PaidBadge, SituationBadge, DaysLeft, MoneyPipe,
    FrDatePipe, CdkConnectedOverlay, CdkScrollable, CdkDropList, CdkDrag, MemberPreview],
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
      <button mat-stroked-button [matMenuTriggerFor]="columnsMenu"><lucide-icon name="columns-3" [size]="16" /> Colonnes</button>
      <mat-menu #columnsMenu="matMenu" xPosition="before" class="columns-menu">
        @for (c of cols.all(); track c.id) {
          <button mat-menu-item role="menuitemcheckbox" [attr.aria-checked]="cols.isVisible(c.id)" [disabled]="!c.hideable"
                  (click)="$event.stopPropagation(); toggleColumn(c.id)">
            <mat-pseudo-checkbox [state]="cols.isVisible(c.id) ? 'checked' : 'unchecked'" [disabled]="!c.hideable" />{{ c.label }}
          </button>
        }
        <mat-divider />
        <button mat-menu-item (click)="resetColumns()"><lucide-icon name="rotate-ccw" [size]="16" /> Affichage par défaut</button>
      </mat-menu>
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
      <mat-slide-toggle [ngModel]="fNote()" (ngModelChange)="fNote.set($event); t.resetPage()">Avec une note</mat-slide-toggle>
      <mat-slide-toggle [ngModel]="t.showInactive()" (ngModelChange)="t.showInactive.set($event)">Afficher les inactifs</mat-slide-toggle>
      @if (!filtersAtDefault()) {
        <button type="button" class="reset-fab" animate.enter="reset-in" animate.leave="reset-out" (click)="resetFilters(); searchInput.focus()"
                matTooltip="Réinitialiser les filtres" aria-label="Réinitialiser les filtres">
          <lucide-icon name="funnel-x" [size]="18" />
          <span class="reset-badge" aria-hidden="true">{{ activeFilters() }}</span>
        </button>
      }
    </div>

    <div class="table-wrap" cdkScrollable>
      <table class="table">
        <thead>
          <tr cdkDropList cdkDropListOrientation="horizontal" (cdkDropListDropped)="cols.move($event.previousIndex, $event.currentIndex)">
            @for (c of cols.visible(); track c.id) {
              <th cdkDrag cdkDragLockAxis="x" cdkDragPreviewClass="col-drag-preview" [class.num]="c.num" [attr.data-col]="c.id"
                  [attr.aria-sort]="c.sort ? t.ariaSort(c.sort) : null">
                @if (c.sort) {<app-sort [table]="t" [key]="c.sort">{{ c.label }}</app-sort>} @else { {{ c.label }} }
              </th>
            }
            <th><span class="sr-only">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          @for (m of t.page(); track m.id) {
            <tr [class.inactive]="!m.active">
              @for (c of cols.visible(); track c.id) {
                @switch (c.id) {
                  @case ('code') {
                    <td><a class="code-link" [routerLink]="['/fiche', m.code]" [attr.aria-describedby]="preview()?.member?.id === m.id ? previewId : null"
                           (mouseenter)="openPreview(m, $event)" (focus)="openPreview(m, $event)" (mouseleave)="closePreview()" (blur)="closePreview()" (keydown.escape)="closePreview()">{{ m.code }}</a></td>
                  }
                  @case ('lastName') {<td class="strong">{{ m.lastName }}</td>}
                  @case ('firstName') {<td>{{ m.firstName }}</td>}
                  @case ('phone') {<td>{{ m.phone }}</td>}
                  @case ('birthDate') {<td>{{ m.birthDate | frDate }}</td>}
                  @case ('sports') {<td>@for (s of m.sports; track s.id) {<app-sport-chip [name]="s.name" [color]="s.color" [inactive]="!s.active" />}</td>}
                  @case ('registrationDate') {<td>{{ m.registrationDate | frDate }}</td>}
                  @case ('pack') {<td>{{ m.pack.name }}</td>}
                  @case ('price') {<td class="num">{{ m.price | money }}</td>}
                  @case ('discount') {<td>{{ m.discount.name }}</td>}
                  @case ('status') {<td><app-paid-badge [value]="m.paymentStatus" /></td>}
                  @case ('paid') {<td class="num">{{ m.paid | money }}</td>}
                  @case ('balance') {<td class="num" [class.red]="m.balance > 0">{{ m.balance > 0 ? (m.balance | money) : '—' }}</td>}
                  @case ('days') {<td><app-days [days]="m.remainingDays" /></td>}
                  @case ('situation') {<td><app-situation-badge [value]="m.situation" /></td>}
                  @case ('insurance') {<td><app-paid-badge [value]="m.insurance" /></td>}
                  @case ('note') {
                    <td>
                      @if (hasNote(m)) {
                        <button class="icon-btn" (click)="note(m)" [matTooltip]="m.notes" matTooltipClass="note-tooltip" aria-label="Note de {{ m.code }}"><lucide-icon name="sticky-note" [size]="16" /></button>
                      }
                    </td>
                  }
                }
              }
              <td class="actions">
                <button class="icon-btn" (click)="edit(m)" matTooltip="Modifier" aria-label="Modifier {{ m.code }}"><lucide-icon name="pencil" [size]="16" /></button>
                <button class="icon-btn" (click)="toggle(m)" [matTooltip]="m.active ? 'Désactiver' : 'Réactiver'" [attr.aria-label]="(m.active ? 'Désactiver ' : 'Réactiver ') + m.code"><lucide-icon name="power" [size]="16" /></button>
                <button class="icon-btn danger" (click)="remove(m)" matTooltip="Supprimer" aria-label="Supprimer {{ m.code }}"><lucide-icon name="trash-2" [size]="16" /></button>
              </td>
            </tr>
          } @empty {
            <tr><td [attr.colspan]="cols.visible().length + 1" class="empty">{{ loaded() ? 'Aucun adhérent ne correspond à la recherche.' : 'Chargement…' }}</td></tr>
          }
        </tbody>
      </table>
    </div>
    <app-pager [table]="t" />
    @if (preview(); as p) {
      <ng-template cdkConnectedOverlay [cdkConnectedOverlayOpen]="true" [cdkConnectedOverlayOrigin]="p.origin"
                   [cdkConnectedOverlayPositions]="previewPositions" [cdkConnectedOverlayPush]="true" [cdkConnectedOverlayViewportMargin]="8"
                   cdkConnectedOverlayPanelClass="member-preview-pane" (detach)="closePreview()">
        <app-member-preview [id]="previewId" [member]="p.member" />
      </ng-template>
    }
  `,
})
export class MembersPage {
  readonly hasNote = hasNote;
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private confirm = inject(ConfirmService);
  private notify = inject(NotifyService);
  private config = inject(ConfigService);

  sports = signal<SportView[]>([]);
  loaded = signal(false);
  fSport = signal<number | null>(null);
  fStatus = signal<string | null>(null);
  fInsurance = signal<string | null>(null);
  fNote = signal(false);
  readonly cols = new MemberColumns();

  t = new TableState<MemberView>({
    searchText: (m) => `${m.code} ${m.lastName} ${m.firstName} ${m.phone}`,
    sort: {
      code: (m) => m.code, lastName: (m) => m.lastName, firstName: (m) => m.firstName, birthDate: (m) => m.birthDate,
      registrationDate: (m) => m.registrationDate, pack: (m) => m.pack.name, price: (m) => m.price,
      status: (m) => m.paymentStatus, paid: (m) => m.paid, balance: (m) => m.balance, days: (m) => m.remainingDays,
      situation: (m) => SITUATION_RANK[m.situation], insurance: (m) => m.insurance,
    },
    defaultSort: DEFAULT_SORT,
    isActive,
    filter: () => {
      const [s, st, ins, note] = [this.fSport(), this.fStatus(), this.fInsurance(), this.fNote()];
      return (m) => (!s || m.sportIds.includes(s)) && (!st || m.paymentStatus === st) && (!ins || m.insurance === ins) && (!note || hasNote(m));
    },
    pageSize: computed(() => this.config.pageSize()),
  });

  /** Search, each select and each toggle (note, inactive) count as one active filter each. */
  activeFilters = computed(() => [!!this.t.search(), this.t.showInactive(), this.fSport() !== null,
    this.fStatus() !== null, this.fInsurance() !== null, this.fNote()].filter(Boolean).length);
  filtersAtDefault = computed(() => this.activeFilters() === 0);

  /** Rows under the current inactive toggle, before search and selects: the filtered count never exceeds it. */
  base = computed(() => {
    const all = this.t.showInactive();
    return this.t.rows().filter((m) => all || isActive(m)).length;
  });
  narrowed = computed(() => this.t.filtered().length < this.base());
  unit = computed(() => ((this.narrowed() ? this.base() : this.t.filtered().length) > 1 ? 'adhérents' : 'adhérent'));
  count = computed(() => `${this.t.filtered().length} ${this.narrowed() ? `sur ${this.base()} ` : ''}${this.unit()}`);

  readonly previewId = PREVIEW_ID;
  readonly previewPositions = PREVIEW_POSITIONS;
  preview = signal<{ member: MemberView; origin: HTMLElement } | null>(null);
  private previewTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // A row that disappears under the pointer (search, paging, reload) never fires mouseleave.
    effect(() => {
      this.t.page();
      untracked(() => this.closePreview());
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.previewTimer));
    this.load();
    this.api.sports().then((s) => this.sports.set(s));
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

  openPreview(m: MemberView, event: Event): void {
    const origin = event.currentTarget as HTMLElement;
    clearTimeout(this.previewTimer);
    // The delay only guards against mouse flicker: on focus, open at once so screen readers announce the description.
    if (event.type === 'focus') this.preview.set({ member: m, origin });
    else this.previewTimer = setTimeout(() => this.preview.set({ member: m, origin }), PREVIEW_DELAY_MS);
  }

  closePreview(): void {
    clearTimeout(this.previewTimer);
    this.preview.set(null);
  }

  toggleColumn(id: MemberColumnId): void {
    this.cols.toggle(id);
    this.keepSortVisible();
  }

  resetColumns(): void {
    this.cols.reset();
    this.keepSortVisible();
  }

  /** Rows must never stay ordered by a column the user can no longer see. */
  private keepSortVisible(): void {
    const key = this.t.sortKey();
    if (key && !this.cols.visible().some((c) => c.sort === key)) {
      this.t.sortKey.set(DEFAULT_SORT.key);
      this.t.sortDir.set(DEFAULT_SORT.dir);
    }
  }

  async add(): Promise<void> {
    if (await openMemberForm(this.dialog)) this.load();
  }

  async edit(m: MemberView): Promise<void> {
    if (await openMemberForm(this.dialog, m)) this.load();
  }

  /** Clears the search, the selects and the toggles; the sort is kept. */
  resetFilters(): void {
    this.fSport.set(null);
    this.fStatus.set(null);
    this.fInsurance.set(null);
    this.fNote.set(false);
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
