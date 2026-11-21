import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { AuthService } from '../../core/auth.service';
import { NotifyService, errorMessage } from '../../core/notify.service';

/** Self-service account page: the user's email, used for the forgotten-password flow. */
@Component({
  selector: 'app-account',
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <section class="card max-480">
      <h3>{{ auth.user()?.username }} <span class="badge" [class.info]="auth.isAdmin()" [class.warn]="!auth.isAdmin()">{{ auth.user()?.role }}</span></h3>
      <form class="stack mt" (ngSubmit)="save()">
        <mat-form-field class="w-full">
          <mat-label>Adresse e-mail</mat-label>
          <input matInput type="email" name="email" [(ngModel)]="email" autocomplete="email" />
          <mat-hint>Sert à recevoir un mot de passe provisoire en cas d'oubli. Laisser vide pour la retirer.</mat-hint>
        </mat-form-field>
        @if (error()) {<p class="form-error" role="alert">{{ error() }}</p>}
        <div class="row-end mt">
          <button mat-flat-button type="submit" [disabled]="busy()">Enregistrer</button>
        </div>
      </form>
    </section>
  `,
})
export class AccountPage {
  auth = inject(AuthService);
  private notify = inject(NotifyService);
  email = this.auth.user()?.email ?? '';
  busy = signal(false);
  error = signal('');

  async save(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.updateEmail(this.email.trim());
      this.email = this.auth.user()?.email ?? '';
      this.notify.success('Adresse e-mail enregistrée.');
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
