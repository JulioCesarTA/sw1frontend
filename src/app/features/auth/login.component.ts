import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatFormFieldModule, MatInputModule,
    MatButtonModule, MatIconModule, MatProgressSpinnerModule, MatSnackBarModule
  ],
  template: `
    <div class="flex min-h-screen items-center justify-center bg-gradient-to-br from-indigo-500 via-slate-900 to-cyan-500 px-4 py-8">
      <mat-card class="w-full max-w-md rounded-[28px] bg-white/95 p-2 shadow-2xl shadow-slate-950/20 backdrop-blur">
        <div class="px-2 pb-4 pt-6 text-center">
          <mat-icon class="h-12 w-12 !text-5xl text-indigo-500">account_tree</mat-icon>
          <h1 class="mt-2 text-2xl font-bold text-slate-800">Workflow Manager</h1>
          <p class="mt-1 text-sm text-slate-500">Inicia sesion para continuar</p>
        </div>
        <mat-card-content>
          <form (ngSubmit)="onSubmit()">
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Email</mat-label>
              <input matInput type="email" [(ngModel)]="email" name="email" required autocomplete="email">
              <mat-icon matPrefix>email</mat-icon>
            </mat-form-field>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Contraseña</mat-label>
              <input matInput [type]="showPassword ? 'text' : 'password'" [(ngModel)]="password" name="password" required>
              <mat-icon matPrefix>lock</mat-icon>
              <button mat-icon-button matSuffix type="button" (click)="showPassword = !showPassword">
                <mat-icon>{{ showPassword ? 'visibility_off' : 'visibility' }}</mat-icon>
              </button>
            </mat-form-field>
            @if (error) {
              <p class="mb-2 mt-[-8px] text-center text-sm text-red-500">{{ error }}</p>
            }
            <button mat-flat-button color="primary" type="submit" class="mt-2 h-12 w-full text-base" [disabled]="loading">
              @if (loading) {
                <mat-spinner diameter="20" />
              } @else {
                Iniciar sesion
              }
            </button>
          </form>
        </mat-card-content>
      </mat-card>
    </div>
  `
})
export class LoginComponent {
  private auth = inject(AuthService);
  private router = inject(Router);
  private snack = inject(MatSnackBar);

  email = '';
  password = '';
  showPassword = false;
  loading = false;
  error = '';

  onSubmit() {
    if (!this.email || !this.password) return;
    this.loading = true;
    this.error = '';
    this.auth.login(this.email, this.password).subscribe({
      next: async () => {
        this.loading = false;
        const navigated = await this.router.navigate(['/dashboard']);
        if (!navigated) {
          this.error = 'No se pudo abrir el dashboard';
        }
      },
      error: (err) => {
        this.loading = false;
        this.error = err.error?.message || 'Credenciales inválidas';
      }
    });
  }
}
