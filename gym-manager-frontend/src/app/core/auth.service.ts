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

  async updateEmail(email: string): Promise<void> {
    this.user.set(await this.api.put<User>('/auth/me', { email }));
  }

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
