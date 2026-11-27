import { Component, computed, inject, signal, viewChildren } from '@angular/core';
import { FormsModule, NgModel } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { PAYMENT_METHODS, monthName, norm } from '../../core/format';
import { BusinessCategory, BusinessPaymentView, BusinessView, PaymentMethod } from '../../core/models';
import { errorMessage } from '../../core/notify.service';
import { DateField } from '../../shared/date-field';
import { SelectOption } from '../../shared/multi-select';
import { hasInvalid } from '../../shared/payment-dialogs';
import { SearchSelect } from '../../shared/search-select';
import { today } from '../charges/charge-dialogs';

export const BUSINESS_CATEGORIES: { value: BusinessCategory; label: string }[] = [
  { value: 'EQUIPEMENT', label: 'Équipement / kimonos' }, { value: 'VETEMENTS', label: 'Vêtements' },
  { value: 'NUTRITION', label: 'Nutrition / compléments' }, { value: 'COACHING', label: 'Coaching' },
  { value: 'SEANCE_PRIVEE', label: 'Séances privées' }, { value: 'PROGRAMME', label: 'Programmes' }, { value: 'AUTRE', label: 'Autre' },
];

/** At creation of a permanent item with a known amount: collected every month, this month only, or later by hand. */
type Collect = 'AUTO' | 'NOW' | 'LATER';

/**
 * Creates or edits a business item (sale or service). Permanent: due every month, its amount being the expected monthly
 * amount; one-off: a month. Optionally linked to a member, whose price and balance then include it. At creation, several
 * members may be ticked: one item is created for each.
 */
