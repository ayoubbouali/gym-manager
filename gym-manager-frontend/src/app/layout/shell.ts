import { Component, DOCUMENT, computed, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, NavigationEnd, Router, RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { LucideAngularModule } from 'lucide-angular';
import { filter, map } from 'rxjs';
import { AuthService } from '../core/auth.service';
import { ConfigService } from '../core/config.service';
import { NAV } from './nav';

@Component({
  selector: 'app-shell',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, LucideAngularModule, MatMenuModule, MatTooltipModule],
  template: `
    <a class="skip-link" href="#main">Aller au contenu</a>
    <div class="app" [class.menu-open]="menuOpen()">
      <aside class="sidebar" aria-label="Menu principal">
        <div class="brand">
          <img class="brand-logo" [src]="config.markUrl()" alt="" />
          <div class="brand-text"><b>{{ config.clubName() }}</b><small>Gym Manager</small></div>
          <button class="icon-btn only-mobile close-menu" (click)="menuOpen.set(false)" aria-label="Fermer le menu"><lucide-icon name="x" /></button>
        </div>
        <nav>
          @for (g of nav(); track $index) {
            @if (g.label) {<div class="nav-sep">{{ g.label }}</div>}
            @for (i of g.items; track i.path) {
              <a [routerLink]="i.path" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: i.path === '/' }" (click)="menuOpen.set(false)">
                <lucide-icon [name]="i.icon" [size]="18" /> <span>{{ i.label }}</span>
              </a>
            }
          }
        </nav>
        <div class="sidebar-foot muted">v1.0 · {{ config.config()?.timezone }}</div>
      </aside>
      <div class="backdrop" (click)="menuOpen.set(false)"></div>

      <div class="content">
        <header class="topbar">
          <button class="icon-btn only-mobile" (click)="menuOpen.set(true)" aria-label="Ouvrir le menu"><lucide-icon name="menu" /></button>
          <h1>{{ title() }}</h1>
          <span class="grow"></span>
          <button class="icon-btn" (click)="toggleTheme()" [matTooltip]="dark() ? 'Thème clair' : 'Thème sombre'" [attr.aria-label]="dark() ? 'Activer le thème clair' : 'Activer le thème sombre'">
            <lucide-icon [name]="dark() ? 'sun' : 'moon'" [size]="18" />
          </button>
          <button class="user-chip" [matMenuTriggerFor]="userMenu" aria-label="Menu utilisateur">
            <span class="avatar sm">{{ (auth.user()?.username ?? '?').slice(0, 1).toUpperCase() }}</span>
            <span class="user-name">{{ auth.user()?.username }}</span>
            <span class="badge" [class.info]="auth.isAdmin()" [class.warn]="!auth.isAdmin()">{{ auth.user()?.role }}</span>
          </button>
          <mat-menu #userMenu="matMenu" xPosition="before">
            <button mat-menu-item routerLink="/mon-compte"><lucide-icon name="user-round" [size]="16" /> Mon compte</button>
            <button mat-menu-item routerLink="/mot-de-passe"><lucide-icon name="key-round" [size]="16" /> Changer le mot de passe</button>
            <button mat-menu-item (click)="auth.logout()"><lucide-icon name="log-out" [size]="16" /> Déconnexion</button>
          </mat-menu>
        </header>
        <main id="main" tabindex="-1">
          <router-outlet />
        </main>
      </div>
    </div>
  `,
})
export class Shell {
  auth = inject(AuthService);
  config = inject(ConfigService);
  private router = inject(Router);
  private route = inject(ActivatedRoute);
  private doc = inject(DOCUMENT);

  menuOpen = signal(false);
  dark = signal(readTheme() === 'dark');

  nav = computed(() => {
    const admin = this.auth.isAdmin();
    return NAV.map((g) => ({ ...g, items: g.items.filter((i) => admin || !i.adminOnly) })).filter((g) => g.items.length);
  });

  title = toSignal(
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), map(() => this.currentTitle())),
    { initialValue: this.currentTitle() },
  );

  constructor() {
    this.applyTheme();
  }

  private currentTitle(): string {
    let r = this.route.snapshot;
    while (r.firstChild) r = r.firstChild;
    const t = (r.data['title'] as string) ?? 'Gym Manager';
    this.doc.title = `${t} · ${this.config.clubName()}`;
    return t;
  }

  toggleTheme(): void {
    this.dark.set(!this.dark());
    try {
      localStorage.setItem('gm-theme', this.dark() ? 'dark' : 'light');
    } catch {
      /* private mode */
    }
    this.applyTheme();
    // charts read CSS colors at render time
    this.router.navigateByUrl(this.router.url, { onSameUrlNavigation: 'reload' });
  }

  private applyTheme(): void {
    this.doc.documentElement.classList.toggle('dark', this.dark());
  }
}

function readTheme(): string | null {
  try {
    return localStorage.getItem('gm-theme');
  } catch {
    return null;
  }
}
