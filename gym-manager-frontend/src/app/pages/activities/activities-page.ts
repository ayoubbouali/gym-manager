import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatDialog } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { AuthService } from '../../core/auth.service';
import { ConfigService } from '../../core/config.service';
import { csvNumber, exportCsv } from '../../core/csv';
import { FrDateTimePipe, MoneyPipe, formatDateTime } from '../../core/format';
import { ActivityView, MemberView, RegistrationView } from '../../core/models';
import { NotifyService } from '../../core/notify.service';
import { ActiveBadge } from '../../shared/badges';
import { ConfirmService } from '../../shared/confirm.service';
import { SelectOption } from '../../shared/multi-select';
import { SearchSelect } from '../../shared/search-select';
import { Pager, Paged, SortHeader, TableState } from '../../shared/table';
import { ActivityFormDialog } from './activity-form-dialog';

@Component({
  selector: 'app-activities',
  imports: [FormsModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatSelectModule, MatSlideToggleModule, MatTooltipModule,
    LucideAngularModule, SortHeader, Pager, ActiveBadge, SearchSelect, MoneyPipe, FrDateTimePipe],
  template: `
    <div class="split">
      <section class="card">
        <div class="card-head">
          <h3>Activités</h3><span class="grow"></span>
          <mat-button-toggle-group [ngModel]="when()" (ngModelChange)="when.set($event); a.resetPage()" aria-label="Période">
            <mat-button-toggle value="ALL">Toutes</mat-button-toggle>
            <mat-button-toggle value="UPCOMING">À venir</mat-button-toggle>
            <mat-button-toggle value="PAST">Passées</mat-button-toggle>
          </mat-button-toggle-group>
          @if (canEdit()) {<button mat-flat-button (click)="edit()"><lucide-icon name="plus" [size]="16" /> Nouvelle activité</button>}
        </div>
        <div class="toolbar">
          <label class="search grow"><lucide-icon name="search" [size]="18" /><input type="search" placeholder="Rechercher une activité" [ngModel]="a.search()" (ngModelChange)="a.setSearch($event)" aria-label="Rechercher une activité" /></label>
          <mat-slide-toggle [ngModel]="a.showInactive()" (ngModelChange)="a.showInactive.set($event)">Inactives</mat-slide-toggle>
          <button mat-stroked-button (click)="csv()"><lucide-icon name="download" [size]="16" /> CSV</button>
        </div>
        <div class="table-wrap flat">
          <table class="table">
            <thead><tr>
              <th [attr.aria-sort]="a.ariaSort('code')"><app-sort [table]="a" key="code">ID</app-sort></th>
              <th [attr.aria-sort]="a.ariaSort('name')"><app-sort [table]="a" key="name">Activité</app-sort></th>
              <th class="num" [attr.aria-sort]="a.ariaSort('price')"><app-sort [table]="a" key="price">Prix</app-sort></th>
              <th [attr.aria-sort]="a.ariaSort('date')"><app-sort [table]="a" key="date">Date & heure</app-sort></th>
              <th>Lieu</th>
              <th class="num" [attr.aria-sort]="a.ariaSort('count')"><app-sort [table]="a" key="count">Inscrits / places</app-sort></th>
              <th>Responsable</th><th>Actif</th>
              @if (canEdit()) {<th><span class="sr-only">Actions</span></th>}
            </tr></thead>
            <tbody>
              @for (x of a.page(); track x.id) {
                <tr class="clickable" [class.selected]="selected() === x.id" [class.inactive]="!x.active" (click)="select(x.id)"
                    tabindex="0" (keydown.enter)="select(x.id)" [attr.aria-selected]="selected() === x.id">
                  <td class="code">{{ x.code }}</td>
                  <td class="strong">{{ x.name }} @if (x.past) {<span class="badge neutral">passée</span>}</td>
                  <td class="num">@if (x.paid) {{{ x.price | money }}} @else {<span class="badge neutral">Gratuite</span>}</td>
                  <td>{{ x.startsAt | frDateTime }}</td>
                  <td>{{ x.location || '—' }}</td>
                  <td class="num"><span [class.red]="x.full">{{ x.registrationCount }} / {{ x.maxPlaces ?? '–' }}</span></td>
                  <td>{{ x.manager?.name ?? '—' }}
                    @if (x.paid) {
                      <div class="muted small">@if (x.managerPercent !== null) {{{ x.managerPercent }} %@if (x.managerShare !== null) { · {{ x.managerShare | money }}}} @else {Interne, sans part}</div>
                    }
                  </td>
                  <td><app-active-badge [active]="x.active" /></td>
                  @if (canEdit()) {
                    <td class="actions" (click)="$event.stopPropagation()">
                      <button class="icon-btn" (click)="edit(x)" matTooltip="Modifier" [attr.aria-label]="'Modifier ' + x.name"><lucide-icon name="pencil" [size]="16" /></button>
                      <button class="icon-btn" (click)="toggle(x)" [matTooltip]="x.active ? 'Désactiver' : 'Réactiver'" [attr.aria-label]="(x.active ? 'Désactiver ' : 'Réactiver ') + x.name"><lucide-icon name="power" [size]="16" /></button>
                      <button class="icon-btn danger" (click)="remove(x)" matTooltip="Supprimer" [attr.aria-label]="'Supprimer ' + x.name"><lucide-icon name="trash-2" [size]="16" /></button>
                    </td>
                  }
                </tr>
              } @empty {<tr><td colspan="9" class="empty">Aucune activité.</td></tr>}
            </tbody>
          </table>
        </div>
        <app-pager [table]="a" />
      </section>

      <section class="card">
        <div class="card-head">
          <h3>Liste des inscrits</h3><span class="grow"></span>
          <mat-form-field subscriptSizing="dynamic" class="w-220"><mat-label>Activité</mat-label>
            <mat-select [ngModel]="selected()" (ngModelChange)="selected.set($event)">
              <mat-option [value]="null">Toutes les activités</mat-option>
              @for (x of activities(); track x.id) {<mat-option [value]="x.id">{{ x.name }}</mat-option>}
            </mat-select>
          </mat-form-field>
        </div>
        <div class="scroll-x"><table class="table compact">
          <thead><tr><th>Nom & prénom</th><th>Activité</th><th><span class="sr-only">Actions</span></th></tr></thead>
          <tbody>
            @for (r of registrationRows.page(); track r.id) {
              <tr>
                <td><span class="code">{{ r.memberCode }}</span> {{ r.memberName }}</td>
                <td>{{ r.activityName }}</td>
                <td class="actions"><button class="icon-btn danger" (click)="unregister(r)" matTooltip="Retirer" [attr.aria-label]="'Retirer ' + r.memberName + ' de ' + r.activityName"><lucide-icon name="x" [size]="16" /></button></td>
              </tr>
            } @empty {<tr><td colspan="3" class="empty">Aucun inscrit.</td></tr>}
          </tbody>
        </table></div>
        <app-pager [table]="registrationRows" [auto]="true" />
        <div class="add-row">
          <app-search-select label="Adhérent" [options]="memberOptions()" [(ngModel)]="newMember" />
          <mat-form-field subscriptSizing="dynamic"><mat-label>Activité</mat-label>
            <mat-select [(ngModel)]="newActivity">
              @for (x of openActivities(); track x.id) {<mat-option [value]="x.id" [disabled]="x.full">{{ x.name }}{{ x.full ? ' (complète)' : '' }}</mat-option>}
            </mat-select>
          </mat-form-field>
          <button mat-flat-button (click)="register()" [disabled]="!newMember || !(newActivity ?? selected())" aria-label="Ajouter l'inscription"><lucide-icon name="plus" [size]="16" /> Inscrire</button>
        </div>
      </section>
    </div>
  `,
})
export class ActivitiesPage {
  private api = inject(ApiService);
  private dialog = inject(MatDialog);
  private confirm = inject(ConfirmService);
  private notify = inject(NotifyService);
  private config = inject(ConfigService);
  private auth = inject(AuthService);
  canEdit = computed(() => this.auth.can('EDIT_REFERENTIALS'));

