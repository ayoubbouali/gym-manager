import { Component, inject, signal, viewChildren } from '@angular/core';
import { FormsModule, NgModel } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { PAYMENT_METHODS, monthName } from '../../core/format';
import { ChargeCategory, ChargePaymentView, ChargeView, PaymentMethod } from '../../core/models';
import { errorMessage } from '../../core/notify.service';
import { DateField } from '../../shared/date-field';
import { hasInvalid } from '../../shared/payment-dialogs';

export const CHARGE_CATEGORIES: { value: ChargeCategory; label: string }[] = [
  { value: 'ELECTRICITE', label: 'Électricité' }, { value: 'EAU', label: 'Eau' }, { value: 'INTERNET', label: 'Internet / téléphone' },
  { value: 'LOYER', label: 'Loyer' }, { value: 'MENAGE', label: 'Ménage' }, { value: 'ENTRETIEN', label: 'Entretien du matériel' },
  { value: 'AUTRE', label: 'Autre' },
];

export function today(config: ConfigService): string {
  return config.config()?.today ?? new Date().toISOString().slice(0, 10);
}

/**
 * Creates or edits a charge. Permanent: no month, settled every month. One-off: a month, and an amount if it is known,
 * which can then be paid at once.
 */
@Component({
  selector: 'app-charge-form-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule, DateField],
  template: `
    <h2 mat-dialog-title>{{ d.charge ? 'Modifier la charge' : 'Nouvelle charge' }}</h2>
    <mat-dialog-content>
      <form id="charge-form" class="stack" (ngSubmit)="save()">
        <mat-form-field class="w-full"><mat-label>Libellé</mat-label>
          <input matInput name="label" [(ngModel)]="label" required maxlength="120" cdkFocusInitial placeholder="Ex. : Électricité, abonnement internet…" /></mat-form-field>
        <mat-form-field class="w-full"><mat-label>Catégorie</mat-label>
          <mat-select name="category" [(ngModel)]="category" required>
            @for (c of categories; track c.value) {<mat-option [value]="c.value">{{ c.label }}</mat-option>}
          </mat-select></mat-form-field>
        <div class="field-block">
          <span class="field-label">Type</span>
          @if (d.charge) {
            <span>{{ permanent ? 'Permanente' : 'Ponctuelle' }} <span class="muted small">(le type ne change pas après la création)</span></span>
          } @else {
            <mat-button-toggle-group name="permanent" [(ngModel)]="permanent" aria-label="Type de charge">
              <mat-button-toggle [value]="true">Permanente</mat-button-toggle><mat-button-toggle [value]="false">Ponctuelle</mat-button-toggle>
            </mat-button-toggle-group>
          }
          @if (permanent) {<span class="muted small">Due chaque mois à partir de {{ startLabel }} : vous saisissez son montant en la réglant.</span>}
        </div>
        @if (!permanent) {
          <app-date-field mode="month" label="Mois concerné" name="period" [(ngModel)]="period" required />
          <div class="field-block">
            <span class="field-label">Connaissez-vous le montant ?</span>
            <mat-button-toggle-group name="known" [(ngModel)]="known" aria-label="Montant connu">
              <mat-button-toggle [value]="true">Oui</mat-button-toggle><mat-button-toggle [value]="false">Non, je le saisirai en la réglant</mat-button-toggle>
            </mat-button-toggle-group>
          </div>
          @if (known) {
            <mat-form-field class="w-full"><mat-label>Montant</mat-label>
              <input matInput type="number" min="0.01" step="0.01" name="amount" [(ngModel)]="amount" required />
              <span matTextSuffix>&nbsp;{{ currency() }}</span></mat-form-field>
            @if (!d.charge) {
              <div class="field-block">
                <span class="field-label">La régler maintenant ?</span>
                <mat-button-toggle-group name="payNow" [(ngModel)]="payNow" aria-label="Régler maintenant">
                  <mat-button-toggle [value]="true">Oui</mat-button-toggle><mat-button-toggle [value]="false">Non, plus tard</mat-button-toggle>
                </mat-button-toggle-group>
              </div>
              @if (payNow) {
                <app-date-field label="Date du règlement" name="paidOn" [(ngModel)]="paidOn" [max]="today" required />
                <div class="field-block">
                  <span class="field-label">Mode de paiement</span>
                  <mat-button-toggle-group name="method" [(ngModel)]="method" aria-label="Mode de paiement">
                    @for (m of methods; track m.value) {<mat-button-toggle [value]="m.value">{{ m.label }}</mat-button-toggle>}
                  </mat-button-toggle-group>
                </div>
              }
            }
          }
        }
        <mat-form-field class="w-full"><mat-label>Note (facultatif)</mat-label><input matInput name="note" [(ngModel)]="note" maxlength="500" /></mat-form-field>
      </form>
      @if (error()) {<p class="form-error" role="alert">{{ error() }}</p>}
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Annuler</button>
      <button mat-flat-button type="submit" form="charge-form" [disabled]="busy()">Enregistrer</button>
    </mat-dialog-actions>
  `,
})
export class ChargeFormDialog {
  d = inject<{ charge?: ChargeView; period?: string }>(MAT_DIALOG_DATA);
  private api = inject(ApiService);
  private ref = inject(MatDialogRef<ChargeFormDialog>);
  private config = inject(ConfigService);
  currency = this.config.currency;
  categories = CHARGE_CATEGORIES;
  methods = PAYMENT_METHODS;
  today = today(this.config);
  startLabel = monthName(this.d.charge?.startPeriod ?? this.today.slice(0, 7));
  label = this.d.charge?.label ?? '';
  category: ChargeCategory | null = this.d.charge?.category ?? null;
  permanent = this.d.charge?.permanent ?? true;
  period: string | null = this.d.charge?.period ?? this.d.period ?? this.today.slice(0, 7);
  known = this.d.charge ? this.d.charge.amount !== null : true;
  amount: number | null = this.d.charge?.amount ?? null;
  payNow = false;
  paidOn = this.today;
  method: PaymentMethod = 'ESPECES';
  note = this.d.charge?.note ?? '';
  busy = signal(false);
  error = signal('');
  private controls = viewChildren(NgModel);

