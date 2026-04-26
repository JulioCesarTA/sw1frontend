import { Component, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  companyId?: string;
  departmentId?: string;
  jobTitle?: string;
}

interface Company {
  id: string;
  name: string;
}

interface Department {
  id: string;
  companyId: string;
  name: string;
}

interface JobRole {
  id: string;
  companyId: string;
  departmentId: string;
  name: string;
}

@Component({
  selector: 'app-user-list',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatSelectModule,
    MatProgressSpinnerModule, MatSnackBarModule
  ],
  template: `
    <div class="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-6 py-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-3xl font-bold text-slate-900">Usuarios</h2>
        <button mat-flat-button color="primary" (click)="openCreate()">
          <mat-icon>person_add</mat-icon> Nuevo Usuario
        </button>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16"><mat-spinner /></div>
      } @else {
        <div class="overflow-hidden rounded-3xl bg-white shadow-sm">
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th class="px-4 py-3">Nombre</th><th class="px-4 py-3">Email</th><th class="px-4 py-3">Cargo</th><th class="px-4 py-3">Departamento</th><th class="px-4 py-3">Empresa</th><th class="px-4 py-3">Acciones</th></tr>
              </thead>
              <tbody>
                @for (u of users(); track u.id) {
                  <tr class="border-t border-slate-100">
                    <td class="px-4 py-3">{{ u.name }}</td>
                    <td class="px-4 py-3">{{ u.email }}</td>
                    <td class="px-4 py-3">{{ u.jobTitle || '-' }}</td>
                    <td class="px-4 py-3">{{ departmentName(u.departmentId) }}</td>
                    <td class="px-4 py-3">{{ companyName(u.companyId) }}</td>
                    <td class="px-4 py-3">
                      <button mat-icon-button (click)="openEdit(u)"><mat-icon>edit</mat-icon></button>
                      <button mat-icon-button color="warn" (click)="remove(u)"><mat-icon>delete</mat-icon></button>
                    </td>
                  </tr>
                }
                @empty {
                  <tr><td colspan="6" class="px-4 py-10 text-center text-slate-400">No hay usuarios</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (showForm()) {
        <div class="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/40 px-4" (click)="showForm.set(false)">
          <mat-card class="w-full max-w-lg rounded-3xl p-6 shadow-2xl" (click)="$event.stopPropagation()">
            <h3 class="mb-4 text-xl font-semibold text-slate-900">{{ editId() ? 'Editar' : 'Nuevo' }} Usuario</h3>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Nombre</mat-label>
              <input matInput [(ngModel)]="form.name">
            </mat-form-field>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Email</mat-label>
              <input matInput type="email" [(ngModel)]="form.email">
            </mat-form-field>
            @if (!editId()) {
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Contraseña</mat-label>
                <input matInput type="password" [(ngModel)]="form.password">
              </mat-form-field>
            }
            @if (auth.isSuperAdmin()) {
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Empresa</mat-label>
                <mat-select [(ngModel)]="form.companyId" (ngModelChange)="onCompanyChange()">
                  @for (company of companies(); track company.id) {
                    <mat-option [value]="company.id">{{ company.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>
            } @else {
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Empresa</mat-label>
                <input matInput [value]="companyName(form.companyId)" readonly>
              </mat-form-field>
            }
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Departamento</mat-label>
              <mat-select [(ngModel)]="form.departmentId" (ngModelChange)="onDepartmentChange()">
                <mat-option value="">Sin departamento</mat-option>
                @for (department of availableDepartments(); track department.id) {
                  <mat-option [value]="department.id">{{ department.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Cargo</mat-label>
              <mat-select [(ngModel)]="form.jobTitle" [disabled]="availableJobTitles().length === 0">
                <mat-option value="">Sin cargo</mat-option>
                @for (jobTitle of availableJobTitles(); track jobTitle) {
                  <mat-option [value]="jobTitle">{{ jobTitle }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <div class="mt-4 flex justify-end gap-2">
              <button mat-button (click)="showForm.set(false)">Cancelar</button>
              <button mat-flat-button color="primary" (click)="save()">Guardar</button>
            </div>
          </mat-card>
        </div>
      }
    </div>
  `
})
export class UserListComponent implements OnInit {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  auth = inject(AuthService);

