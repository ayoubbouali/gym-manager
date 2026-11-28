import { inject } from '@angular/core';
import { CanActivateFn, CanMatchFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ConfigService } from './config.service';
import { Permission } from './models';

/** Authenticated user with an up-to-date password; loads the UI configuration. */
export const authGuard: CanActivateFn = async () => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const config = inject(ConfigService);
  const user = await auth.ensureLoaded();
  if (!user) return router.parseUrl('/connexion');
  if (user.mustChangePassword) return router.parseUrl('/mot-de-passe');
  if (!config.config()) {
    try {
      await config.load();
    } catch {
      return router.parseUrl('/connexion');
    }
  }
  return true;
};

/** Page opened only by the roles granting {@code permission}. The server enforces it too. */
export function permissionGuard(permission: Permission): CanActivateFn {
  return () => (inject(AuthService).can(permission) ? true : inject(Router).parseUrl('/acces-refuse'));
}

export const passwordGuard: CanActivateFn = async () => {
  const user = await inject(AuthService).ensureLoaded();
  return user ? true : inject(Router).parseUrl('/connexion');
};

/** Matches only without a session: the home page then shows the public site. */
export const visitorGuard: CanMatchFn = async () => !(await inject(AuthService).ensureLoaded());
