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

type AuditAction = 'READ' | 'CREATED' | 'UPDATED' | 'DELETED' | 'COLLAB_OPENED' | 'COLLAB_EDITED';

interface DocumentAuditEntry {
  id: string;
  workflowName?: string;
  fieldName?: string;
  fileName?: string;
  storedName?: string;
  action: AuditAction;
  userName?: string;
  userEmail?: string;
  departmentName?: string;
  comment?: string;
  textBefore?: string;
  textAfter?: string;
  createdAt: string;
}

const ACTION_META: Record<AuditAction, { label: string; icon: string; cls: string }> = {
  READ:          { label: 'Leído',      icon: 'visibility', cls: 'bg-sky-100 text-sky-700' },
  CREATED:       { label: 'Leído',      icon: 'visibility', cls: 'bg-sky-100 text-sky-700' },
  UPDATED:       { label: 'Reemplazado', icon: 'swap_horiz', cls: 'bg-amber-100 text-amber-700' },
  DELETED:       { label: 'Eliminado',  icon: 'delete',     cls: 'bg-rose-100 text-rose-700' },
  COLLAB_OPENED: { label: 'Leído',      icon: 'visibility', cls: 'bg-sky-100 text-sky-700' },
  COLLAB_EDITED: { label: 'Editado',    icon: 'edit_note',  cls: 'bg-indigo-100 text-indigo-700' },
};

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
                            [ngClass]="meta(item.action).cls">
                        <mat-icon class="!h-3.5 !w-3.5 !text-[14px]">{{ meta(item.action).icon }}</mat-icon>
                        {{ meta(item.action).label }}
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
                      <div class="text-xs text-slate-400">{{ item.userEmail || '' }}</div>
                    </td>

                    <!-- Departamento -->
                    <td class="px-4 py-3 text-slate-500">{{ item.departmentName || '-' }}</td>

                    <!-- Cambios -->
                    <td class="px-4 py-3">
                      @if (item.action === 'COLLAB_EDITED' && (item.textBefore || item.textAfter)) {
                        <button
                          class="flex items-center gap-1 rounded-lg border border-indigo-200 bg-indigo-50 px-2 py-1 text-xs font-medium text-indigo-700 hover:bg-indigo-100 transition"
                          (click)="viewDiff(item)">
                          <mat-icon class="!h-3.5 !w-3.5 !text-[14px]">open_in_new</mat-icon>
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

  loading = signal(true);
  entries = signal<DocumentAuditEntry[]>([]);

  ngOnInit() {
    this.api.get<DocumentAuditEntry[]>('/document-audit').subscribe({
      next: entries => { this.entries.set(entries); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  meta(action: AuditAction) {
    return ACTION_META[action] ?? { label: action, icon: 'info', cls: 'bg-slate-100 text-slate-700' };
  }

  viewDiff(item: DocumentAuditEntry) {
    this.router.navigate(['/document-audit/diff'], { state: { entry: item } });
  }
}
