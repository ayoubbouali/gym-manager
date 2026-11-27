import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { debounceTime, firstValueFrom, startWith } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { FrDatePipe, MoneyPipe, PAYMENT_METHODS, formatAmount } from '../../core/format';
import { DiscountView, MemberPreview, MemberView, PackView, PaymentMethod, SportView } from '../../core/models';
import { NotifyService, apiError, errorMessage } from '../../core/notify.service';
import { DateField } from '../../shared/date-field';
import { MultiSelect, SelectOption } from '../../shared/multi-select';
import { PhoneInput, PhoneValue } from '../../shared/phone-input';

@Component({
  selector: 'app-member-form',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonToggleModule, MultiSelect, DateField, PhoneInput, MoneyPipe, FrDatePipe],
  template: `
    <h2 mat-dialog-title>{{ member ? 'Modifier ' + member.code + ' — ' + member.firstName + ' ' + member.lastName : 'Nouvel adhérent' }}</h2>
    <mat-dialog-content #content>
      @if (error()) {<p class="form-error form-error-top" role="alert">{{ error() }}</p>}
      <form [formGroup]="form" class="form-grid" (ngSubmit)="save()" id="member-form">
        <mat-form-field><mat-label>Nom</mat-label><input matInput formControlName="lastName" required /></mat-form-field>
        <mat-form-field><mat-label>Prénom</mat-label><input matInput formControlName="firstName" required /></mat-form-field>
        <app-phone-input label="Téléphone" formControlName="phone" required />
        <app-date-field label="Date de naissance" formControlName="birthDate" />
        <app-multi-select class="span-2" label="Sport(s) *" formControlName="sportIds" [options]="sportOptions()" />
        @if (withoutSubscription) {
          <p class="span-2 muted">Sans abonnement : créez-en un avec « Nouvel abonnement » sur la fiche de l'adhérent.</p>
        } @else {
          <mat-form-field class="span-2">
            <mat-label>Type d'abonnement</mat-label>
            <mat-select formControlName="packId" required>
              @for (p of packOptions(); track p.id) {
                <mat-option [value]="p.id" [disabled]="!p.active">{{ p.name }} ({{ p.total | money }}){{ p.active ? '' : ' — inactif' }}</mat-option>
              } @empty {
                <mat-option disabled>Choisissez d'abord un sport</mat-option>
              }
            </mat-select>
          </mat-form-field>
          <div class="field-block span-2">
            <span class="field-label">Remise</span>
            <mat-button-toggle-group formControlName="discountMode" aria-label="Type de remise">
              <mat-button-toggle value="LIST">Remise existante</mat-button-toggle>
              <mat-button-toggle value="AMOUNT">Montant saisi</mat-button-toggle>
            </mat-button-toggle-group>
          </div>
          @if (values().discountMode === 'AMOUNT') {
            <mat-form-field class="span-2">
              <mat-label>Prix appliqué</mat-label>
              <input matInput type="number" min="0" step="0.01" formControlName="customAmount" required />
              <span matTextSuffix>&nbsp;{{ config.currency() }}</span>
              @if (manualHint(); as h) {<mat-hint>{{ h }}</mat-hint>}
              <mat-error>{{ form.controls.customAmount.errors?.['server'] ?? 'Saisissez le prix à appliquer.' }}</mat-error>
            </mat-form-field>
          } @else {
            <mat-form-field class="span-2">
              <mat-label>Remise</mat-label>
              <mat-select formControlName="discountId">
                @for (d of discountOptions(); track d.id) {
                  <mat-option [value]="d.id" [disabled]="!d.active">{{ d.name }}{{ d.active ? '' : ' — inactive' }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
          }
        }
        <app-date-field class="below-field-label" label="Date d'inscription" formControlName="registrationDate" required />
        <div class="field-block aligned">
          <span class="field-label">Assurance</span>
          <mat-button-toggle-group formControlName="insurance" aria-label="Assurance">
            <mat-button-toggle value="PAYE">Payé</mat-button-toggle>
            <mat-button-toggle value="IMPAYE">Impayé</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
        <mat-form-field class="span-2"><mat-label>Notes</mat-label><textarea matInput formControlName="notes" rows="1"></textarea></mat-form-field>
        @if (offersPayment()) {
          <div class="field-block span-2">
            <span class="field-label">Encaisser maintenant ?</span>
            <mat-button-toggle-group formControlName="payNow" aria-label="Encaisser maintenant">
              <mat-button-toggle [value]="true">Oui</mat-button-toggle><mat-button-toggle [value]="false">Non, plus tard</mat-button-toggle>
            </mat-button-toggle-group>
          </div>
          @if (values().payNow) {
            <mat-form-field>
              <mat-label>Montant encaissé</mat-label>
              <input matInput type="number" min="0.01" step="0.01" formControlName="paymentAmount" (input)="amountEdited = true" required />
              <span matTextSuffix>&nbsp;{{ config.currency() }}</span>
              @if (paymentHint(); as h) {<mat-hint>{{ h }}</mat-hint>}
              <mat-error>{{ form.controls.paymentAmount.errors?.['server'] ?? paymentAmountError() }}</mat-error>
            </mat-form-field>
            <app-date-field label="Date du paiement" formControlName="paidOn" [max]="today" required />
            <div class="field-block span-2">
              <span class="field-label">Mode de paiement</span>
              <mat-button-toggle-group formControlName="paymentMethod" aria-label="Mode de paiement">
                @for (m of methods; track m.value) {<mat-button-toggle [value]="m.value">{{ m.label }}</mat-button-toggle>}
              </mat-button-toggle-group>
            </div>
          }
        }
      </form>
      @if (!withoutSubscription) {
        <div class="computed-box" aria-live="polite">
          <span class="muted">Calculé</span>
          @if (preview(); as p) {
            <b>{{ p.price | money }}</b><span>· fin le {{ p.endDate | frDate }}</span>
          } @else {
            <span class="muted">choisissez un pack et une date d'inscription</span>
          }
        </div>
      }
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Annuler</button>
      <button mat-flat-button type="submit" form="member-form" [disabled]="busy()">Enregistrer</button>
    </mat-dialog-actions>
  `,
})
export class MemberFormDialog {
  member = inject<{ member?: MemberView }>(MAT_DIALOG_DATA).member;
  /** An existing member without subscription: saving never creates one, so no pack is asked. */
  readonly withoutSubscription = this.member?.situation === 'NONE';
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private ref = inject(MatDialogRef<MemberFormDialog>);
  private notify = inject(NotifyService);
  config = inject(ConfigService);
  methods = PAYMENT_METHODS;
  today = this.config.config()?.today ?? '';
  /** The amount was typed by hand: it no longer follows the computed price. */
  amountEdited = false;