  users = signal<User[]>([]);
  companies = signal<Company[]>([]);
  departments = signal<Department[]>([]);
  jobRoles = signal<JobRole[]>([]);
  loading = signal(true);
  showForm = signal(false);
  editId = signal<string | null>(null);
  form = { name: '', email: '', password: '', companyId: '', departmentId: '', jobTitle: '' };

  ngOnInit() { this.load(); }

  load() {
    this.api.get<Company[]>('/companies').subscribe({ next: companies => this.companies.set(companies) });
    this.api.get<Department[]>('/departments').subscribe({
      next: departments => this.departments.set(departments)
    });
    this.loadJobRoles();
    this.api.get<User[]>('/users').subscribe({
      next: users => { this.users.set(users); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  companyName(companyId?: string) {
    if (!companyId) return '-';
    return this.companies().find(company => company.id === companyId)?.name || companyId;
  }

  departmentName(departmentId?: string) {
    if (!departmentId) return '-';
    return this.departments().find(department => department.id === departmentId)?.name || departmentId;
  }

  availableDepartments() {
    if (!this.form.companyId) return [];
    return this.departments()
      .filter(department => department.companyId === this.form.companyId)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  availableJobTitles() {
    if (!this.form.departmentId) return [];
    return this.jobRoles()
      .filter(jobRole => jobRole.departmentId === this.form.departmentId)
      .map(jobRole => jobRole.name)
      .sort((a, b) => a.localeCompare(b));
  }

  onCompanyChange() {
    this.form.departmentId = '';
    this.form.jobTitle = '';
    this.loadJobRoles();
  }

  onDepartmentChange() {
    this.form.jobTitle = '';
    this.loadJobRoles();
  }

  openCreate() {
    this.editId.set(null);
    this.form = {
      name: '',
      email: '',
      password: '',
      companyId: this.auth.user()?.companyId || this.companies()[0]?.id || '',
      departmentId: '',
      jobTitle: ''
    };
    this.loadJobRoles();
    this.showForm.set(true);
  }

  openEdit(user: User) {
    this.editId.set(user.id);
    this.form = {
      name: user.name,
      email: user.email,
      password: '',
      companyId: this.auth.user()?.companyId || user.companyId || '',
      departmentId: user.departmentId || '',
      jobTitle: user.jobTitle || ''
    };
    this.loadJobRoles();
    this.showForm.set(true);
  }

  private loadJobRoles() {
    const params = this.form.departmentId ? { departmentId: this.form.departmentId } : undefined;
    this.api.get<JobRole[]>('/job-roles', params).subscribe({
      next: jobRoles => this.jobRoles.set(jobRoles),
      error: () => this.jobRoles.set([])
    });
  }

  save() {
    const body: Record<string, unknown> = {
      name: this.form.name,
      email: this.form.email,
      companyId: this.form.companyId,
      departmentId: this.form.departmentId || null,
      jobTitle: this.form.jobTitle || null
    };
    if (!this.editId() && this.form.password) body['password'] = this.form.password;
    const request = this.editId() ? this.api.patch(`/users/${this.editId()}`, body) : this.api.post('/users', body);
    request.subscribe({
      next: () => { this.showForm.set(false); this.load(); this.snack.open('Guardado', '', { duration: 2000 }); },
      error: (err) => this.snack.open(err.error?.message || 'Error', '', { duration: 3000 })
    });
  }

  remove(user: User) {
    if (!confirm(`Eliminar a ${user.name}?`)) return;
    this.api.delete(`/users/${user.id}`).subscribe({
      next: () => { this.load(); this.snack.open('Eliminado', '', { duration: 2000 }); },
      error: () => this.snack.open('Error al eliminar', '', { duration: 3000 })
    });
  }
}
