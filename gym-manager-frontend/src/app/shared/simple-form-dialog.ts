import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { firstValueFrom } from 'rxjs';
import { errorMessage } from '../core/notify.service';

export interface SimpleField {
  key: string;
  label: string;
  type?: 'text' | 'number' | 'select' | 'password' | 'email';
  required?: boolean;
  min?: number;
  max?: number;
  step?: number;
  suffix?: string;
  hint?: string;
  options?: { value: unknown; label: string }[];
}

export interface SimpleFormData {
  title: string;
  fields: SimpleField[];
  value: Record<string, unknown>;
  /** Saves the values; throw to display the server error. */
  submit: (value: Record<string, unknown>) => Promise<unknown>;
}

/** Small generic form used by the referentials (remises, durées, fonctions, utilisateurs). */
@Component({
  selector: 'app-simple-form',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule],
  template: `
    <h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content>
      <form id="simple-form" (ngSubmit)="save()" class="stack">
        @for (f of data.fields; track f.key) {
          <mat-form-field class="w-full">
            <mat-label>{{ f.label }}</mat-label>
            @if (f.type === 'select') {
              <mat-select [(ngModel)]="value[f.key]" [name]="f.key" [required]="!!f.required">
                @for (o of f.options ?? []; track $index) {<mat-option [value]="o.value">{{ o.label }}</mat-option>}
              </mat-select>
            } @else {
              <input matInput [type]="f.type ?? 'text'" [(ngModel)]="value[f.key]" [name]="f.key" [required]="!!f.required"
                     [attr.min]="f.min" [attr.max]="f.max" [attr.step]="f.step" />
            }
            @if (f.suffix) {<span matTextSuffix>&nbsp;{{ f.suffix }}</span>}
            @if (f.hint) {<mat-hint>{{ f.hint }}</mat-hint>}
          </mat-form-field>
        }
      </form>
      @if (error()) {<p class="form-error" role="alert">{{ error() }}</p>}
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Annuler</button>
      <button mat-flat-button type="submit" form="simple-form" [disabled]="busy()">Enregistrer</button>
    </mat-dialog-actions>
  `,
})
export class SimpleFormDialog {
  data = inject<SimpleFormData>(MAT_DIALOG_DATA);
  private ref = inject(MatDialogRef<SimpleFormDialog>);
  value: Record<string, any> = { ...this.data.value };
  busy = signal(false);
  error = signal('');

  async save(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await this.data.submit(this.value);
      this.ref.close(r ?? true);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}

export function openSimpleForm(dialog: MatDialog, data: SimpleFormData): Promise<unknown> {
  return firstValueFrom(dialog.open(SimpleFormDialog, { data, width: '460px', maxWidth: '96vw' }).afterClosed());
}
