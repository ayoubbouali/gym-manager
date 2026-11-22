import { Component, computed, inject, signal, viewChildren } from '@angular/core';
import { FormsModule, NgModel } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../core/api.service';
import { ConfigService } from '../core/config.service';
import { FrDatePipe, MoneyPipe, PAYMENT_METHODS, openPdf } from '../core/format';
import { DiscountView, MemberCard, MemberPreview, PackView, PaymentMethod, PaymentView, SubscriptionView } from '../core/models';
import { NotifyService, errorMessage } from '../core/notify.service';
import { DateField } from './date-field';
import { openSimpleForm } from './simple-form-dialog';

export interface PaymentDialogData {
  memberId: number;
  memberLabel: string;
  /** Periods of the member, to choose which one is paid (create mode). */
  subscriptions?: SubscriptionView[];
  /** Edit mode (ADMIN). */
  payment?: PaymentView;
}

/** Record ("Encaisser") or correct a member payment. */
@Component({
  selector: 'app-payment-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule, DateField, MoneyPipe, FrDatePipe],
  template: `
    <h2 mat-dialog-title>{{ d.payment ? 'Modifier le paiement ' + d.payment.receiptNumber : 'Encaisser un paiement' }}</h2>
    <mat-dialog-content>
      <p class="muted">{{ d.memberLabel }}</p>
      <form id="payment-form" class="form-grid" (ngSubmit)="save()">
        @if (!d.payment) {
          <mat-form-field class="span-2"><mat-label>Période réglée</mat-label>
            <mat-select name="sub" [(ngModel)]="subscriptionId" (ngModelChange)="onPeriod()">
              @for (s of payable(); track s.id) {
                <mat-option [value]="s.id">{{ s.packName }} · du {{ s.startDate | frDate }} au {{ s.endDate | frDate }} — reste {{ s.balance | money }}</mat-option>
              }
            </mat-select>
          </mat-form-field>
        }
        <mat-form-field><mat-label>Montant</mat-label>
          <input matInput type="number" min="0.01" step="0.01" name="amount" [(ngModel)]="amount" required />
          <span matTextSuffix>&nbsp;{{ currency() }}</span>
          @if (maxAmount() !== null) {<mat-hint>Reste à payer : {{ maxAmount() | money }}</mat-hint>}
        </mat-form-field>
        <app-date-field label="Date du paiement" name="paidOn" [(ngModel)]="paidOn" [max]="today" required />
        <div class="field-block span-2">
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
      <button mat-flat-button type="submit" form="payment-form" [disabled]="busy()">{{ d.payment ? 'Enregistrer' : 'Encaisser' }}</button>
    </mat-dialog-actions>
  `,
})
export class PaymentDialog {
  d = inject<PaymentDialogData>(MAT_DIALOG_DATA);
  private api = inject(ApiService);
  private ref = inject(MatDialogRef<PaymentDialog>);
  private config = inject(ConfigService);
  currency = this.config.currency;
  methods = PAYMENT_METHODS;
  today = this.config.config()?.today ?? new Date().toISOString().slice(0, 10);

  payable = computed(() => (this.d.subscriptions ?? []).filter((s) => s.balance > 0).sort((a, b) => a.startDate.localeCompare(b.startDate)));
  subscriptionId: number | null = this.payable()[0]?.id ?? null;
  amount: number | null = this.d.payment?.amount ?? this.payable()[0]?.balance ?? null;
  paidOn = this.d.payment?.paidOn ?? this.today;
  method: PaymentMethod = this.d.payment?.method ?? 'ESPECES';
  note = this.d.payment?.note ?? '';
  maxAmount = signal<number | null>(this.d.payment ? null : this.payable()[0]?.balance ?? null);
  busy = signal(false);
  error = signal('');
  private controls = viewChildren(NgModel);

  onPeriod(): void {
    const s = this.payable().find((x) => x.id === this.subscriptionId);
    this.maxAmount.set(s?.balance ?? null);
    this.amount = s?.balance ?? null;
  }

