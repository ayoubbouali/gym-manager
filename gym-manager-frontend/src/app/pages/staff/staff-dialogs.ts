import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { ApiService } from '../../core/api.service';
import { FrDatePipe, MoneyPipe, formatAmount, monthName } from '../../core/format';
import { FunctionView, SportView, StaffView } from '../../core/models';
import { NotifyService, errorMessage } from '../../core/notify.service';
import { MultiSelect, SelectOption } from '../../shared/multi-select';
import { PhoneInput, PhoneValue } from '../../shared/phone-input';
import { Pager, Paged } from '../../shared/table';

@Component({
  selector: 'app-staff-form',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule, MultiSelect, PhoneInput],
  template: `
    <h2 mat-dialog-title>{{ d.staff ? 'Modifier ' + d.staff.code + ' — ' + d.staff.name : 'Nouveau membre du personnel' }}</h2>
    <mat-dialog-content>
      <form id="staff-form" class="form-grid" (ngSubmit)="save()">
        <mat-form-field><mat-label>Nom</mat-label><input matInput name="last" [(ngModel)]="v.lastName" required /></mat-form-field>
        <mat-form-field><mat-label>Prénom</mat-label><input matInput name="first" [(ngModel)]="v.firstName" /></mat-form-field>
        <app-phone-input label="Téléphone" name="phone" [(ngModel)]="v.phone" />
        <mat-form-field><mat-label>Fonction</mat-label>
          <mat-select name="fn" [(ngModel)]="v.functionId" required>
            @for (f of functions; track f.id) {<mat-option [value]="f.id">{{ f.label }}</mat-option>}
          </mat-select>
        </mat-form-field>
        <app-multi-select class="span-2" label="Sports encadrés" name="sports" [(ngModel)]="v.sportIds" [options]="sportOptions" />
        <div class="field-block">
          <span class="field-label">Personnel interne ?</span>
          <mat-button-toggle-group name="internal" [(ngModel)]="v.internal" aria-label="Personnel interne">
            <mat-button-toggle [value]="false">Non</mat-button-toggle>
            <mat-button-toggle [value]="true">Interne</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
        @if (v.internal) {
          <p class="muted small">Aucune rémunération : n’apparaît pas dans la paie du personnel.</p>
        } @else {
          <div class="field-block">
            <span class="field-label">Mode de rémunération</span>
            <mat-button-toggle-group name="mode" [(ngModel)]="v.payMode" aria-label="Mode de rémunération">
              <mat-button-toggle value="COMMISSION">Commission</mat-button-toggle>
              <mat-button-toggle value="FIXED">Fixe</mat-button-toggle>
            </mat-button-toggle-group>
          </div>
          @if (v.payMode === 'FIXED') {
            <mat-form-field><mat-label>Salaire fixe mensuel</mat-label><input matInput type="number" min="0" step="0.01" name="fixed" [(ngModel)]="v.fixedSalary" required /></mat-form-field>
          } @else {
            <p class="muted small">Salaire = part du prix mensuel des adhérents en cours dans ses sports ; un inscrit à partir du jour limite du mois compte le mois suivant (Paramètres › Salaire).</p>
          }
        }
      </form>
      @if (error()) {<p class="form-error" role="alert">{{ error() }}</p>}
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Annuler</button>
      <button mat-flat-button type="submit" form="staff-form" [disabled]="busy()">Enregistrer</button>
    </mat-dialog-actions>
  `,
})
export class StaffFormDialog {
  d = inject<{ staff?: StaffView; functions: FunctionView[]; sports: SportView[] }>(MAT_DIALOG_DATA);
  private api = inject(ApiService);
  private ref = inject(MatDialogRef<StaffFormDialog>);
  private notify = inject(NotifyService);
  functions = this.d.functions.filter((f) => f.active || f.id === this.d.staff?.functionId);
  sportOptions: SelectOption[] = this.d.sports.map((s) => ({ id: s.id, label: s.name, color: s.color, disabled: !s.active }));
  v = {
    lastName: this.d.staff?.lastName ?? '',
    firstName: this.d.staff?.firstName ?? '',
    phone: { country: null, number: this.d.staff?.phone ?? '' } as PhoneValue,
    functionId: this.d.staff?.functionId ?? (null as number | null),
    sportIds: [...(this.d.staff?.sportIds ?? [])],
    internal: this.d.staff?.internal ?? false,
    payMode: this.d.staff?.payMode ?? 'COMMISSION',
    fixedSalary: this.d.staff?.fixedSalary ?? (null as number | null),
  };
  busy = signal(false);
  error = signal('');

