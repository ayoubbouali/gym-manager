import { Component, DestroyRef, computed, effect, inject, signal, untracked } from '@angular/core';
import { CdkConnectedOverlay } from '@angular/cdk/overlay';
import { CdkScrollable } from '@angular/cdk/scrolling';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { exportCsv } from '../../core/csv';
import { FunctionView, SportView, StaffList, StaffView } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ActiveBadge, SportChip } from '../../shared/badges';
import { ConfirmService } from '../../shared/confirm.service';
import { Pager, SortHeader, TableState } from '../../shared/table';
import { PREVIEW_DELAY_MS, PREVIEW_POSITIONS } from '../members/members-page';
import { FunctionManageDialog, StaffFormDialog } from './staff-dialogs';
import { StaffPreview, payModeLabel } from './staff-preview';

@Component({
  selector: 'app-staff',
  imports: [FormsModule, RouterLink, CdkConnectedOverlay, CdkScrollable, MatButtonModule, MatFormFieldModule, MatSelectModule, MatSlideToggleModule, MatTooltipModule, LucideAngularModule,
    SortHeader, Pager, SportChip, ActiveBadge, StaffPreview],
  template: `
    <div class="toolbar">
      <label class="search grow"><lucide-icon name="search" [size]="18" />
        <input type="search" placeholder="Rechercher" [ngModel]="t.search()" (ngModelChange)="t.setSearch($event)" aria-label="Rechercher un membre du personnel" /></label>
      <button class="icon-btn" (click)="manageFunctions()" matTooltip="Ajouter ou supprimer des fonctions" aria-label="Ajouter ou supprimer des fonctions"><lucide-icon name="pencil" [size]="18" /></button>
      <mat-form-field subscriptSizing="dynamic" class="w-200"><mat-label>Fonction</mat-label>
        <mat-select [ngModel]="fFunction()" (ngModelChange)="fFunction.set($event); t.resetPage()">
          <mat-option [value]="null">Toutes</mat-option>
          @for (f of functions(); track f.id) {<mat-option [value]="f.id">{{ f.label }}</mat-option>}
        </mat-select>
      </mat-form-field>
      <mat-slide-toggle [ngModel]="t.showInactive()" (ngModelChange)="t.showInactive.set($event)">Afficher les inactifs</mat-slide-toggle>
      <button mat-stroked-button (click)="csv()"><lucide-icon name="download" [size]="16" /> CSV</button>
      <button mat-flat-button (click)="edit()"><lucide-icon name="plus" [size]="16" /> Ajouter</button>
    </div>
    <div class="table-wrap" cdkScrollable>
      <table class="table">
        <thead><tr>
          <th [attr.aria-sort]="t.ariaSort('code')"><app-sort [table]="t" key="code">ID</app-sort></th>
          <th [attr.aria-sort]="t.ariaSort('last')"><app-sort [table]="t" key="last">Nom</app-sort></th>
          <th [attr.aria-sort]="t.ariaSort('first')"><app-sort [table]="t" key="first">Prénom</app-sort></th>
          <th>Téléphone</th>
          <th [attr.aria-sort]="t.ariaSort('fn')"><app-sort [table]="t" key="fn">Fonction</app-sort></th>
          <th>Sports encadrés</th>
          <th [attr.aria-sort]="t.ariaSort('mode')"><app-sort [table]="t" key="mode">Mode</app-sort></th>
          <th class="num" [attr.aria-sort]="t.ariaSort('members')"><app-sort [table]="t" key="members">Inscrits actifs</app-sort></th>
          <th>Actif</th><th><span class="sr-only">Actions</span></th>
        </tr></thead>
        <tbody>
          @for (s of t.page(); track s.id) {
            <tr [class.inactive]="!s.active">
              <td><a class="code-link" [routerLink]="['/personnel/fiche', s.code]" [attr.aria-describedby]="preview()?.staff?.id === s.id ? previewId : null"
                     (mouseenter)="openPreview(s, $event)" (focus)="openPreview(s, $event)" (mouseleave)="closePreview()" (blur)="closePreview()" (keydown.escape)="closePreview()">{{ s.code }}</a></td>
              <td class="strong">{{ s.lastName }}</td><td>{{ s.firstName || '—' }}</td><td>{{ s.phone || '—' }}</td>
              <td>{{ s.function?.label ?? '—' }}</td>
              <td>@for (x of s.sports; track x.id) {<app-sport-chip [name]="x.name" [color]="x.color" [inactive]="!x.active" />} @empty {<span class="muted">—</span>}</td>
              <td><span class="badge" [class.info]="s.payMode === 'FIXED'" [class.warn]="s.payMode === 'COMMISSION'" [class.neutral]="s.internal">{{ payModeLabel(s) }}</span></td>
              <td class="num">@if (s.activeMembers !== null) {<span class="strong">{{ s.activeMembers }}</span>} @else {<span class="muted">—</span>}</td>
              <td><app-active-badge [active]="s.active" /></td>
              <td class="actions">
                <button class="icon-btn" (click)="edit(s)" matTooltip="Modifier" [attr.aria-label]="'Modifier ' + s.name"><lucide-icon name="pencil" [size]="16" /></button>
                <button class="icon-btn" (click)="toggle(s)" [matTooltip]="s.active ? 'Désactiver' : 'Réactiver'" [attr.aria-label]="(s.active ? 'Désactiver ' : 'Réactiver ') + s.name"><lucide-icon name="power" [size]="16" /></button>
                <button class="icon-btn danger" (click)="remove(s)" matTooltip="Supprimer" [attr.aria-label]="'Supprimer ' + s.name"><lucide-icon name="trash-2" [size]="16" /></button>
              </td>
            </tr>
          } @empty {<tr><td colspan="10" class="empty">Aucun membre du personnel.</td></tr>}
        </tbody>
        <tfoot><tr>
          <td colspan="10">Effectif actif : <b>{{ list()?.activeCount ?? 0 }}</b></td>
        </tr></tfoot>
      </table>
    </div>
    <app-pager [table]="t" />
    @if (preview(); as p) {
      <ng-template cdkConnectedOverlay [cdkConnectedOverlayOpen]="true" [cdkConnectedOverlayOrigin]="p.origin"
                   [cdkConnectedOverlayPositions]="previewPositions" [cdkConnectedOverlayPush]="true" [cdkConnectedOverlayViewportMargin]="8"
                   cdkConnectedOverlayPanelClass="member-preview-pane" (detach)="closePreview()">
        <app-staff-preview [id]="previewId" [staff]="p.staff" />
      </ng-template>
    }
  `,
})
export class StaffPage {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private confirm = inject(ConfirmService);
  private notify = inject(NotifyService);
  private config = inject(ConfigService);
  list = signal<StaffList | null>(null);
  functions = signal<FunctionView[]>([]);
  sports = signal<SportView[]>([]);
  fFunction = signal<number | null>(null);
  payModeLabel = payModeLabel;

