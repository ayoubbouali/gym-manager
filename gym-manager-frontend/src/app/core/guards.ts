import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';
import { ConfigService } from './config.service';
import { Permission } from './models';

/**
 * Authenticated user with an up-to-date password; loads the UI configuration.
 * A visitor without a session who opens the home page gets the public site; any other page asks to sign in.
 */
export const authGuard: CanActivateFn = async (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);
  const config = inject(ConfigService);
  const user = await auth.ensureLoaded();
  if (!user) return router.parseUrl(state.url === '/' ? '/club' : '/connexion');
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
