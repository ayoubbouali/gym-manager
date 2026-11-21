import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { ConfigService, initials } from '../../core/config.service';
import { errorMessage } from '../../core/notify.service';

@Component({
  selector: 'app-login',
  imports: [FormsModule, RouterLink, MatFormFieldModule, MatInputModule, MatButtonModule, LucideAngularModule],
  template: `
    <div class="auth-page">
      <div class="auth-hero" aria-hidden="true">
        <img class="hero-logo" src="/brand/logo.png" [alt]="config.publicName()" />
        <p>Adhérents, abonnements, coachs, activités et paiements : toute la gestion du club au même endroit.</p>
        <ul>
          <li><lucide-icon name="circle-check" [size]="18" /> Suivi des paiements et alertes WhatsApp</li>
          <li><lucide-icon name="circle-check" [size]="18" /> Salaires des coachs calculés automatiquement</li>
          <li><lucide-icon name="circle-check" [size]="18" /> Statistiques et chiffre d'affaires</li>
        </ul>
      </div>
      <form class="auth-card" (ngSubmit)="submit()" aria-labelledby="login-title">
        <img class="auth-card-logo" src="/brand/logo.png" alt="" />
        <h1 id="login-title">Connexion</h1>
        <p class="muted">Identifiez-vous pour accéder à la gestion du club.</p>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Identifiant</mat-label>
          <input matInput name="username" [(ngModel)]="username" autocomplete="username" required autofocus />
        </mat-form-field>
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Mot de passe</mat-label>
          <input matInput name="password" [type]="show() ? 'text' : 'password'" [(ngModel)]="password" autocomplete="current-password" required />
          <button type="button" matIconButton matSuffix (click)="show.set(!show())" [attr.aria-label]="show() ? 'Masquer le mot de passe' : 'Afficher le mot de passe'">
            <lucide-icon [name]="show() ? 'eye-off' : 'eye'" [size]="18" />
          </button>
        </mat-form-field>
        <a class="auth-link" routerLink="/mot-de-passe-oublie">Mot de passe oublié ?</a>
        @if (error()) {<p class="form-error" role="alert">{{ error() }}</p>}
        <button mat-flat-button class="w-full big" type="submit" [disabled]="busy()">Se connecter</button>
      </form>
    </div>
  `,
})
export class LoginPage {
  config = inject(ConfigService);
  private auth = inject(AuthService);
  private router = inject(Router);
  initials = initials;

  username = '';
  password = '';
  show = signal(false);
  busy = signal(false);
  error = signal('');

  constructor() {
    this.config.loadPublic();
  }

  async submit(): Promise<void> {
    if (!this.username || !this.password) {
      this.error.set('Saisissez votre identifiant et votre mot de passe.');
      return;
    }
    this.busy.set(true);
    this.error.set('');
    try {
      const u = await this.auth.login(this.username, this.password);
      this.router.navigateByUrl(u.mustChangePassword ? '/mot-de-passe' : '/');
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }
}