  sports = signal<SportView[]>([]);
  packs = signal<PackView[]>([]);
  discounts = signal<DiscountView[]>([]);
  preview = signal<MemberPreview | null>(null);
  busy = signal(false);
  error = signal('');
  private content = viewChild.required('content', { read: ElementRef });

  form = this.fb.group({
    lastName: [this.member?.lastName ?? '', Validators.required],
    firstName: [this.member?.firstName ?? '', Validators.required],
    // required: checked by the phone field itself (the value is an object)
    phone: [{ country: null, number: this.member?.phone ?? '' } as PhoneValue],
    birthDate: [this.member?.birthDate ?? ''],
    sportIds: [this.member?.sportIds ?? ([] as number[])],
    packId: [this.member?.packId ?? (null as number | null), this.withoutSubscription ? [] : [Validators.required]],
    discountId: [this.member?.discountId ?? (null as number | null)],
    /** LIST: a discount of the referential; AMOUNT: the price is typed by hand and the discount is deduced from the pack price. */
    discountMode: [(this.member?.customAmount != null ? 'AMOUNT' : 'LIST') as 'LIST' | 'AMOUNT'],
    customAmount: [this.member?.customAmount ?? (null as number | null)],
    registrationDate: [this.member?.registrationDate ?? this.config.config()?.today ?? '', Validators.required],
    insurance: [this.member?.insurance ?? 'IMPAYE'],
    notes: [this.member?.notes ?? ''],
    /** Creation only: first payment of the period, the computed price by default, lower for a partial payment. */
    payNow: [false],
    paymentAmount: [null as number | null],
    paidOn: [this.config.config()?.today ?? ''],
    paymentMethod: ['ESPECES' as PaymentMethod],
  });
  protected values = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  sportOptions = computed<SelectOption[]>(() =>
    this.sports().map((s) => ({ id: s.id, label: s.name, color: s.color, disabled: !s.active })));
  /** Active packs of the selected sports (+ the current pack, even if inactive). */
  packOptions = computed(() => {
    const ids = this.values().sportIds ?? [];
    return this.packs().filter((p) => ids.includes(p.sportId) && (p.active || p.id === this.member?.packId));
  });
  discountOptions = computed(() => this.discounts().filter((d) => d.active || d.id === this.member?.discountId));
  /** "soit −33,33 % sur 150,00 DH" for a typed price, measured against the selected pack's price. */
  manualHint = computed(() => {
    const v = this.values();
    const total = this.packs().find((p) => p.id === v.packId)?.total;
    if (total == null || v.customAmount == null) return '';
    if (v.customAmount > total) return `Supérieur au prix du type d'abonnement (${formatAmount(total)} ${this.config.currency()})`;
    const pct = total > 0 ? Math.round((1 - v.customAmount / total) * 10000) / 100 : 0;
    return `soit −${formatAmount(pct)} % sur ${formatAmount(total)} ${this.config.currency()}`;
  });

