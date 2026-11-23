import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ApiService } from '../../core/api.service';
import { FrDatePipe, MoneyPipe, formatAmount, monthName } from '../../core/format';
import { FunctionView, SportView, StaffView } from '../../core/models';
import { NotifyService, errorMessage } from '../../core/notify.service';
import { MultiSelect, SelectOption } from '../../shared/multi-select';
import { PhoneInput, PhoneValue } from '../../shared/phone-input';

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
          <span class="field-label">Mode de rémunération</span>
          <mat-button-toggle-group name="mode" [(ngModel)]="v.payMode" aria-label="Mode de rémunération">
            <mat-button-toggle value="COMMISSION">Commission</mat-button-toggle>
            <mat-button-toggle value="FIXED">Fixe</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
        @if (v.payMode === 'FIXED') {
          <mat-form-field><mat-label>Salaire fixe mensuel</mat-label><input matInput type="number" min="0" step="0.01" name="fixed" [(ngModel)]="v.fixedSalary" required /></mat-form-field>
        } @else {
          <p class="muted small">Salaire = part du CA des adhérents inscrits dans ses sports pendant la fenêtre du mois (Paramètres › Salaire).</p>
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
    payMode: this.d.staff?.payMode ?? 'COMMISSION',
    fixedSalary: this.d.staff?.fixedSalary ?? (null as number | null),
  };
  busy = signal(false);
  error = signal('');

  async save(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.save('staff', this.d.staff?.id, { ...this.v, phone: this.v.phone.number, phoneCountry: this.v.phone.country });
      this.notify.success(this.d.staff ? 'Fiche mise à jour.' : 'Membre du personnel ajouté.');
      this.ref.close(true);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

/** Makes a commission salary verifiable: members counted, prices, share, window. */
@Component({
  selector: 'app-salary-detail',
  imports: [MatDialogModule, MatButtonModule, MoneyPipe, FrDatePipe],
  template: `
    <h2 mat-dialog-title>Détail du salaire — {{ s.name }} · {{ month }} (du {{ s.salaryDetail.from.slice(8) }} au {{ s.salaryDetail.to.slice(8) }})</h2>
    <mat-dialog-content>
      <p class="muted">Sports encadrés : {{ sportNames || 'aucun' }} · plusieurs coachs : {{ s.salaryDetail.multiCoach === 'SPLIT' ? 'partage égal' : 'part entière chacun' }}</p>
      <table class="table compact">
        <thead><tr><th>Adhérent</th><th>Pack</th><th>Inscrit le</th><th class="num">Prix</th>@if (split) {<th class="num">Part</th>}</tr></thead>
        <tbody>
          @for (l of s.salaryDetail.lines; track l.memberId) {
            <tr><td><span class="code">{{ l.code }}</span> {{ l.name }}</td><td>{{ l.pack }}</td><td>{{ l.registrationDate | frDate }}</td>
              <td class="num">{{ l.price | money }}</td>@if (split) {<td class="num">× {{ l.factor }}</td>}</tr>
          } @empty {
            <tr><td colspan="5" class="empty">Aucun adhérent inscrit dans la fenêtre de calcul.</td></tr>
          }
        </tbody>
      </table>
      <p class="calc"><b>{{ s.salaryDetail.base | money }} × {{ s.salaryDetail.shareRaw }} ({{ pct }} %) = {{ s.salary | money }}</b></p>
    </mat-dialog-content>
    <mat-dialog-actions align="end"><button mat-flat-button mat-dialog-close>Fermer</button></mat-dialog-actions>
  `,
})
export class SalaryDetailDialog {
  s = inject<StaffView>(MAT_DIALOG_DATA);
  month = monthName(this.s.salaryDetail.from);
  split = this.s.salaryDetail.multiCoach === 'SPLIT';
  pct = formatAmount(this.s.salaryDetail.sharePercent);
  sportNames = this.s.sports.map((x) => x.name).join(', ');
}