  async save(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const pay = this.v.internal ? { payMode: null, fixedSalary: null } : {};
      await this.api.save('staff', this.d.staff?.id, { ...this.v, ...pay, phone: this.v.phone.number, phoneCountry: this.v.phone.country });
      this.notify.success(this.d.staff ? 'Fiche mise à jour.' : 'Membre du personnel ajouté.');
      this.ref.close(true);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

/** Makes a commission salary verifiable: members counted, monthly prices, share, cut-off day. */
@Component({
  selector: 'app-salary-detail',
  imports: [MatDialogModule, MatButtonModule, Pager, MoneyPipe, FrDatePipe],
  template: `
    <h2 mat-dialog-title>Détail du salaire — {{ s.name }} · {{ month }}</h2>
    <mat-dialog-content>
      <p class="muted">Sports encadrés : {{ sportNames || 'aucun' }} · plusieurs coachs : {{ s.salaryDetail.multiCoach === 'SPLIT' ? 'partage égal' : 'part entière chacun' }}</p>
      <p class="muted">Adhérents dont l'abonnement est en cours en {{ month }}, au prix mensuel. Un inscrit à partir du
        {{ s.salaryDetail.cutoffDay }} du mois compte à partir du mois suivant : les nouveaux inscrits comptés ce mois-ci
        sont ceux du {{ s.salaryDetail.from | frDate }} au {{ s.salaryDetail.to | frDate }}.</p>
      <table class="table compact">
        <thead><tr><th>Adhérent</th><th>Pack</th><th>Début</th><th class="num">Prix / mois</th>@if (split) {<th class="num">Part</th>}</tr></thead>
        <tbody>
          @for (l of lines.page(); track l.memberId) {
            <tr><td><span class="code">{{ l.code }}</span> {{ l.name }}</td><td>{{ l.pack }}</td><td>{{ l.registrationDate | frDate }}</td>
              <td class="num">{{ l.price | money }}@if (l.months > 1) {<div class="muted small">{{ l.periodAmount | money }} ÷ {{ l.months }}</div>}</td>
              @if (split) {<td class="num">× {{ l.factor }}</td>}</tr>
          } @empty {
            <tr><td colspan="5" class="empty">Aucun adhérent en cours ce mois-ci.</td></tr>
          }
        </tbody>
      </table>
      <app-pager [table]="lines" [auto]="true" />
      <p class="calc"><b>{{ s.salaryDetail.base | money }} × {{ s.salaryDetail.shareRaw }} ({{ pct }} %) = {{ s.salary | money }}</b></p>
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-flat-button mat-dialog-close>Fermer</button></mat-dialog-actions>
  `,
})
export class SalaryDetailDialog {
  s = inject<StaffView>(MAT_DIALOG_DATA);
  month = monthName(this.s.salaryDetail.month);
  split = this.s.salaryDetail.multiCoach === 'SPLIT';
  pct = formatAmount(this.s.salaryDetail.sharePercent);
  sportNames = this.s.sports.map((x) => x.name).join(', ');
  lines = new Paged(() => this.s.salaryDetail.lines);
}

/**
 * Adds a function, or deletes one or several of them. A function given to a staff member (active or not) cannot be deleted:
 * it is shown greyed out.
 */
@Component({
  selector: 'app-function-manage',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatCheckboxModule],
  template: `
    <h2 mat-dialog-title>Fonctions</h2>
    <mat-dialog-content>
      <mat-button-toggle-group class="fn-mode" [ngModel]="mode()" (ngModelChange)="mode.set($event); error.set('')" aria-label="Action">
        <mat-button-toggle value="ADD">Ajouter</mat-button-toggle><mat-button-toggle value="DELETE">Supprimer</mat-button-toggle>
      </mat-button-toggle-group>
      @if (mode() === 'ADD') {
        <form id="fn-form" (ngSubmit)="add()">
          <mat-form-field class="w-full"><mat-label>Nouvelle fonction</mat-label>
            <input matInput name="label" [(ngModel)]="label" required maxlength="80" cdkFocusInitial placeholder="Ex. : Kinésithérapeute" /></mat-form-field>
        </form>
      } @else {
        <p class="muted small">Cochez les fonctions à supprimer. Celles affectées à un membre du personnel sont grisées.</p>
        <div class="fn-list">
          @for (f of d.functions; track f.id) {
            <mat-checkbox [disabled]="d.used.has(f.id)" [checked]="selected.has(f.id)" (change)="toggle(f.id, $event.checked)">
              {{ f.label }}@if (d.used.has(f.id)) {<span class="muted small"> (affectée)</span>}@if (!f.active) {<span class="muted small"> (inactive)</span>}
            </mat-checkbox>
          } @empty {<p class="muted">Aucune fonction.</p>}
        </div>
      }
      @if (error()) {<p class="form-error" role="alert">{{ error() }}</p>}
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="close()">Fermer</button>
      @if (mode() === 'ADD') {
        <button mat-flat-button type="submit" form="fn-form" [disabled]="busy() || !label.trim()">Ajouter</button>
      } @else {
        <button mat-flat-button class="danger" type="button" (click)="remove()" [disabled]="busy() || !selected.size">Supprimer{{ selected.size ? ' (' + selected.size + ')' : '' }}</button>
      }
    </mat-dialog-actions>
  `,
  styles: `.fn-mode { margin-bottom: 16px; } .fn-list { display: flex; flex-direction: column; gap: 2px; max-height: 320px; overflow: auto; }`,
})
export class FunctionManageDialog {
  d = inject<{ functions: FunctionView[]; used: Set<number> }>(MAT_DIALOG_DATA);
  private api = inject(ApiService);
  private ref = inject(MatDialogRef<FunctionManageDialog>);
  private notify = inject(NotifyService);
  mode = signal<'ADD' | 'DELETE'>('ADD');
  label = '';
  selected = new Set<number>();
  busy = signal(false);
  error = signal('');
  private changed = false;

  toggle(id: number, on: boolean): void {
    if (on) this.selected.add(id);
    else this.selected.delete(id);
  }

  async add(): Promise<void> {
    const label = this.label.trim();
    if (!label) return;
    await this.run(async () => {
      await this.api.post('/functions', { label });
      this.notify.success(`Fonction « ${label} » ajoutée.`);
    });
  }

  async remove(): Promise<void> {
    const ids = [...this.selected];
    await this.run(async () => {
      for (const id of ids) {
        await this.api.remove('functions', id);
        this.selected.delete(id);
        this.changed = true;
      }
      this.notify.success(ids.length > 1 ? `${ids.length} fonctions supprimées.` : 'Fonction supprimée.');
    });
  }

  close(): void {
    this.ref.close(this.changed);
  }

  private async run(action: () => Promise<void>): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await action();
      this.changed = true;
      this.ref.close(true);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