  activities = signal<ActivityView[]>([]);
  registrations = signal<RegistrationView[]>([]);
  members = signal<MemberView[]>([]);
  selected = signal<number | null>(null);
  when = signal<'ALL' | 'UPCOMING' | 'PAST'>('ALL');
  newMember: number | null = null;
  newActivity: number | null = null;

  a = new TableState<ActivityView>({
    searchText: (x) => `${x.code} ${x.name} ${x.location} ${x.manager?.name ?? ''}`,
    sort: { code: (x) => x.code, name: (x) => x.name, price: (x) => x.price, date: (x) => x.startsAt, count: (x) => x.registrationCount },
    defaultSort: { key: 'date', dir: 'asc' },
    isActive: (x) => x.active,
    filter: () => {
      const w = this.when();
      return (x) => w === 'ALL' || (w === 'PAST' ? x.past : !x.past);
    },
    pageSize: computed(() => this.config.pageSize()),
  });

  shownRegistrations = computed(() => {
    const id = this.selected();
    return this.registrations().filter((r) => !id || r.activityId === id).sort((x, y) => x.memberName.localeCompare(y.memberName, 'fr'));
  });
  registrationRows = new Paged(() => this.shownRegistrations());
  memberOptions = computed<SelectOption[]>(() =>
    this.members().map((m) => ({ id: m.id, label: `${m.firstName} ${m.lastName}`, hint: m.code })));
  openActivities = computed(() => this.activities().filter((x) => x.active));