@Component({
  selector: 'app-business-form-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatCheckboxModule, MatFormFieldModule, MatInputModule,
    MatSelectModule, DateField, SearchSelect],
  template: `
    <h2 mat-dialog-title>{{ d.item ? 'Modifier le business' : 'Nouveau business' }}</h2>
    <mat-dialog-content>
      <form id="business-form" class="stack" (ngSubmit)="save()">
        <mat-form-field class="w-full"><mat-label>Libellé</mat-label>
          <input matInput name="label" [(ngModel)]="label" required maxlength="120" cdkFocusInitial placeholder="Ex. : Kimono karaté, coaching privé…" /></mat-form-field>
        <mat-form-field class="w-full"><mat-label>Catégorie</mat-label>
          <mat-select name="category" [(ngModel)]="category" required>
            @for (c of categories; track c.value) {<mat-option [value]="c.value">{{ c.label }}</mat-option>}
          </mat-select></mat-form-field>
        <div class="field-block">
          <span class="field-label">Type</span>
          @if (d.item) {
            <span>{{ permanent ? 'Permanent (chaque mois)' : 'Ponctuel' }} <span class="muted small">(le type ne change pas après la création)</span></span>
          } @else {
            <mat-button-toggle-group name="permanent" [(ngModel)]="permanent" aria-label="Type de business">
              <mat-button-toggle [value]="true">Permanent (chaque mois)</mat-button-toggle><mat-button-toggle [value]="false">Ponctuel</mat-button-toggle>
            </mat-button-toggle-group>
          }
        </div>
        @if (!permanent) {
          <app-date-field mode="month" label="Mois concerné" name="period" [(ngModel)]="period" required />
        }
        <div class="field-block">
          <span class="field-label">Lié à un adhérent ?</span>
          <mat-button-toggle-group name="linked" [(ngModel)]="linked" aria-label="Lié à un adhérent">
            <mat-button-toggle [value]="true">Oui</mat-button-toggle><mat-button-toggle [value]="false">Non</mat-button-toggle>
          </mat-button-toggle-group>
          @if (linked && d.item) {
            <app-search-select label="Adhérent" name="member" [options]="d.members" [(ngModel)]="memberId" />
            <span class="muted small">Son montant s’ajoute au prix de l’adhérent, et ce qui reste à encaisser à son solde.</span>
          } @else if (linked) {
            <div class="member-pick">
              <div class="member-pick-head">
                <mat-form-field class="grow" subscriptSizing="dynamic"><mat-label>Rechercher un adhérent</mat-label>
                  <input matInput name="memberQuery" [ngModel]="query()" (ngModelChange)="query.set($event)" placeholder="Code, nom, téléphone…" /></mat-form-field>
                <mat-checkbox [checked]="allShownPicked()" [indeterminate]="someShownPicked()" [disabled]="!shown().length"
                              (change)="pickShown($event.checked)">Tout cocher</mat-checkbox>
              </div>
              <div class="member-list" role="group" aria-label="Adhérents">
                @for (m of shown(); track m.id) {
                  <mat-checkbox [checked]="picked().has(m.id)" (change)="togglePick(m.id, $event.checked)">
                    {{ m.label }}@if (m.hint) {<span class="muted small"> · {{ m.hint }}</span>}
                  </mat-checkbox>
                } @empty {<p class="muted small">Aucun adhérent{{ query() ? ' ne correspond à la recherche' : '' }}.</p>}
              </div>
              <span class="small"><span class="strong">{{ picked().size }}</span> adhérent{{ picked().size > 1 ? 's' : '' }} sélectionné{{ picked().size > 1 ? 's' : '' }} sur {{ d.members.length }}</span>
            </div>
            <span class="muted small">Un business est créé pour chaque adhérent coché : son montant s’ajoute au prix de chacun, et ce qui reste à encaisser à son solde.</span>
          }
        </div>
        <div class="field-block">
          <span class="field-label">Connaissez-vous le montant ?</span>
          <mat-button-toggle-group name="known" [(ngModel)]="known" aria-label="Montant connu">
            <mat-button-toggle [value]="true">Oui</mat-button-toggle>
            <mat-button-toggle [value]="false">Non, je le saisirai en l’encaissant</mat-button-toggle>
          </mat-button-toggle-group>
          @if (permanent && !known) {<span class="muted small">Dû chaque mois à partir de {{ startLabel }} : vous saisirez son montant en l’encaissant.</span>}
        </div>
        @if (known) {
          <mat-form-field class="w-full"><mat-label>{{ permanent ? 'Montant mensuel' : 'Montant' }}</mat-label>
            <input matInput type="number" min="0.01" step="0.01" name="amount" [(ngModel)]="amount" required />
            <span matTextSuffix>&nbsp;{{ currency() }}</span></mat-form-field>
          @if (permanent && !d.item) {
            <div class="field-block">
              <span class="field-label">Encaissé</span>
              <mat-button-toggle-group name="collect" [(ngModel)]="collect" aria-label="Encaissement">
                <mat-button-toggle value="AUTO">Automatiquement chaque mois</mat-button-toggle>
                <mat-button-toggle value="NOW">Juste ce mois-ci</mat-button-toggle>
                <mat-button-toggle value="LATER">Plus tard</mat-button-toggle>
              </mat-button-toggle-group>
              <span class="muted small">{{ collectHint() }}</span>
            </div>
          }
          @if (permanent && d.item) {
            <div class="field-block">
              <span class="field-label">Encaissé automatiquement chaque mois ?</span>
              <mat-button-toggle-group name="autoPay" [(ngModel)]="autoPay" aria-label="Encaissement automatique">
                <mat-button-toggle [value]="true">Oui</mat-button-toggle><mat-button-toggle [value]="false">Non</mat-button-toggle>
              </mat-button-toggle-group>
              @if (autoPay) {<span class="muted small">Le mois en cours est encaissé avec ce montant s’il ne l’est pas déjà, puis chaque mois suivant le 1er.</span>}
            </div>
          }
          @if (!permanent && !d.item) {
            <div class="field-block">
              <span class="field-label">L’encaisser maintenant ?</span>
              <mat-button-toggle-group name="payNow" [(ngModel)]="payNow" aria-label="Encaisser maintenant">
                <mat-button-toggle [value]="true">Oui</mat-button-toggle><mat-button-toggle [value]="false">Non, plus tard</mat-button-toggle>
              </mat-button-toggle-group>
            </div>
          }
          @if (!d.item && collectsNow()) {
            <app-date-field label="Date de l’encaissement" name="paidOn" [(ngModel)]="paidOn" [max]="today" required />
          }
          @if (collectsNow() || (permanent && d.item && autoPay)) {
            <div class="field-block">
              <span class="field-label">Mode de paiement</span>
              <mat-button-toggle-group name="method" [(ngModel)]="method" aria-label="Mode de paiement">
                @for (m of methods; track m.value) {<mat-button-toggle [value]="m.value">{{ m.label }}</mat-button-toggle>}
              </mat-button-toggle-group>
            </div>
          }
        }
        <mat-form-field class="w-full"><mat-label>Note (facultatif)</mat-label><input matInput name="note" [(ngModel)]="note" maxlength="500" /></mat-form-field>
      </form>
      @if (error()) {<p class="form-error" role="alert">{{ error() }}</p>}
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Annuler</button>
      <button mat-flat-button type="submit" form="business-form" [disabled]="busy()">Enregistrer</button>
    </mat-dialog-actions>
  `,
  styles: `
    .member-pick { display: flex; flex-direction: column; gap: 6px; margin-top: 4px; }
    .member-pick-head { display: flex; align-items: center; gap: 12px; }
    .member-list { display: flex; flex-direction: column; max-height: 260px; overflow: auto; border: 1px solid var(--mat-sys-outline-variant); border-radius: 8px; padding: 4px 8px; }
  `,
})
export class BusinessFormDialog {
  d = inject<{ item?: BusinessView; period?: string; members: SelectOption[] }>(MAT_DIALOG_DATA);
  private api = inject(ApiService);
  private ref = inject(MatDialogRef<BusinessFormDialog>);
  private config = inject(ConfigService);
  currency = this.config.currency;
  categories = BUSINESS_CATEGORIES;
  methods = PAYMENT_METHODS;
  today = today(this.config);
  startLabel = monthName(this.d.item?.startPeriod ?? this.today.slice(0, 7));
  label = this.d.item?.label ?? '';
  category: BusinessCategory | null = this.d.item?.category ?? null;
  permanent = this.d.item?.permanent ?? false;
  period: string | null = this.d.item?.period ?? this.d.period ?? this.today.slice(0, 7);
  linked = !!this.d.item?.memberId;
  memberId: number | null = this.d.item?.memberId ?? null;
  /** Creation: members ticked in the list, one item each. */
  picked = signal(new Set<number>());
  query = signal('');
  shown = computed(() => {
    const q = norm(this.query());
    return this.d.members.filter((o) => !q || norm(o.label).includes(q) || norm(o.hint).includes(q));
  });
  allShownPicked = computed(() => this.shown().length > 0 && this.shown().every((o) => this.picked().has(o.id)));
  someShownPicked = computed(() => !this.allShownPicked() && this.shown().some((o) => this.picked().has(o.id)));
  known = this.d.item ? this.d.item.amount !== null : true;
  amount: number | null = this.d.item?.amount ?? null;
  collect: Collect = 'AUTO';
  /** Edit of a permanent item. */
  autoPay = this.d.item?.autoPay ?? false;
  payNow = true;
  paidOn = this.today;
  method: PaymentMethod = this.d.item?.autoMethod ?? 'ESPECES';
  note = this.d.item?.note ?? '';
  busy = signal(false);
  error = signal('');
  private controls = viewChildren(NgModel);

