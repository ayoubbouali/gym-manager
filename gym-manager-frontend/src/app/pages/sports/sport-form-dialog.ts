import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { LucideAngularModule } from 'lucide-angular';
import { ApiService } from '../../core/api.service';
import { WEEKDAYS } from '../../core/format';
import { SportView, StaffOption } from '../../core/models';
import { NotifyService, errorMessage } from '../../core/notify.service';
import { MultiSelect, SelectOption } from '../../shared/multi-select';

interface Slot { dayOfWeek: number; start: string; end: string; }

@Component({
  selector: 'app-sport-form',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, LucideAngularModule, MultiSelect],
  template: `
    <h2 mat-dialog-title>{{ d.sport ? 'Modifier ' + d.sport.code + ' — ' + d.sport.name : 'Nouveau sport' }}</h2>
    <mat-dialog-content>
      <form id="sport-form" class="form-grid" (ngSubmit)="save()">
        <mat-form-field><mat-label>Nom</mat-label><input matInput name="name" [(ngModel)]="v.name" required /></mat-form-field>
        <div class="field-block color-field">
          <span class="field-label">Couleur</span>
          <input type="color" name="color" [(ngModel)]="v.color" aria-label="Couleur du sport" />
          <code>{{ v.color }}</code>
        </div>
        <mat-form-field><mat-label>Capacité</mat-label><input matInput type="number" min="0" name="capacity" [(ngModel)]="v.capacity" required /></mat-form-field>
        <mat-form-field><mat-label>Prix mensuel</mat-label><input matInput type="number" min="0" step="0.01" name="price" [(ngModel)]="v.monthlyPrice" required /></mat-form-field>
        <app-multi-select class="span-2" label="Coach(s)" name="coaches" [(ngModel)]="v.coachIds" [options]="coachOptions" hint="Membres du personnel dont la fonction est Coach" />
      </form>
      <h4 class="section-title">Créneaux</h4>
      <table class="table compact">
        <thead><tr><th>Jour</th><th>Début</th><th>Fin</th><th></th></tr></thead>
        <tbody>
          @for (s of slots(); track $index; let i = $index) {
            <tr>
              <td><select class="cell-input" [(ngModel)]="s.dayOfWeek" [attr.aria-label]="'Jour du créneau ' + (i + 1)">
                @for (w of weekdays; track $index) {<option [ngValue]="$index + 1">{{ w }}</option>}
              </select></td>
              <td><input class="cell-input" type="time" [(ngModel)]="s.start" [attr.aria-label]="'Début du créneau ' + (i + 1)" /></td>
              <td><input class="cell-input" type="time" [(ngModel)]="s.end" [attr.aria-label]="'Fin du créneau ' + (i + 1)" /></td>
              <td class="actions"><button type="button" class="icon-btn danger" (click)="removeSlot(i)" [attr.aria-label]="'Supprimer le créneau ' + (i + 1)"><lucide-icon name="x" [size]="16" /></button></td>
            </tr>
          } @empty {<tr><td colspan="4" class="empty">Aucun créneau.</td></tr>}
        </tbody>
      </table>
      <button mat-stroked-button type="button" (click)="addSlot()"><lucide-icon name="plus" [size]="16" /> Ajouter un créneau</button>
      @if (error()) {<p class="form-error" role="alert">{{ error() }}</p>}
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Annuler</button>
      <button mat-flat-button type="submit" form="sport-form" [disabled]="busy()">Enregistrer</button>
    </mat-dialog-actions>
  `,
})
export class SportFormDialog {
  d = inject<{ sport?: SportView; staff: StaffOption[] }>(MAT_DIALOG_DATA);
  private api = inject(ApiService);
  private ref = inject(MatDialogRef<SportFormDialog>);
  private notify = inject(NotifyService);
  weekdays = WEEKDAYS;
  /** Coaches only; a non-coach already assigned stays listed (greyed out) so that it is removed knowingly. */
  coachOptions: SelectOption[] = this.d.staff
    .filter((s) => s.coach || this.d.sport?.coachIds.includes(s.id))
    .map((s) => ({ id: s.id, label: s.coach ? s.name : `${s.name} (pas coach)`, hint: s.code, disabled: !s.active || !s.coach }));
  v = {
    name: this.d.sport?.name ?? '',
    color: this.d.sport?.color ?? '#C62828',
    capacity: this.d.sport?.capacity ?? 20,
    monthlyPrice: this.d.sport?.monthlyPrice ?? 0,
    coachIds: [...(this.d.sport?.coachIds ?? [])],
  };
  slots = signal<Slot[]>((this.d.sport?.schedules ?? []).map((s) => ({ dayOfWeek: s.dayOfWeek, start: s.start.slice(0, 5), end: s.end.slice(0, 5) })));
  busy = signal(false);
  error = signal('');

  addSlot(): void {
    const last = this.slots().at(-1);
    this.slots.set([...this.slots(), { dayOfWeek: last ? Math.min(7, last.dayOfWeek + 1) : 1, start: last?.start ?? '18:00', end: last?.end ?? '19:00' }]);
  }

  removeSlot(i: number): void {
    this.slots.set(this.slots().filter((_, j) => j !== i));
  }

  async save(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.api.save('sports', this.d.sport?.id, { ...this.v, schedules: this.slots() });
      this.notify.success(this.d.sport ? 'Sport modifié.' : 'Sport créé.');
      this.ref.close(true);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