  /** A new member with something to pay. */
  offersPayment = computed(() => !this.member && (this.preview()?.price ?? 0) > 0);
  paymentHint = computed(() => {
    const price = this.preview()?.price;
    const amount = this.values().paymentAmount;
    if (price == null || amount == null || amount <= 0 || amount > price) return '';
    const left = Math.round((price - amount) * 100) / 100;
    return left > 0 ? `Paiement partiel : reste ${formatAmount(left)} ${this.config.currency()} à payer`
      : `Paiement complet (${formatAmount(price)} ${this.config.currency()})`;
  });

  paymentAmountError(): string {
    const price = this.preview()?.price;
    return this.form.controls.paymentAmount.hasError('max') && price != null
      ? `Pas plus que le prix (${formatAmount(price)} ${this.config.currency()}).`
      : 'Saisissez le montant encaissé.';
  }

  constructor() {
    Promise.all([this.api.sports(), this.api.packs(), this.api.discounts()]).then(([s, p, d]) => {
      this.sports.set(s);
      this.packs.set(p);
      this.discounts.set(d);
      if (!this.form.value.discountId) this.form.patchValue({ discountId: d.find((x) => x.system)?.id ?? null });
      this.refreshPreview();
    }, (e) => this.notify.error(e));
    const destroy = inject(DestroyRef);
    this.form.controls.sportIds.valueChanges.pipe(takeUntilDestroyed(destroy)).subscribe((ids) => {
      const pack = this.packs().find((p) => p.id === this.form.value.packId);
      if (pack && !(ids ?? []).includes(pack.sportId)) this.form.patchValue({ packId: null });
    });
    this.form.valueChanges.pipe(debounceTime(250), takeUntilDestroyed(destroy)).subscribe(() => this.refreshPreview());
    const mode = this.form.controls.discountMode;
    mode.valueChanges.pipe(startWith(mode.value), takeUntilDestroyed(destroy)).subscribe((m) => {
      const amount = this.form.controls.customAmount;
      amount.setValidators(m === 'AMOUNT' ? [Validators.required, Validators.min(0)] : []);
      amount.updateValueAndValidity({ emitEvent: false });
    });
    const payNow = this.form.controls.payNow;
    payNow.valueChanges.pipe(takeUntilDestroyed(destroy)).subscribe(() => this.updatePaymentValidators());
  }

