import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';

interface Company {
  id: string;
  name: string;
  description?: string;
}

@Component({
  selector: 'app-company-list',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule, MatSnackBarModule],
  template: `
    <div class="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-6 py-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-3xl font-bold text-slate-900">Empresas</h2>
        <button mat-flat-button color="primary" (click)="openCreate()"><mat-icon>add</mat-icon> Nueva empresa</button>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16"><mat-spinner /></div>
      } @else {
        <div class="overflow-hidden rounded-3xl bg-white shadow-sm">
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th class="px-4 py-3">Nombre</th><th class="px-4 py-3">Descripcion</th><th class="px-4 py-3">Acciones</th></tr>
              </thead>
              <tbody>
                @for (company of companies(); track company.id) {
                  <tr class="border-t border-slate-100">
                    <td class="px-4 py-3">{{ company.name }}</td>
                    <td class="px-4 py-3 text-slate-600">{{ company.description || '-' }}</td>
                    <td class="px-4 py-3">
                      <button mat-icon-button (click)="openEdit(company)"><mat-icon>edit</mat-icon></button>
                      <button mat-icon-button color="warn" (click)="remove(company)"><mat-icon>delete</mat-icon></button>
                    </td>
                  </tr>
                } @empty {
                  <tr><td colspan="3" class="px-4 py-10 text-center text-slate-400">No hay empresas</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (showForm()) {
        <div class="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/40 px-4" (click)="showForm.set(false)">
          <mat-card class="w-full max-w-lg rounded-3xl p-6 shadow-2xl" (click)="$event.stopPropagation()">
            <h3 class="mb-4 text-xl font-semibold text-slate-900">{{ editId() ? 'Editar' : 'Nueva' }} empresa</h3>
            <mat-form-field appearance="outline" class="w-full"><mat-label>Nombre</mat-label><input matInput [(ngModel)]="form.name"></mat-form-field>
            <mat-form-field appearance="outline" class="w-full"><mat-label>Descripcion</mat-label><textarea matInput rows="3" [(ngModel)]="form.description"></textarea></mat-form-field>
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
export class CompanyListComponent implements OnInit {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  companies = signal<Company[]>([]);
  loading = signal(true);
  showForm = signal(false);
  editId = signal<string | null>(null);
  form = { name: '', description: '' };

  ngOnInit() { this.load(); }
  load() { this.api.get<Company[]>('/companies').subscribe({ next: v => { this.companies.set(v); this.loading.set(false); }, error: () => this.loading.set(false) }); }
  openCreate() { this.editId.set(null); this.form = { name: '', description: '' }; this.showForm.set(true); }
  openEdit(company: Company) { this.editId.set(company.id); this.form = { name: company.name, description: company.description || '' }; this.showForm.set(true); }
  save() {
    const req = this.editId() ? this.api.patch(`/companies/${this.editId()}`, this.form) : this.api.post('/companies', this.form);
    req.subscribe({ next: () => { this.showForm.set(false); this.load(); this.snack.open('Guardado', '', { duration: 2000 }); }, error: (e) => this.snack.open(e.error?.message || 'Error', '', { duration: 3000 }) });
  }
  remove(company: Company) {
    if (!confirm(`Eliminar "${company.name}"?`)) return;
    this.api.delete(`/companies/${company.id}`).subscribe({ next: () => { this.load(); this.snack.open('Eliminada', '', { duration: 2000 }); }, error: () => this.snack.open('Error al eliminar', '', { duration: 3000 }) });
  }
}
