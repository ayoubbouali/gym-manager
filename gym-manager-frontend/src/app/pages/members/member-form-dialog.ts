import { Component, DestroyRef, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';
import { FormBuilder, ReactiveFormsModule, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { debounceTime, firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { FrDatePipe, MoneyPipe } from '../../core/format';
import { DiscountView, MemberPreview, MemberView, PackView, SportView } from '../../core/models';
import { NotifyService, apiError, errorMessage } from '../../core/notify.service';
import { DateField } from '../../shared/date-field';
import { MultiSelect, SelectOption } from '../../shared/multi-select';

@Component({
  selector: 'app-member-form',
  imports: [ReactiveFormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule,
    MatButtonToggleModule, MultiSelect, DateField, MoneyPipe, FrDatePipe],
  template: `
    <h2 mat-dialog-title>{{ member ? 'Modifier ' + member.code + ' — ' + member.firstName + ' ' + member.lastName : 'Nouvel adhérent' }}</h2>
    <mat-dialog-content #content>
      @if (error()) {<p class="form-error form-error-top" role="alert">{{ error() }}</p>}
      <form [formGroup]="form" class="form-grid" (ngSubmit)="save()" id="member-form">
        <mat-form-field><mat-label>Nom</mat-label><input matInput formControlName="lastName" required /></mat-form-field>
        <mat-form-field><mat-label>Prénom</mat-label><input matInput formControlName="firstName" required /></mat-form-field>
        <mat-form-field><mat-label>Téléphone</mat-label><input matInput formControlName="phone" required inputmode="tel" [placeholder]="config.phoneExample()" /></mat-form-field>
        <app-date-field label="Date de naissance" formControlName="birthDate" />
        <app-multi-select class="span-2" label="Sport(s) *" formControlName="sportIds" [options]="sportOptions()" />
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
        <mat-form-field>
          <mat-label>Remise</mat-label>
          <mat-select formControlName="discountId">
            @for (d of discountOptions(); track d.id) {
              <mat-option [value]="d.id" [disabled]="!d.active">{{ d.name }}{{ d.active ? '' : ' — inactive' }}</mat-option>
            }
          </mat-select>
        </mat-form-field>
        <app-date-field label="Date d'inscription" formControlName="registrationDate" required />
        <div class="field-block">
          <span class="field-label">Assurance</span>
          <mat-button-toggle-group formControlName="insurance" aria-label="Assurance">
            <mat-button-toggle value="PAYE">Payé</mat-button-toggle>
            <mat-button-toggle value="IMPAYE">Impayé</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
        <mat-form-field><mat-label>Notes</mat-label><textarea matInput formControlName="notes" rows="1"></textarea></mat-form-field>
      </form>
      <div class="computed-box" aria-live="polite">
        <span class="muted">Calculé</span>
        @if (preview(); as p) {
          <b>{{ p.price | money }}</b><span>· fin le {{ p.endDate | frDate }}</span>
        } @else {
          <span class="muted">choisissez un pack et une date d'inscription</span>
        }
      </div>
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Annuler</button>
      <button mat-flat-button type="submit" form="member-form" [disabled]="busy()">Enregistrer</button>
    </mat-dialog-actions>
  `,
})
export class MemberFormDialog {
  member = inject<{ member?: MemberView }>(MAT_DIALOG_DATA).member;
  private api = inject(ApiService);
  private fb = inject(FormBuilder);
  private ref = inject(MatDialogRef<MemberFormDialog>);
  private notify = inject(NotifyService);
  config = inject(ConfigService);

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
    phone: [this.member?.phone ?? '', Validators.required],
    birthDate: [this.member?.birthDate ?? ''],
    sportIds: [this.member?.sportIds ?? ([] as number[])],
    packId: [this.member?.packId ?? (null as number | null), Validators.required],
    discountId: [this.member?.discountId ?? (null as number | null)],
    registrationDate: [this.member?.registrationDate ?? this.config.config()?.today ?? '', Validators.required],
    insurance: [this.member?.insurance ?? 'IMPAYE'],
    notes: [this.member?.notes ?? ''],
  });
  private values = toSignal(this.form.valueChanges, { initialValue: this.form.value });

  sportOptions = computed<SelectOption[]>(() =>
    this.sports().map((s) => ({ id: s.id, label: s.name, color: s.color, disabled: !s.active })));
  /** Active packs of the selected sports (+ the current pack, even if inactive). */
  packOptions = computed(() => {
    const ids = this.values().sportIds ?? [];
    return this.packs().filter((p) => ids.includes(p.sportId) && (p.active || p.id === this.member?.packId));
  });
  discountOptions = computed(() => this.discounts().filter((d) => d.active || d.id === this.member?.discountId));

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
  }

  private async refreshPreview(): Promise<void> {
    const v = this.form.value;
    if (!v.packId || !v.registrationDate) {
      this.preview.set(null);
      return;
    }
    try {
      this.preview.set(await this.api.memberPreview({ packId: v.packId, discountId: v.discountId ?? null, registrationDate: v.registrationDate }));
    } catch {
      this.preview.set(null);
    }
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
      this.showError('Renseignez les champs obligatoires : nom, prénom, téléphone, au moins un sport, un abonnement et la date d\'inscription.');
      return;
    }
    const v = this.form.getRawValue();
    this.busy.set(true);
    try {
      const saved = await this.api.save<MemberView>('members', this.member?.id, { ...v, birthDate: v.birthDate || null });
      this.notify.success(this.member ? 'Adhérent modifié.' : `Adhérent ${saved.code} créé.`);
      this.ref.close(saved);
    } catch (e) {
      const err = apiError(e);
      if (err?.field && this.form.get(err.field)) this.form.get(err.field)!.setErrors({ server: err.message });
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