  constructor() {
    this.load();
    this.api.members().then((m) => this.members.set(m));
  }

  async load(): Promise<void> {
    try {
      const [a, r] = await Promise.all([this.api.activities(), this.api.registrations()]);
      this.activities.set(a);
      this.a.rows.set(a);
      this.registrations.set(r);
    } catch (e) {
      this.notify.error(e);
    }
  }

  select(id: number): void {
    this.selected.set(this.selected() === id ? null : id);
    this.newActivity = this.selected();
  }

  async register(): Promise<void> {
    const activityId = this.newActivity ?? this.selected();
    try {
      await this.api.post('/registrations', { memberId: this.newMember, activityId });
      this.notify.success('Inscription ajoutée.');
      this.newMember = null;
      this.load();
    } catch (e) {
      this.notify.error(e);
    }
  }

  async unregister(r: RegistrationView): Promise<void> {
    if (!(await this.confirm.confirm({ title: `Retirer ${r.memberName} de « ${r.activityName} » ?`, confirmLabel: 'Retirer', danger: true }))) return;
    try {
      await this.api.remove('registrations', r.id);
      this.load();
    } catch (e) {
      this.notify.error(e);
    }
  }

  async edit(activity?: ActivityView): Promise<void> {
    const staff = await this.api.staffOptions();
    if (await firstValueFrom(this.dialog.open(ActivityFormDialog, { data: { activity, staff }, width: '680px', maxWidth: '96vw' }).afterClosed())) this.load();
  }

  async toggle(x: ActivityView): Promise<void> {
    const ok = await this.confirm.confirm({ title: `${x.active ? 'Désactiver' : 'Réactiver'} l'activité « ${x.name} » ?`, confirmLabel: x.active ? 'Désactiver' : 'Réactiver', danger: x.active });
    if (!ok) return;
    try {
      await this.api.setActive('activities', x.id, !x.active);
      this.load();
    } catch (e) {
      this.notify.error(e);
    }
  }

  async remove(x: ActivityView): Promise<void> {
    if (!(await this.confirm.confirm({ title: `Supprimer l'activité « ${x.name} » ?`, message: 'Une activité avec des inscrits ne peut pas être supprimée : désactivez-la.', confirmLabel: 'Supprimer', danger: true }))) return;
    try {
      await this.api.remove('activities', x.id);
      this.notify.success('Activité supprimée.');
      this.load();
    } catch (e) {
      this.notify.error(e);
    }
  }

  csv(): void {
    exportCsv('activites', [
      { header: 'ID', value: (x) => x.code }, { header: 'Activité', value: (x) => x.name }, { header: 'Prix', value: (x) => csvNumber(x.price) },
      { header: 'Date et heure', value: (x) => formatDateTime(x.startsAt) }, { header: 'Lieu', value: (x) => x.location },
      { header: 'Inscrits', value: (x) => x.registrationCount }, { header: 'Places max', value: (x) => x.maxPlaces ?? '' },
      { header: 'Responsable', value: (x) => x.manager?.name ?? '' }, { header: 'Actif', value: (x) => (x.active ? 'Oui' : 'Non') },
    ], this.a.filtered());
  }
}
