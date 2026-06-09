import { CommonModule } from '@angular/common';
import { Component, OnInit, inject, signal } from '@angular/core';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Router, RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api.service';
import { FormsModule } from '@angular/forms';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

interface DocumentAuditEntry {
  id: string;
  workflowName?: string;
  fieldName?: string;
  fileName?: string;
  storedName?: string;
  action: string;
  userName?: string;
  userEmail?: string;
  departmentName?: string;
  comment?: string;
  textBefore?: string;
  textAfter?: string;
  createdAt: string;
}

@Component({
  selector: 'app-document-audit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatCardModule, MatFormFieldModule,
            MatIconModule, MatInputModule, MatProgressSpinnerModule],
  template: `
    <div class="mx-auto max-w-[1400px] p-6">

      <!-- Header -->
      <div class="mb-6">
        <h2 class="m-0 text-2xl font-bold text-slate-800">Auditoría documental</h2>
        <p class="mt-1 text-[13px] text-slate-500">
          Historial de quién leyó o editó cada documento, y qué cambió en cada edición.
        </p>
      </div>


      @if (loading()) {
        <div class="flex justify-center p-10"><mat-spinner /></div>
      } @else {
        <mat-card class="overflow-hidden rounded-[18px] !p-0">
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-4 py-3">Fecha y hora</th>
                  <th class="px-4 py-3">Acción</th>
                  <th class="px-4 py-3">Documento</th>
                  <th class="px-4 py-3">Workflow</th>
                  <th class="px-4 py-3">Usuario</th>
                  <th class="px-4 py-3">Departamento</th>
                  <th class="px-4 py-3">Cambios</th>
                </tr>
              </thead>
              <tbody>
                @for (item of entries(); track item.id) {
                  <tr class="border-t border-slate-100 hover:bg-slate-50 transition-colors">

                    <!-- Fecha -->
                    <td class="whitespace-nowrap px-4 py-3 text-slate-500">
                      {{ item.createdAt | date:'dd/MM/yyyy' }}<br>
                      <span class="text-xs text-slate-400">{{ item.createdAt | date:'HH:mm:ss' }}</span>
                    </td>

                    <!-- Acción -->
                    <td class="px-4 py-3">
                      <span class="flex w-fit items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                            [ngClass]="actionCls()">
                        <mat-icon class="!h-3.5 !w-3.5 !text-[14px]">{{ actionIcon() }}</mat-icon>
                        {{ actionLabel(item.action) }}
                      </span>
                    </td>

                    <!-- Documento -->
                    <td class="max-w-[200px] px-4 py-3">
                      <div class="truncate font-medium text-slate-800" [title]="item.fileName || ''">
                        {{ (item.fileName || '-').replace('.docx.docx', '.docx') }}
                      </div>
                      @if (item.fieldName && item.fieldName !== 'collab') {
                        <div class="truncate text-xs text-slate-400">Campo: {{ item.fieldName }}</div>
                      }
                    </td>

                    <!-- Workflow -->
                    <td class="px-4 py-3 text-slate-500">{{ item.workflowName || '-' }}</td>


                    <!-- Usuario -->
                    <td class="px-4 py-3">
                      <div class="font-medium text-slate-800">{{ item.userName || '-' }}</div>
                    </td>

                    <!-- Departamento -->
                    <td class="px-4 py-3 text-slate-500">{{ item.departmentName || '-' }}</td>

                    <!-- Cambios -->
                    <td class="px-4 py-3">
                      @if (item.action === 'COLLAB_EDITED') {
                        <button
                          class="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition disabled:opacity-40"
                          [disabled]="loadingDiff() === item.id"
                          (click)="viewDiff(item)">
                          @if (loadingDiff() === item.id) {
                            <mat-spinner [diameter]="12" />
                          } @else {
                            <mat-icon class="!h-3.5 !w-3.5 !text-[14px]">open_in_new</mat-icon>
                          }
                          Ver cambios
                        </button>
                      } @else {
                        <span class="text-slate-300">—</span>
                      }
                    </td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="8" class="px-4 py-12 text-center text-slate-400">
                      <mat-icon class="mb-2 !text-4xl text-slate-300">manage_search</mat-icon>
                      <p class="mt-1">No hay eventos documentales registrados.</p>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

        </mat-card>
      }
    </div>
  `
})
export class DocumentAuditComponent implements OnInit {
  private api    = inject(ApiService);
  private router = inject(Router);

  loading     = signal(true);
  entries     = signal<DocumentAuditEntry[]>([]);
  loadingDiff = signal<string | null>(null);

  ngOnInit() {
    this.api.get<DocumentAuditEntry[]>('/document-audit').subscribe({
      next: entries => { this.entries.set(entries); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  actionLabel(action: string): string {
    const map: Record<string, string> = {
      CREATED:      'Creado',
      READ:         'Abierto',
      UPDATED:      'Editado',
      DELETED:      'Eliminado',
      COLLAB_OPENED:'Abierto',
      COLLAB_EDITED:'Editado',
    };
    return map[action] ?? action;
  }

  actionIcon(): string { return 'info'; }

  actionCls(): string { return 'bg-slate-100 text-slate-700'; }

  viewDiff(item: DocumentAuditEntry) {
    if (this.loadingDiff() === item.id) return;
    this.loadingDiff.set(item.id);
    this.api.get<DocumentAuditEntry>(`/document-audit/${item.id}`).subscribe({
      next: detail => {
        this.loadingDiff.set(null);
        this.router.navigate(['/document-audit/diff'], { state: { entry: detail } });
      },
      error: () => this.loadingDiff.set(null),
    });
  }
}
