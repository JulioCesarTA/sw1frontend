import { HttpInterceptorFn, HttpRequest, HttpHandlerFn, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { AuthService } from '../services/auth.service';

export const authInterceptor: HttpInterceptorFn = (req: HttpRequest<unknown>, next: HttpHandlerFn) => {
  const auth = inject(AuthService);
  const token = localStorage.getItem('accessToken');

  const authReq = token ? req.clone({ setHeaders: { Authorization: `Bearer ${token}` } }) : req;
  const isAuthFailure = (err: HttpErrorResponse) => {
    if (err.status === 401) return true;
    if (err.status !== 403) return false;
    const detail = String(err.error?.detail || err.error?.message || '').trim();
    return !detail;
  };

  return next(authReq).pipe(
    catchError((err: HttpErrorResponse) => {
      if (token && isAuthFailure(err) && !req.url.includes('/auth/')) {
        return auth.refreshToken().pipe(
          switchMap(refreshedToken => {
            const nextToken = refreshedToken || localStorage.getItem('accessToken') || '';
            const retried = req.clone({ setHeaders: { Authorization: `Bearer ${nextToken}` } });
            return next(retried);
          }),
          catchError(e => {
            auth.expireSession();
            return throwError(() => e);
          })
        );
      }
      return throwError(() => err);
    })
  );
};