  t = new TableState<StaffView>({
    searchText: (s) => `${s.code} ${s.name} ${s.phone} ${s.function?.label ?? ''} ${s.sports.map((x) => x.name).join(' ')}`,
    sort: { code: (s) => s.code, last: (s) => s.lastName, first: (s) => s.firstName, fn: (s) => s.function?.label, mode: (s) => payModeLabel(s), members: (s) => s.activeMembers ?? -1 },
    defaultSort: { key: 'code', dir: 'asc' },
    isActive: (s) => s.active,
    filter: () => {
      const f = this.fFunction();
      return (s) => !f || s.functionId === f;
    },
    pageSize: computed(() => this.config.pageSize()),
  });

  readonly previewId = 'staff-preview';
  readonly previewPositions = PREVIEW_POSITIONS;
  preview = signal<{ staff: StaffView; origin: HTMLElement } | null>(null);
  private previewTimer: ReturnType<typeof setTimeout> | undefined;

  constructor() {
    // A row that disappears under the pointer (search, paging, reload) never fires mouseleave.
    effect(() => {
      this.t.page();
      untracked(() => this.closePreview());
    });
    inject(DestroyRef).onDestroy(() => clearTimeout(this.previewTimer));
    this.load();
  }

  openPreview(s: StaffView, event: Event): void {
    const origin = event.currentTarget as HTMLElement;
    clearTimeout(this.previewTimer);
    // On focus, open at once so screen readers announce the description.
    if (event.type === 'focus') this.preview.set({ staff: s, origin });
    else this.previewTimer = setTimeout(() => this.preview.set({ staff: s, origin }), PREVIEW_DELAY_MS);
  }

