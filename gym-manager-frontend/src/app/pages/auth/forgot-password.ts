import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { ApiService } from '../../core/api.service';
import { errorMessage } from '../../core/notify.service';

/** Public page: emails a temporary password; the server answers the same way for any username. */
@Component({
  selector: 'app-forgot-password',
  imports: [FormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule],
  template: `
    <div class="auth-page single">
      <form class="auth-card" (ngSubmit)="submit()" aria-labelledby="forgot-title">
        <h1 id="forgot-title">Mot de passe oublié</h1>
        @if (message()) {
          <p class="note" role="status">{{ message() }}</p>
          <p class="muted">Connectez-vous avec le mot de passe provisoire reçu : vous choisirez ensuite un nouveau mot de passe. Votre mot de passe actuel reste valable entre-temps.</p>
          <a mat-flat-button class="w-full big" routerLink="/connexion">Retour à la connexion</a>
        } @else {
          <p class="muted">Saisissez votre identifiant : un mot de passe provisoire sera envoyé à l'adresse e-mail de votre compte.</p>
          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Identifiant</mat-label>
            <input matInput name="username" [(ngModel)]="username" autocomplete="username" required autofocus />
          </mat-form-field>
          @if (error()) {<p class="form-error" role="alert">{{ error() }}</p>}
          <button mat-flat-button class="w-full big" type="submit" [disabled]="busy()">Envoyer un mot de passe provisoire</button>
          <a class="auth-link back" routerLink="/connexion">Retour à la connexion</a>
        }
      </form>
    </div>
  `,
})
export class ForgotPasswordPage {
  private api = inject(ApiService);
  username = '';
  busy = signal(false);
  error = signal('');
  message = signal('');

  async submit(): Promise<void> {
    if (!this.username.trim()) {
      this.error.set('Saisissez votre identifiant.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const r = await this.api.post<{ message: string }>('/public/forgot-password', { username: this.username.trim() });
      this.message.set(r.message);
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
