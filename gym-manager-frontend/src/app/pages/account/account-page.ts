import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { LucideAngularModule } from 'lucide-angular';
import { AuthService } from '../../core/auth.service';
import { NotifyService, errorMessage } from '../../core/notify.service';
import { ConfirmService } from '../../shared/confirm.service';
import { PhoneInput, PhoneValue } from '../../shared/phone-input';

/** Self-service account page: profile photo, email (used for the forgotten-password flow) and phone. */
@Component({
  selector: 'app-account',
  imports: [FormsModule, MatFormFieldModule, MatInputModule, MatButtonModule, LucideAngularModule, PhoneInput],
  template: `
    <section class="card max-640">
      <div class="account-head">
        <div class="photo-col account-photo">
          @if (auth.photoUrl(); as url) {
            <img class="photo" [src]="url" [alt]="'Photo de ' + auth.user()?.username" />
          } @else {
            <div class="photo initials" aria-hidden="true">{{ initial() }}</div>
          }
          <label class="photo-btn" mat-stroked-button>
            <lucide-icon name="camera" [size]="16" /> {{ auth.user()?.hasPhoto ? 'Changer la photo' : 'Ajouter une photo' }}
            <input type="file" accept="image/jpeg,image/png" (change)="upload($event)" class="sr-only" />
          </label>
          @if (auth.user()?.hasPhoto) {<button class="link-btn danger" (click)="removePhoto()">Retirer la photo</button>}
        </div>
        <div class="grow">
          <h3>{{ auth.user()?.username }} <span class="badge" [class.info]="auth.isAdmin()" [class.warn]="!auth.isAdmin()">{{ auth.user()?.roleName }}</span></h3>
          <form class="stack mt" (ngSubmit)="save()">
            <mat-form-field class="w-full">
              <mat-label>Adresse e-mail</mat-label>
              <input matInput type="email" name="email" [(ngModel)]="email" autocomplete="email" />
              <mat-hint>Sert à recevoir un mot de passe provisoire en cas d'oubli. Laisser vide pour la retirer.</mat-hint>
            </mat-form-field>
            <app-phone-input label="Téléphone (facultatif)" name="phone" [(ngModel)]="phone" />
            @if (error()) {<p class="form-error" role="alert">{{ error() }}</p>}
            <div class="row-end mt">
              <button mat-flat-button type="submit" [disabled]="busy()">Enregistrer</button>
            </div>
          </form>
        </div>
      </div>
    </section>
  `,
})
export class AccountPage {
  auth = inject(AuthService);
  private notify = inject(NotifyService);
  private confirm = inject(ConfirmService);
  email = this.auth.user()?.email ?? '';
  phone: PhoneValue = { country: null, number: this.auth.user()?.phone ?? '' };
  busy = signal(false);
  error = signal('');

  constructor() {
    this.auth.refresh().then(() => this.resetForm(), () => {});
  }

  private resetForm(): void {
    this.email = this.auth.user()?.email ?? '';
    this.phone = { country: null, number: this.auth.user()?.phone ?? '' };
  }

  initial(): string {
    return (this.auth.user()?.username ?? '?').slice(0, 1).toUpperCase();
  }

  async save(): Promise<void> {
    this.busy.set(true);
    this.error.set('');
    try {
      await this.auth.updateAccount({ email: this.email.trim(), phone: this.phone.number, phoneCountry: this.phone.country });
      this.resetForm();
      this.notify.success('Compte enregistré.');
    } catch (e) {
      this.error.set(errorMessage(e));
    } finally {
      this.busy.set(false);
    }
  }

  async upload(ev: Event): Promise<void> {
    const input = ev.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) return this.notify.error({ error: { message: 'Format non accepté : JPG ou PNG uniquement.' } });
    if (file.size > 2 * 1024 * 1024) return this.notify.error({ error: { message: 'Fichier trop volumineux (2 Mo maximum).' } });
    try {
      await this.auth.uploadPhoto(file);
      this.notify.success('Photo enregistrée.');
    } catch (e) {
      this.notify.error(e);
    }
  }

  async removePhoto(): Promise<void> {
    if (!(await this.confirm.confirm({ title: 'Retirer la photo ?', confirmLabel: 'Retirer', danger: true }))) return;
    try {
      await this.auth.deletePhoto();
    } catch (e) {
      this.notify.error(e);
    }
  }
}