  closePreview(): void {
    clearTimeout(this.previewTimer);
    this.preview.set(null);
  }

  async load(): Promise<void> {
    try {
      const [l, f, s] = await Promise.all([this.api.staff(), this.api.functions(), this.api.sports()]);
      this.list.set(l);
      this.t.rows.set(l.rows);
      this.functions.set(f);
      this.sports.set(s);
    } catch (e) {
      this.notify.error(e);
    }
  }

  /** Adds or deletes functions; those given to a staff member (active or not) cannot be deleted. */
  async manageFunctions(): Promise<void> {
    const used = new Set((this.list()?.rows ?? []).map((s) => s.functionId));
    const ref = this.dialog.open(FunctionManageDialog, { data: { functions: this.functions(), used }, width: '440px', maxWidth: '96vw' });
    if (!(await firstValueFrom(ref.afterClosed()))) return;
    await this.load();
    const f = this.fFunction();
    if (f && !this.functions().some((x) => x.id === f)) this.fFunction.set(null);
  }

  async edit(staff?: StaffView): Promise<void> {
    const ok = await firstValueFrom(this.dialog.open(StaffFormDialog, {
      data: { staff, functions: this.functions(), sports: this.sports() }, width: '680px', maxWidth: '96vw',
    }).afterClosed());
    if (ok) this.load();
  }

  async toggle(s: StaffView): Promise<void> {
    const ok = await this.confirm.confirm({
      title: `${s.active ? 'Désactiver' : 'Réactiver'} ${s.name} ?`,
      message: s.active ? "Il/elle sort de la masse salariale et n'est plus proposé(e) comme coach ou responsable." : undefined,
      confirmLabel: s.active ? 'Désactiver' : 'Réactiver', danger: s.active,
    });
    if (!ok) return;
    try {
      await this.api.setActive('staff', s.id, !s.active);
      this.load();
    } catch (e) {
      this.notify.error(e);
    }
  }

  async remove(s: StaffView): Promise<void> {
    if (!(await this.confirm.confirm({ title: `Supprimer ${s.name} ?`, message: 'Un coach rattaché à un sport ou responsable d’une activité ne peut pas être supprimé : désactivez-le.', confirmLabel: 'Supprimer', danger: true }))) return;
    try {
      await this.api.remove('staff', s.id);
      this.notify.success('Membre du personnel supprimé.');
      this.load();
    } catch (e) {
      this.notify.error(e);
    }
  }

  csv(): void {
    exportCsv('personnel', [
      { header: 'ID', value: (s) => s.code }, { header: 'Nom', value: (s) => s.lastName }, { header: 'Prénom', value: (s) => s.firstName },
      { header: 'Téléphone', value: (s) => s.phone }, { header: 'Fonction', value: (s) => s.function?.label ?? '' },
      { header: 'Sports encadrés', value: (s) => s.sports.map((x) => x.name).join(', ') },
      { header: 'Mode', value: (s) => payModeLabel(s) }, { header: 'Inscrits actifs', value: (s) => s.activeMembers ?? '' },
      { header: 'Actif', value: (s) => (s.active ? 'Oui' : 'Non') },
    ], this.t.filtered());
  }
}