  async save(): Promise<void> {
    if (hasInvalid(this.controls())) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const body = { amount: this.amount, method: this.method, paidOn: this.paidOn, note: this.note };
      const p = this.d.payment
        ? await this.api.put<PaymentView>(`/payments/${this.d.payment.id}`, body)
        : await this.api.post<PaymentView>('/payments', { ...body, memberId: this.d.memberId, subscriptionId: this.subscriptionId });
      this.ref.close(p);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

/** Renewal: new subscription period, with an optional payment right away. */
@Component({
  selector: 'app-renew-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatCheckboxModule, MatFormFieldModule, MatInputModule, MatSelectModule, DateField, MoneyPipe, FrDatePipe],
  template: `
    <h2 mat-dialog-title>Renouveler l'abonnement — {{ c.member.code }} {{ c.member.firstName }} {{ c.member.lastName }}</h2>
    <mat-dialog-content>
      <p class="muted">Dernière période : {{ c.subscriptions[0].packName }}, jusqu'au {{ c.subscriptions[0].endDate | frDate }}.
        @if (c.member.balance > 0) {<span class="red">Reste à payer sur les périodes précédentes : {{ c.member.balance | money }}.</span>}</p>
      <form id="renew-form" class="form-grid" (ngSubmit)="save()">
        <mat-form-field class="span-2"><mat-label>Type d'abonnement</mat-label>
          <mat-select name="pack" [(ngModel)]="packId" (ngModelChange)="refresh()" required>
            @for (p of packOptions(); track p.id) {<mat-option [value]="p.id">{{ p.name }} ({{ p.total | money }})</mat-option>}
          </mat-select>
        </mat-form-field>
        <mat-form-field><mat-label>Remise</mat-label>
          <mat-select name="discount" [(ngModel)]="discountId" (ngModelChange)="refresh()">
            @for (x of discountOptions(); track x.id) {<mat-option [value]="x.id">{{ x.name }}</mat-option>}
          </mat-select>
        </mat-form-field>
        <app-date-field label="Début de la nouvelle période" name="start" [(ngModel)]="startDate" (ngModelChange)="refresh()" required
                        [hint]="'Proposé : ' + (c.renewalStart | frDate)" />
      </form>
      <div class="computed-box" aria-live="polite">
        <span class="muted">Nouvelle période</span>
        @if (preview(); as p) {<b>{{ p.price | money }}</b><span>· jusqu'au {{ p.endDate | frDate }}</span>}
        @else {<span class="muted">choisissez un pack</span>}
      </div>
      <div class="pay-now">
        <mat-checkbox [(ngModel)]="payNow" name="payNow">Encaisser maintenant</mat-checkbox>
        @if (payNow) {
          <div class="form-grid">
            <mat-form-field><mat-label>Montant</mat-label><input matInput type="number" min="0.01" step="0.01" [(ngModel)]="amount" name="amount" />
              <span matTextSuffix>&nbsp;{{ currency() }}</span></mat-form-field>
            <app-date-field label="Date du paiement" [(ngModel)]="paidOn" name="paidOn" [max]="today" />
            <div class="field-block span-2">
              <span class="field-label">Mode de paiement</span>
              <mat-button-toggle-group [(ngModel)]="method" name="method" aria-label="Mode de paiement">
                @for (m of methods; track m.value) {<mat-button-toggle [value]="m.value">{{ m.label }}</mat-button-toggle>}
              </mat-button-toggle-group>
            </div>
          </div>
        }
      </div>
      @if (error()) {<p class="form-error" role="alert">{{ error() }}</p>}
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Annuler</button>
      <button mat-flat-button type="submit" form="renew-form" [disabled]="busy() || !packId">Renouveler</button>
    </mat-dialog-actions>
  `,
})
export class RenewDialog {
  c = inject<MemberCard>(MAT_DIALOG_DATA);
  private api = inject(ApiService);
  private ref = inject(MatDialogRef<RenewDialog>);
  private config = inject(ConfigService);
  currency = this.config.currency;
  methods = PAYMENT_METHODS;
  today = this.config.config()?.today ?? new Date().toISOString().slice(0, 10);

  packs = signal<PackView[]>([]);
  discounts = signal<DiscountView[]>([]);
  packOptions = computed(() => this.packs().filter((p) => p.active && this.c.member.sportIds.includes(p.sportId)));
  discountOptions = computed(() => this.discounts().filter((d) => d.active));
  packId: number | null = null;
  discountId: number | null = null;
  startDate = this.c.renewalStart;
  preview = signal<MemberPreview | null>(null);
  payNow = true;
  amount: number | null = null;
  paidOn = this.today;
  method: PaymentMethod = 'ESPECES';
  busy = signal(false);
  error = signal('');
  private controls = viewChildren(NgModel);

  constructor() {
    Promise.all([this.api.packs(), this.api.discounts()]).then(([p, d]) => {
      this.packs.set(p);
      this.discounts.set(d);
      this.packId = this.packOptions().some((x) => x.id === this.c.member.packId) ? this.c.member.packId : this.packOptions()[0]?.id ?? null;
      this.discountId = d.find((x) => x.id === this.c.member.discountId && x.active)?.id ?? d.find((x) => x.system)?.id ?? null;
      this.refresh();
    });
  }

  async refresh(): Promise<void> {
    if (!this.packId || !this.startDate) return this.preview.set(null);
    const p = await this.api.memberPreview({ packId: this.packId, discountId: this.discountId, registrationDate: this.startDate });
    this.preview.set(p);
    this.amount = p?.price ?? null;
  }

  async save(): Promise<void> {
    if (hasInvalid(this.controls())) return;
    this.busy.set(true);
    this.error.set('');
    try {
      const body: Record<string, unknown> = { packId: this.packId, discountId: this.discountId, startDate: this.startDate };
      if (this.payNow && this.amount) Object.assign(body, { paymentAmount: this.amount, paymentMethod: this.method, paidOn: this.paidOn });
      this.ref.close(await this.api.post<SubscriptionView>(`/members/${this.c.member.id}/renew`, body));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

/** Blocks a save while a field is in error (e.g. mistyped date) and shows its message. */
export function hasInvalid(controls: readonly NgModel[]): boolean {
  const invalid = controls.filter((c) => c.invalid);
  invalid.forEach((c) => c.control.markAsTouched());
  return invalid.length > 0;
}

export function openPaymentDialog(dialog: MatDialog, data: PaymentDialogData): Promise<PaymentView | undefined> {
  return firstValueFrom(dialog.open(PaymentDialog, { data, width: '620px', maxWidth: '96vw' }).afterClosed());
}

export function openRenewDialog(dialog: MatDialog, card: MemberCard): Promise<SubscriptionView | undefined> {
  return firstValueFrom(dialog.open(RenewDialog, { data: card, width: '680px', maxWidth: '96vw' }).afterClosed());
}

/** Cancellation with a mandatory reason (the receipt keeps its number and shows "ANNULÉ"). */
export async function cancelWithReason(dialog: MatDialog, title: string, submit: (reason: string) => Promise<unknown>): Promise<boolean> {
  const ok = await openSimpleForm(dialog, {
    title,
    fields: [{ key: 'reason', label: "Motif de l'annulation", required: true, hint: 'Le numéro reste utilisé ; le document affichera « ANNULÉ ».' }],
    value: { reason: '' },
    submit: (v) => submit(String(v['reason'] ?? '')),
  });
  return !!ok;
}

export const receiptUrl = (p: { id: number }) => `/api/payments/${p.id}/receipt.pdf`;
export const salaryReceiptUrl = (p: { id: number }) => `/api/payroll/payments/${p.id}/receipt.pdf`;

/** Toast after a payment, with a button to open the receipt. */
export function notifyReceipt(notify: NotifyService, p: PaymentView): void {
  notify.successWithAction(`Paiement enregistré — reçu ${p.receiptNumber}.`, 'Voir le reçu', () => openPdf(receiptUrl(p)));
}