  /** Payment fields are checked only when paying now; the amount may not exceed the computed price. */
  private updatePaymentValidators(): void {
    const on = !!this.form.controls.payNow.value && this.offersPayment();
    const price = this.preview()?.price;
    const amount = this.form.controls.paymentAmount;
    amount.setValidators(on ? [Validators.required, Validators.min(0.01), ...(price != null ? [Validators.max(price)] : [])] : []);
    amount.updateValueAndValidity({ emitEvent: false });
    for (const c of [this.form.controls.paidOn, this.form.controls.paymentMethod]) {
      c.setValidators(on ? [Validators.required] : []);
      c.updateValueAndValidity({ emitEvent: false });
    }
  }

  /** The typed price, or null when a discount of the list applies. */
  private customAmount(): number | null {
    const v = this.form.value;
    return v.discountMode === 'AMOUNT' && v.customAmount != null ? v.customAmount : null;
  }

  private async refreshPreview(): Promise<void> {
    const v = this.form.value;
    if (!v.packId || !v.registrationDate) {
      this.preview.set(null);
      return;
    }
    try {
      this.preview.set(await this.api.memberPreview({ packId: v.packId, discountId: v.discountId ?? null,
        registrationDate: v.registrationDate, customAmount: this.customAmount() }));
    } catch {
      this.preview.set(null);
    }
    if (!this.member && !this.amountEdited) this.form.controls.paymentAmount.setValue(this.preview()?.price ?? null, { emitEvent: false });
    this.updatePaymentValidators();
  }

  /** The message sits above the fields: scroll back to it, the user may be at the bottom of the form. */
  private showError(message: string): void {
    this.error.set(message);
    this.content().nativeElement.scrollTop = 0;
  }

  async save(): Promise<void> {
    this.error.set('');
    if (this.form.invalid || !(this.form.value.sportIds ?? []).length) {
      this.form.markAllAsTouched();
      const paymentOnly = (this.form.value.sportIds ?? []).length > 0
        && Object.entries(this.form.controls).every(([k, c]) => c.valid || k === 'paymentAmount' || k === 'paidOn');
      if (paymentOnly) return this.showError('Vérifiez l’encaissement : le montant (pas plus que le prix) et la date du paiement.');
      this.showError(this.withoutSubscription
        ? 'Renseignez les champs obligatoires : nom, prénom, téléphone, au moins un sport et la date d\'inscription.'
        : 'Renseignez les champs obligatoires : nom, prénom, téléphone, au moins un sport, un abonnement et la date d\'inscription.');
      return;
    }
    const { discountMode, payNow, paymentAmount, paymentMethod, paidOn, ...v } = this.form.getRawValue();
    const pays = !!payNow && this.offersPayment();
    this.busy.set(true);
    try {
      const saved = await this.api.save<MemberView>('members', this.member?.id,
        { ...v, customAmount: discountMode === 'AMOUNT' ? v.customAmount : null,
          phone: v.phone?.number ?? '', phoneCountry: v.phone?.country ?? null, birthDate: v.birthDate || null,
          ...(pays ? { paymentAmount, paymentMethod, paidOn } : {}) });
      this.notify.success(this.member ? 'Adhérent modifié.'
        : pays ? `Adhérent ${saved.code} créé, ${formatAmount(paymentAmount!)} ${this.config.currency()} encaissés.` : `Adhérent ${saved.code} créé.`);
      this.ref.close(saved);
    } catch (e) {
      const err = apiError(e);
      const field = err?.field === 'amount' ? 'paymentAmount' : err?.field === 'method' ? 'paymentMethod' : err?.field;
      if (field && this.form.get(field)) this.form.get(field)!.setErrors({ server: err!.message });
      this.showError(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

/** Opens the add/edit dialog; resolves with the saved member, or undefined if cancelled. */
export function openMemberForm(dialog: MatDialog, member?: MemberView): Promise<MemberView | undefined> {
  return firstValueFrom(dialog.open(MemberFormDialog, { data: { member }, width: '760px', maxWidth: '96vw', autoFocus: 'first-tabbable' }).afterClosed());
}
