import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ApiService } from './api.service';
import { ConfigService } from './config.service';
import { User } from './models';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private api = inject(ApiService);
  private router = inject(Router);
  private config = inject(ConfigService);

  readonly user = signal<User | null>(null);
  readonly isAdmin = computed(() => this.user()?.role === 'ADMIN');
  private checked = false;

  /** Restores the session once (on page load). */
  async ensureLoaded(): Promise<User | null> {
    if (!this.checked) {
      this.checked = true;
      try {
        this.user.set(await this.api.get<User>('/auth/me'));
      } catch {
        this.user.set(null);
      }
    }
    return this.user();
  }

  async login(username: string, password: string): Promise<User> {
    const u = await this.api.post<User>('/auth/login', { username, password });
    this.user.set(u);
    this.checked = true;
    return u;
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    this.user.set(await this.api.post<User>('/auth/change-password', { currentPassword, newPassword }));
  }

  /** Reloads the account from the server: it may have been changed elsewhere (Paramètres › Utilisateurs). */
  async refresh(): Promise<void> {
    this.user.set(await this.api.get<User>('/auth/me'));
  }

  /** Null fields are left unchanged; a blank value removes it. */
  async updateAccount(body: { email?: string; phone?: string; phoneCountry?: string | null }): Promise<void> {
    this.user.set(await this.api.put<User>('/auth/me', body));
  }

  async uploadPhoto(file: File): Promise<void> {
    this.user.set(await this.api.upload<User>('/auth/me/photo', file));
    this.photoVersion.set(Date.now());
  }

  async deletePhoto(): Promise<void> {
    this.user.set(await this.api.delete<User>('/auth/me/photo'));
  }

  /** Cache-busting suffix of the profile photo URL, bumped on each upload. */
  readonly photoVersion = signal(Date.now());
  readonly photoUrl = computed(() => (this.user()?.hasPhoto ? `/api/auth/me/photo?v=${this.photoVersion()}` : null));

  async logout(): Promise<void> {
    try {
      await this.api.post('/auth/logout');
    } finally {
      this.clear();
      this.router.navigateByUrl('/connexion');
    }
  }

  /** Called on 401: local state is dropped. */
  clear(): void {
    this.user.set(null);
    this.config.config.set(null);
  }
}
