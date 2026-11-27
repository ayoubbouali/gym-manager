import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { FrDatePipe, MoneyPipe, formatAmount, monthName } from '../../core/format';
import { FunctionView, SportView, StaffView } from '../../core/models';
import { NotifyService, errorMessage } from '../../core/notify.service';
import { MultiSelect, SelectOption } from '../../shared/multi-select';
import { PhoneInput, PhoneValue } from '../../shared/phone-input';
import { Pager, Paged } from '../../shared/table';

@Component({
  selector: 'app-staff-form',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatTooltipModule,
    LucideAngularModule, MultiSelect, PhoneInput],
  template: `
    <h2 mat-dialog-title>{{ d.staff ? 'Modifier ' + d.staff.code + ' — ' + d.staff.name : 'Nouveau membre du personnel' }}</h2>
    <mat-dialog-content>
      <form id="staff-form" class="form-grid" (ngSubmit)="save()">
        <mat-form-field><mat-label>Nom</mat-label><input matInput name="last" [(ngModel)]="v.lastName" required /></mat-form-field>
        <mat-form-field><mat-label>Prénom</mat-label><input matInput name="first" [(ngModel)]="v.firstName" /></mat-form-field>
        <app-phone-input label="Téléphone" name="phone" [(ngModel)]="v.phone" />
        @if (adding()) {
          <div class="fn-new">
            <mat-form-field class="grow"><mat-label>Nouvelle fonction</mat-label>
              <input matInput name="newFn" [(ngModel)]="newFunction" maxlength="80" placeholder="Ex. : Kinésithérapeute" (keydown.enter)="$event.preventDefault(); addFunction()" /></mat-form-field>
            <button mat-flat-button type="button" (click)="addFunction()" [disabled]="!newFunction.trim() || busy()">Ajouter</button>
            <button mat-button type="button" (click)="adding.set(false)">Annuler</button>
          </div>
        } @else {
          <div class="fn-new">
            <mat-form-field class="grow"><mat-label>Fonction</mat-label>
              <mat-select name="fn" [(ngModel)]="v.functionId" required>
                @for (f of functions(); track f.id) {<mat-option [value]="f.id">{{ f.label }}</mat-option>}
              </mat-select>
            </mat-form-field>
            <button class="icon-btn" type="button" (click)="adding.set(true)" matTooltip="Ajouter une fonction" aria-label="Ajouter une fonction"><lucide-icon name="plus" [size]="18" /></button>
          </div>
        }
        <app-multi-select class="span-2" label="Sports encadrés" name="sports" [(ngModel)]="v.sportIds" [options]="sportOptions" />
        <div class="field-block">
          <span class="field-label">Personnel interne ?</span>
          <mat-button-toggle-group name="internal" [(ngModel)]="v.internal" aria-label="Personnel interne">
            <mat-button-toggle [value]="false">Non</mat-button-toggle>
            <mat-button-toggle [value]="true">Oui, propriétaire du club</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
        @if (v.internal) {
          <p class="muted small">Fait partie des propriétaires du club : aucune rémunération, n’apparaît pas dans la paie du personnel.</p>
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
  styles: `.fn-new { display: flex; align-items: center; gap: 8px; } .fn-new .grow { flex: 1; min-width: 0; }`,
})
export class StaffFormDialog {
  d = inject<{ staff?: StaffView; functions: FunctionView[]; sports: SportView[] }>(MAT_DIALOG_DATA);
  private api = inject(ApiService);
  private ref = inject(MatDialogRef<StaffFormDialog>);
  private notify = inject(NotifyService);
  functions = signal(this.d.functions.filter((f) => f.active || f.id === this.d.staff?.functionId));
  adding = signal(false);
  newFunction = '';
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

  /** Creates a function from the form and selects it: the list of functions is not fixed. */
  async addFunction(): Promise<void> {
    const label = this.newFunction.trim();
    if (!label) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const { id } = await this.api.post<{ id: number }>('/functions', { label });
      this.functions.update((l) => [...l, { id, label, active: true }].sort((a, b) => a.label.localeCompare(b.label, 'fr')));
      this.v.functionId = id;
      this.newFunction = '';
      this.adding.set(false);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  async save(): Promise<void> {
    if (this.adding()) {
      this.error.set('Ajoutez ou annulez la nouvelle fonction avant d’enregistrer.');
      return;
    }
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
