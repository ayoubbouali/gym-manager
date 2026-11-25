import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { ApiService } from '../../core/api.service';
import { User, UserRoleView } from '../../core/models';
import { errorMessage } from '../../core/notify.service';
import { PhoneInput, PhoneValue } from '../../shared/phone-input';
import { permissionSummary } from './role-form-dialog';

/** Creates a user account, or edits its email and phone (the role is changed from the table). */
@Component({
  selector: 'app-user-form',
  imports: [FormsModule, MatDialogModule, MatButtonModule, MatFormFieldModule, MatInputModule, MatSelectModule, PhoneInput],
  template: `
    <h2 mat-dialog-title>{{ d.user ? 'Modifier ' + d.user.username : 'Nouvel utilisateur' }}</h2>
    <mat-dialog-content>
      <form id="user-form" class="stack" (ngSubmit)="save()">
        @if (!d.user) {
          <mat-form-field class="w-full"><mat-label>Identifiant</mat-label>
            <input matInput name="username" [(ngModel)]="v.username" required autocomplete="off" />
          </mat-form-field>
          <mat-form-field class="w-full"><mat-label>Mot de passe provisoire</mat-label>
            <input matInput type="password" name="password" [(ngModel)]="v.password" required autocomplete="new-password" />
            <mat-hint>À changer à la première connexion (8 caractères, lettres et chiffres).</mat-hint>
          </mat-form-field>
          <mat-form-field class="w-full"><mat-label>Rôle</mat-label>
            <mat-select name="role" [(ngModel)]="v.roleId" required>
              @for (r of d.roles; track r.id) {<mat-option [value]="r.id">{{ r.name }} <span class="muted">· {{ summary(r.permissions) }}</span></mat-option>}
            </mat-select>
          </mat-form-field>
        }
        <mat-form-field class="w-full"><mat-label>Adresse e-mail</mat-label>
          <input matInput type="email" name="email" [(ngModel)]="v.email" autocomplete="off" />
          <mat-hint>Facultative, unique : permet de recevoir un mot de passe provisoire en cas d'oubli.</mat-hint>
        </mat-form-field>
        <app-phone-input label="Téléphone (facultatif)" name="phone" [(ngModel)]="v.phone" />
      </form>
      @if (error()) {<p class="form-error" role="alert">{{ error() }}</p>}
    </mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button mat-dialog-close type="button">Annuler</button>
      <button mat-flat-button type="submit" form="user-form" [disabled]="busy()">Enregistrer</button>
    </mat-dialog-actions>
  `,
})
export class UserFormDialog {
  d = inject<{ user?: User; roles: UserRoleView[] }>(MAT_DIALOG_DATA);
  private api = inject(ApiService);
  private ref = inject(MatDialogRef<UserFormDialog>);
  v = {
    username: '',
    password: '',
    // the role granting the fewest permissions, the safest default for a new account
    roleId: this.d.user?.roleId ?? [...this.d.roles].sort((a, b) => a.permissions.length - b.permissions.length)[0]?.id ?? null,
    email: this.d.user?.email ?? '',
    phone: { country: null, number: this.d.user?.phone ?? '' } as PhoneValue,
  };
  busy = signal(false);
  error = signal('');
  summary = permissionSummary;

  async save(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    const contact = { email: this.v.email.trim(), phone: this.v.phone.number, phoneCountry: this.v.phone.country };
    try {
      const r = this.d.user
        ? await this.api.put<User>(`/users/${this.d.user.id}`, contact)
        : await this.api.post<User>('/users', { username: this.v.username, password: this.v.password, roleId: this.v.roleId, ...contact });
      this.ref.close(r);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
