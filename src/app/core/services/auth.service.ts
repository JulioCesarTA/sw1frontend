import { Injectable, signal, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { catchError, switchMap, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  companyId?: string;
  departmentId?: string;
  jobRoleId?: string;
  jobRoleName?: string;
}

@Injectable({ providedIn: 'root' })
export class AuthService {
  private static readonly USER_STORAGE_KEY = 'authUser';
  private http = inject(HttpClient);
  private router = inject(Router);
  private base = environment.apiUrl;

  user = signal<AuthUser | null>(null);
  loading = signal(true);

  constructor() {
    this.loadCurrentUser();
  }

  private loadCurrentUser() {
    const storedUser = localStorage.getItem(AuthService.USER_STORAGE_KEY);
    if (storedUser) {
      try {
        this.user.set(JSON.parse(storedUser) as AuthUser);
      } catch {
        localStorage.removeItem(AuthService.USER_STORAGE_KEY);
      }
    }

    if (!localStorage.getItem('accessToken')) {
      this.loading.set(false);
      return;
    }

    this.http.get<AuthUser>(`${this.base}/auth/me`).pipe(
      catchError(() => this.refreshToken().pipe(
        switchMap(() => this.http.get<AuthUser>(`${this.base}/auth/me`))
      ))
    ).subscribe({
      next: user => {
        this.persistUser(user);
        this.loading.set(false);
      },
      error: () => {
        if (!this.user()) {
          this.clearSession(false);
        }
        this.loading.set(false);
      }
    });
  }

  login(email: string, password: string) {
    return this.http.post<{ accessToken: string; refreshToken: string; user: AuthUser }>(
      `${this.base}/auth/login`, { email, password }
    ).pipe(
      tap(res => {
        localStorage.setItem('accessToken', res.accessToken);
        localStorage.setItem('refreshToken', res.refreshToken);
        this.persistUser(res.user);
        this.loading.set(false);
      })
    );
  }

  logout() {
    const token = localStorage.getItem('accessToken');
    if (token) {
      this.http.post(`${this.base}/auth/logout`, {}).subscribe({
        complete: () => this.clearSession(),
        error: () => this.clearSession()
      });
      return;
    }
    this.clearSession();
  }

  refreshToken() {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) return throwError(() => new Error('No refresh token'));
    return this.http.post<{ accessToken: string }>(`${this.base}/auth/refresh`, { refreshToken }).pipe(
      tap(res => localStorage.setItem('accessToken', res.accessToken)),
      catchError(err => throwError(() => err))
    );
  }

  private clearSession(redirect = true) {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem(AuthService.USER_STORAGE_KEY);
    this.user.set(null);
    if (redirect) {
      this.router.navigate(['/login']);
    }
  }

  private persistUser(user: AuthUser) {
    this.user.set(user);
    localStorage.setItem(AuthService.USER_STORAGE_KEY, JSON.stringify(user));
  }

  isAdmin() {
    const role = this.user()?.role;
    return role === 'ADMIN' || role === 'SUPERADMIN';
  }
  isSuperAdmin() { return this.user()?.role === 'SUPERADMIN'; }
  isLoggedIn() { return !!this.user(); }
}