  /** Creation that collects the current month (permanent) or the item's month (one-off) right away. */
  collectsNow(): boolean {
    if (this.d.item || !this.known) return false;
    return this.permanent ? this.collect !== 'LATER' : this.payNow;
  }

  togglePick(id: number, on: boolean): void {
    const next = new Set(this.picked());
    if (on) next.add(id);
    else next.delete(id);
    this.picked.set(next);
  }

  /** Ticks or unticks every member shown by the search, leaving the others as they are. */
  pickShown(on: boolean): void {
    const next = new Set(this.picked());
    for (const o of this.shown()) {
      if (on) next.add(o.id);
      else next.delete(o.id);
    }
    this.picked.set(next);
  }

  collectHint(): string {
    switch (this.collect) {
      case 'AUTO': return `Le mois de ${this.startLabel} est encaissé maintenant, puis chaque mois suivant le 1er, avec ce montant.`;
      case 'NOW': return `Seul le mois de ${this.startLabel} est encaissé maintenant ; les mois suivants restent à encaisser à la main.`;
      default: return 'Chaque mois, dont celui-ci, reste à encaisser à la main.';
    }
  }

  async save(): Promise<void> {
    if (hasInvalid(this.controls())) return;
    const create = !this.d.item;
    const memberIds = this.d.members.map((o) => o.id).filter((id) => this.picked().has(id));
    if (this.linked && (create ? !memberIds.length : !this.memberId)) {
      this.error.set('Choisissez au moins un adhérent, ou répondez « Non » à « Lié à un adhérent ? ».');
      return;
    }
    const autoPay = this.permanent && this.known && (create ? this.collect === 'AUTO' : this.autoPay);
    const body = {
      label: this.label, category: this.category, permanent: this.permanent, note: this.note,
      period: this.permanent ? null : this.period, amount: this.known ? this.amount : null,
      memberId: this.linked && !create ? this.memberId : null,
      autoPay, payNow: create && this.collectsNow() && !autoPay, method: this.method, paidOn: this.paidOn,
    };
    this.busy.set(true);
    this.error.set('');
    try {
      this.ref.close(create && this.linked ? await this.api.post<BusinessView[]>('/business/batch', { ...body, memberIds })
        : await this.api.save<BusinessView>('business', this.d.item?.id, body));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

/** Collects a business item for a month, or corrects an existing collection (amount, date, method, note; never the month). */
@Component({
  selector: 'app-business-pay-dialog',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, DateField],
  template: `
    <h2 mat-dialog-title>{{ d.payment ? 'Corriger l’encaissement' : 'Encaisser' }} — {{ d.item.label }} · {{ month }}</h2>
    <mat-dialog-content>
      <form id="business-pay-form" class="form-grid" (ngSubmit)="save()">
        <mat-form-field class="span-2"><mat-label>Montant</mat-label>
          <input matInput type="number" min="0.01" step="0.01" name="amount" [(ngModel)]="amount" required cdkFocusInitial />
          <span matTextSuffix>&nbsp;{{ currency() }}</span></mat-form-field>
        <app-date-field label="Date de l’encaissement" name="paidOn" [(ngModel)]="paidOn" [max]="today" required />
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
      <button mat-flat-button type="submit" form="business-pay-form" [disabled]="busy()">Enregistrer l’encaissement</button>
    </mat-dialog-actions>
  `,
})
export class BusinessPayDialog {
  d = inject<{ item: BusinessView; period: string; expected: number | null; payment?: BusinessPaymentView }>(MAT_DIALOG_DATA);
  private api = inject(ApiService);
  private ref = inject(MatDialogRef<BusinessPayDialog>);
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
    const body = { businessId: this.d.item.id, period: this.d.period, amount: this.amount, method: this.method, paidOn: this.paidOn, note: this.note };
    this.busy.set(true);
    this.error.set('');
    try {
      this.ref.close(this.d.payment ? await this.api.put<BusinessPaymentView>(`/business/payments/${this.d.payment.id}`, body)
        : await this.api.post<BusinessPaymentView>('/business/payments', body));
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
