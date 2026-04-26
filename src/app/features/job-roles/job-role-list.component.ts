import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';

interface Company { id: string; name: string; }
interface Department { id: string; companyId: string; name: string; }
interface JobRole { id: string; companyId: string; departmentId: string; name: string; description?: string; }

@Component({
  selector: 'app-job-role-list',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule, MatSelectModule, MatSnackBarModule],
  template: `
    <div class="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-6 py-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-3xl font-bold text-slate-900">Gestionar roles</h2>
        <button mat-flat-button color="primary" (click)="openCreate()"><mat-icon>add</mat-icon> Nuevo rol</button>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16"><mat-spinner /></div>
      } @else {
        <div class="overflow-hidden rounded-3xl bg-white shadow-sm">
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th class="px-4 py-3">Rol</th><th class="px-4 py-3">Departamento</th><th class="px-4 py-3">Empresa</th><th class="px-4 py-3">Acciones</th></tr>
              </thead>
              <tbody>
                @for (jobRole of jobRoles(); track jobRole.id) {
                  <tr class="border-t border-slate-100">
                    <td class="px-4 py-3">{{ jobRole.name }}</td>
                    <td class="px-4 py-3">{{ departmentName(jobRole.departmentId) }}</td>
                    <td class="px-4 py-3">{{ companyName(jobRole.companyId) }}</td>
                    <td class="px-4 py-3">
                      <button mat-icon-button (click)="openEdit(jobRole)"><mat-icon>edit</mat-icon></button>
                      <button mat-icon-button color="warn" (click)="remove(jobRole)"><mat-icon>delete</mat-icon></button>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="4" class="px-4 py-10 text-center text-slate-400">No hay roles registrados</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (showForm()) {
        <div class="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/40 px-4" (click)="showForm.set(false)">
          <mat-card class="w-full max-w-lg rounded-3xl p-6 shadow-2xl" (click)="$event.stopPropagation()">
            <h3 class="mb-4 text-xl font-semibold text-slate-900">{{ editId() ? 'Editar' : 'Nuevo' }} rol</h3>
            @if (auth.isSuperAdmin()) {
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Empresa</mat-label>
                <mat-select [(ngModel)]="form.companyId" (ngModelChange)="onCompanyChange()">
                  @for (company of companies(); track company.id) { <mat-option [value]="company.id">{{ company.name }}</mat-option> }
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
              <mat-select [(ngModel)]="form.departmentId">
                @for (department of availableDepartments(); track department.id) {
                  <mat-option [value]="department.id">{{ department.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Nombre del rol</mat-label>
              <input matInput [(ngModel)]="form.name">
            </mat-form-field>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Descripcion</mat-label>
              <textarea matInput rows="3" [(ngModel)]="form.description"></textarea>
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
export class JobRoleListComponent implements OnInit {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  auth = inject(AuthService);

  companies = signal<Company[]>([]);
  departments = signal<Department[]>([]);
  jobRoles = signal<JobRole[]>([]);
  loading = signal(true);
  showForm = signal(false);
  editId = signal<string | null>(null);
  form = { companyId: '', departmentId: '', name: '', description: '' };

  availableDepartments = computed(() => {
    if (!this.form.companyId) return [];
    return this.departments()
      .filter(department => department.companyId === this.form.companyId)
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  ngOnInit() { this.load(); }

  load() {
    this.api.get<Company[]>('/companies').subscribe({ next: companies => this.companies.set(companies) });
    this.api.get<Department[]>('/departments').subscribe({ next: departments => this.departments.set(departments) });
    this.api.get<JobRole[]>('/job-roles').subscribe({
      next: jobRoles => { this.jobRoles.set(jobRoles); this.loading.set(false); },
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

  onCompanyChange() {
    this.form.departmentId = '';
  }

  openCreate() {
    this.editId.set(null);
    this.form = {
      companyId: this.auth.user()?.companyId || this.companies()[0]?.id || '',
      departmentId: '',
      name: '',
      description: ''
    };
    this.showForm.set(true);
  }

  openEdit(jobRole: JobRole) {
    this.editId.set(jobRole.id);
    this.form = {
      companyId: this.auth.user()?.companyId || jobRole.companyId,
      departmentId: jobRole.departmentId,
      name: jobRole.name,
      description: jobRole.description || ''
    };
    this.showForm.set(true);
  }

  save() {
    const body = {
      companyId: this.form.companyId,
      departmentId: this.form.departmentId,
      name: this.form.name,
      description: this.form.description
    };
    const request = this.editId() ? this.api.patch(`/job-roles/${this.editId()}`, body) : this.api.post('/job-roles', body);
    request.subscribe({
      next: () => { this.showForm.set(false); this.load(); this.snack.open('Guardado', '', { duration: 2000 }); },
      error: (err) => this.snack.open(err.error?.message || 'Error', '', { duration: 3000 })
    });
  }

  remove(jobRole: JobRole) {
    if (!confirm(`Eliminar "${jobRole.name}"?`)) return;
    this.api.delete(`/job-roles/${jobRole.id}`).subscribe({
      next: () => { this.load(); this.snack.open('Eliminado', '', { duration: 2000 }); },
      error: () => this.snack.open('Error al eliminar', '', { duration: 3000 })
    });
  }
}
