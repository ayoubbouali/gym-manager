import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';
import { AuthService } from './auth.service';

/** Redirects to the login page on 401 and to the password page when a change is required; reloads the permissions on 403. */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthService);
  return next(req).pipe(
    catchError((err: unknown) => {
      if (err instanceof HttpErrorResponse && !req.url.includes('/auth/login') && !req.url.includes('/auth/me')) {
        if (err.status === 401) {
          auth.clear();
          router.navigateByUrl('/connexion');
        } else if (err.status === 403 && err.error?.code === 'MUST_CHANGE_PASSWORD') {
          router.navigateByUrl('/mot-de-passe');
        } else if (err.status === 403) {
          // the role may have been edited meanwhile: the menu follows the current permissions
          auth.refresh().catch(() => undefined);
        }
      }
      return throwError(() => err);
    }),
  );
};
