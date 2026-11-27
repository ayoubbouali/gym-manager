import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ApiService } from '../../core/api.service';
import { ConfigService } from '../../core/config.service';
import { ActivityView, StaffOption } from '../../core/models';
import { NotifyService, errorMessage } from '../../core/notify.service';

/** Share of a paying activity's revenue offered to its manager by default, in %. */
export const DEFAULT_MANAGER_PERCENT = 50;

@Component({
  selector: 'app-activity-form',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatButtonToggleModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ d.activity ? 'Modifier ' + d.activity.code : 'Nouvelle activité' }}</h2>
    <mat-dialog-content>
      <form id="activity-form" class="form-grid" (ngSubmit)="save()">
        <mat-form-field class="span-2"><mat-label>Nom de l'activité</mat-label><input matInput name="name" [(ngModel)]="v.name" required /></mat-form-field>
        <mat-form-field><mat-label>Date et heure</mat-label><input matInput type="datetime-local" name="startsAt" [(ngModel)]="v.startsAt" required /></mat-form-field>
        <mat-form-field><mat-label>Lieu</mat-label><input matInput name="location" [(ngModel)]="v.location" /></mat-form-field>
        <mat-form-field><mat-label>Places max</mat-label><input matInput type="number" min="1" name="maxPlaces" [(ngModel)]="v.maxPlaces" /><mat-hint>Vide = illimité</mat-hint></mat-form-field>
        <div class="field-block">
          <span class="field-label">Type d’activité</span>
          <mat-button-toggle-group name="paid" [(ngModel)]="v.paid" aria-label="Type d’activité">
            <mat-button-toggle [value]="false">Gratuite</mat-button-toggle><mat-button-toggle [value]="true">Payante</mat-button-toggle>
          </mat-button-toggle-group>
        </div>
        @if (v.paid) {
          <mat-form-field><mat-label>Prix par inscrit</mat-label>
            <input matInput type="number" min="0.01" step="0.01" name="price" [(ngModel)]="v.price" required />
            <span matTextSuffix>&nbsp;{{ currency() }}</span>
            <mat-hint>Prix × inscrits compte dans le CA du mois de l’activité</mat-hint></mat-form-field>
        } @else {<span></span>}
        <mat-form-field [class.span-2]="!v.paid"><mat-label>Responsable</mat-label>
          <mat-select name="manager" [(ngModel)]="v.managerId" required>
            @for (s of staff; track s.id) {<mat-option [value]="s.id">{{ s.name }} <small class="muted">· {{ s.code }}@if (s.internal) { · interne}</small></mat-option>}
          </mat-select>
        </mat-form-field>
        @if (v.paid) {
          @if (managerInternal()) {
            <p class="muted small internal-note">Personnel interne : pas de pourcentage sur cette activité.</p>
          } @else {
            <mat-form-field><mat-label>Part du responsable</mat-label>
              <input matInput type="number" min="0" max="100" step="0.01" name="managerPercent" [(ngModel)]="v.managerPercent" required />
              <span matTextSuffix>&nbsp;%</span>
              <mat-hint>Du prix × inscrits, versée avec son salaire du mois</mat-hint></mat-form-field>
          }
        }
        <mat-form-field class="span-2"><mat-label>Description</mat-label><textarea matInput rows="2" name="description" [(ngModel)]="v.description"></textarea></mat-form-field>
      </form>
      @if (error()) {<p class="form-error" role="alert">{{ error() }}</p>}
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Annuler</button>
      <button mat-flat-button type="submit" form="activity-form" [disabled]="busy()">Enregistrer</button>
    </mat-dialog-actions>
  `,
})
export class ActivityFormDialog {
  d = inject<{ activity?: ActivityView; staff: StaffOption[] }>(MAT_DIALOG_DATA);
  private api = inject(ApiService);
  private ref = inject(MatDialogRef<ActivityFormDialog>);
  private notify = inject(NotifyService);
  currency = inject(ConfigService).currency;
  staff = this.d.staff.filter((s) => s.active || s.id === this.d.activity?.managerId);
  v = {
    name: this.d.activity?.name ?? '',
    startsAt: this.d.activity?.startsAt?.slice(0, 16) ?? '',
    paid: (this.d.activity?.price ?? 0) > 0,
    price: (this.d.activity?.price || null) as number | null,
    location: this.d.activity?.location ?? '',
    maxPlaces: this.d.activity?.maxPlaces ?? (null as number | null),
    managerId: this.d.activity?.managerId ?? (null as number | null),
    managerPercent: (this.d.activity?.managerPercent ?? DEFAULT_MANAGER_PERCENT) as number | null,
    description: this.d.activity?.description ?? '',
  };
  busy = signal(false);

  /** Internal staff (club owners) earn no share of the activities they manage. */
  managerInternal(): boolean {
    return this.staff.find((s) => s.id === this.v.managerId)?.internal ?? false;
  }
  error = signal('');

  async save(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const body = { ...this.v, price: this.v.paid ? this.v.price : 0, maxPlaces: this.v.maxPlaces || null,
        managerPercent: this.v.paid && !this.managerInternal() ? this.v.managerPercent : null,
        startsAt: this.v.startsAt ? `${this.v.startsAt}:00`.slice(0, 19) : null };
      await this.api.save('activities', this.d.activity?.id, body);
      this.notify.success(this.d.activity ? 'Activité modifiée.' : 'Activité créée.');
      this.ref.close(true);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