  async save(): Promise<void> {
    if (hasInvalid(this.controls())) return;
    const oneOff = !this.permanent;
    const body = {
      label: this.label, category: this.category, permanent: this.permanent, note: this.note,
      period: oneOff ? this.period : null, amount: oneOff && this.known ? this.amount : null,
      payNow: oneOff && this.known && this.payNow, method: this.method, paidOn: this.paidOn,
    };
    this.busy.set(true);
    this.error.set('');
    try {
      this.ref.close(await this.api.save<ChargeView>('charges', this.d.charge?.id, body));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

/** Pays a charge for a month, or corrects an existing payment (amount, date, method, note; never the month). */
@Component({
  selector: 'app-charge-pay-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, DateField],
  template: `
    <h2 mat-dialog-title>{{ d.payment ? 'Corriger le règlement' : 'Régler la charge' }} — {{ d.charge.label }} · {{ month }}</h2>
    <mat-dialog-content>
      <form id="charge-pay-form" class="form-grid" (ngSubmit)="save()">
        <mat-form-field class="span-2"><mat-label>Montant</mat-label>
          <input matInput type="number" min="0.01" step="0.01" name="amount" [(ngModel)]="amount" required cdkFocusInitial />
          <span matTextSuffix>&nbsp;{{ currency() }}</span></mat-form-field>
        <app-date-field label="Date du règlement" name="paidOn" [(ngModel)]="paidOn" [max]="today" required />
        <div class="field-block">
          <span class="field-label">Mode de paiement</span>
          <mat-button-toggle-group name="method" [(ngModel)]="method" aria-label="Mode de paiement">
            @for (m of methods; track m.value) {<mat-button-toggle [value]="m.value">{{ m.label }}</mat-button-toggle>}
          </mat-button-toggle-group>
        </div>
        <mat-form-field class="span-2"><mat-label>Note (facultatif)</mat-label><input matInput name="note" [(ngModel)]="note" maxlength="500" /></mat-form-field>
      </form>
      @if (error()) {<p class="form-error" role="alert">{{ error() }}</p>}
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Annuler</button>
      <button mat-flat-button type="submit" form="charge-pay-form" [disabled]="busy()">Enregistrer le règlement</button>
    </mat-dialog-actions>
  `,
})
export class ChargePayDialog {
  d = inject<{ charge: ChargeView; period: string; expected: number | null; payment?: ChargePaymentView }>(MAT_DIALOG_DATA);
  private api = inject(ApiService);
  private ref = inject(MatDialogRef<ChargePayDialog>);
  private config = inject(ConfigService);
  currency = this.config.currency;
  methods = PAYMENT_METHODS;
  today = today(this.config);
  month = monthName(this.d.period);
  amount: number | null = this.d.payment?.amount ?? this.d.expected;
  paidOn = this.d.payment?.paidOn ?? this.today;
  method: PaymentMethod = this.d.payment?.method ?? 'ESPECES';
  note = this.d.payment?.note ?? '';
  busy = signal(false);
  error = signal('');
  private controls = viewChildren(NgModel);

  async save(): Promise<void> {
    if (hasInvalid(this.controls())) return;
    const body = { chargeId: this.d.charge.id, period: this.d.period, amount: this.amount, method: this.method, paidOn: this.paidOn, note: this.note };
    this.busy.set(true);
    this.error.set('');
    try {
      this.ref.close(this.d.payment ? await this.api.put<ChargePaymentView>(`/charges/payments/${this.d.payment.id}`, body)
        : await this.api.post<ChargePaymentView>('/charges/payments', body));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
