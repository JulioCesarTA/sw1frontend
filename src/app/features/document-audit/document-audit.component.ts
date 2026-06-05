import { CommonModule } from '@angular/common';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { RouterModule } from '@angular/router';
import { ApiService } from '../../core/services/api.service';

type AuditAction = 'READ' | 'CREATED' | 'UPDATED' | 'DELETED' | 'COLLAB_OPENED' | 'COLLAB_EDITED';

interface DocumentAuditEntry {
  id: string;
  workflowName?: string;
  tramiteId?: string;
  fieldName?: string;
  fileName?: string;
  storedName?: string;
  action: AuditAction;
  userName?: string;
  userEmail?: string;
  departmentName?: string;
  comment?: string;
  createdAt: string;
}

const ACTION_META: Record<AuditAction, { label: string; icon: string; cls: string }> = {
  READ:          { label: 'Vista',            icon: 'visibility',    cls: 'bg-sky-100 text-sky-700' },
  CREATED:       { label: 'Creado',           icon: 'add_circle',    cls: 'bg-emerald-100 text-emerald-700' },
  UPDATED:       { label: 'Reemplazado',      icon: 'edit',          cls: 'bg-amber-100 text-amber-700' },
  DELETED:       { label: 'Eliminado',        icon: 'delete',        cls: 'bg-rose-100 text-rose-700' },
  COLLAB_OPENED: { label: 'Editor abierto',   icon: 'group',         cls: 'bg-violet-100 text-violet-700' },
  COLLAB_EDITED: { label: 'Edición collab',   icon: 'draw',          cls: 'bg-indigo-100 text-indigo-700' },
};

@Component({
  selector: 'app-document-audit',
  standalone: true,
  imports: [CommonModule, FormsModule, RouterModule, MatCardModule, MatFormFieldModule,
            MatIconModule, MatInputModule, MatProgressSpinnerModule, MatSelectModule],
  template: `
    <div class="mx-auto max-w-[1400px] p-6">

      <!-- Header -->
      <div class="mb-6">
        <h2 class="m-0 text-2xl font-bold text-slate-800">Auditoría documental</h2>
        <p class="mt-1 text-[13px] text-slate-500">
          Historial completo de quién vio, creó, editó o abrió en colaborativo cada documento.
        </p>
      </div>

      <!-- Filtros -->
      <div class="mb-4 flex flex-wrap gap-3">
        <mat-form-field appearance="outline" class="w-72">
          <mat-label>Buscar documento, usuario o workflow</mat-label>
          <mat-icon matPrefix class="mr-1 text-slate-400">search</mat-icon>
          <input matInput [ngModel]="query()" (ngModelChange)="query.set($event)"
                 placeholder="ej. contrato.pdf o julio@empresa.com">
        </mat-form-field>

        <mat-form-field appearance="outline" class="w-52">
          <mat-label>Filtrar por acción</mat-label>
          <mat-select [ngModel]="actionFilter()" (ngModelChange)="actionFilter.set($event)">
            <mat-option value="">Todas las acciones</mat-option>
            @for (a of allActions; track a.value) {
              <mat-option [value]="a.value">{{ a.label }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <!-- Resumen de conteo por acción -->
        <div class="flex flex-wrap items-center gap-2 ml-auto">
          @for (a of allActions; track a.value) {
            <button (click)="actionFilter.set(actionFilter() === a.value ? '' : a.value)"
                    class="flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold transition hover:opacity-80"
                    [ngClass]="a.cls + (actionFilter() === a.value ? ' ring-2 ring-offset-1' : '')">
              <mat-icon class="!h-3.5 !w-3.5 !text-[14px]">{{ a.icon }}</mat-icon>
              {{ a.label }} ({{ countByAction(a.value) }})
            </button>
          }
        </div>
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
                  <th class="px-4 py-3">Trámite</th>
                  <th class="px-4 py-3">Usuario</th>
                  <th class="px-4 py-3">Departamento</th>
                </tr>
              </thead>
              <tbody>
                @for (item of filteredEntries(); track item.id) {
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
                        {{ item.fileName || '-' }}
                      </div>
                      @if (item.fieldName && item.fieldName !== 'collab') {
                        <div class="truncate text-xs text-slate-400">Campo: {{ item.fieldName }}</div>
                      }
                    </td>

                    <!-- Workflow -->
                    <td class="px-4 py-3 text-slate-500">{{ item.workflowName || '-' }}</td>

                    <!-- Trámite -->
                    <td class="px-4 py-3">
                      @if (item.tramiteId) {
                        <a [routerLink]="['/actividades']" [queryParams]="{ tramiteId: item.tramiteId }"
                           class="font-mono text-xs text-indigo-600 hover:underline" [title]="item.tramiteId">
                          {{ item.tramiteId | slice:0:8 }}…
                        </a>
                      } @else { <span class="text-slate-400">-</span> }
                    </td>

                    <!-- Usuario -->
                    <td class="px-4 py-3">
                      <div class="font-medium text-slate-800">{{ item.userName || '-' }}</div>
                      <div class="text-xs text-slate-400">{{ item.userEmail || '' }}</div>
                    </td>

                    <!-- Departamento -->
                    <td class="px-4 py-3 text-slate-500">{{ item.departmentName || '-' }}</td>
                  </tr>
                } @empty {
                  <tr>
                    <td colspan="7" class="px-4 py-12 text-center text-slate-400">
                      <mat-icon class="mb-2 !text-4xl text-slate-300">manage_search</mat-icon>
                      <p class="mt-1">No hay eventos documentales registrados.</p>
                    </td>
                  </tr>
                }
              </tbody>
            </table>
          </div>

          <!-- Footer con total -->
          <div class="border-t border-slate-100 px-4 py-2 text-right text-xs text-slate-400">
            {{ filteredEntries().length }} evento(s) mostrado(s) de {{ entries().length }} total
          </div>
        </mat-card>
      }
    </div>
  `
})
export class DocumentAuditComponent implements OnInit {
  private api = inject(ApiService);

  loading = signal(true);
  query = signal('');
  actionFilter = signal('');
  entries = signal<DocumentAuditEntry[]>([]);

  allActions = Object.entries(ACTION_META).map(([value, m]) => ({
    value: value as AuditAction, label: m.label, icon: m.icon, cls: m.cls,
  }));

  filteredEntries = computed(() => {
    const term  = this.query().trim().toLowerCase();
    const act   = this.actionFilter();
    return this.entries().filter(item => {
      if (act && item.action !== act) return false;
      if (!term) return true;
      return [item.fileName, item.fieldName, item.workflowName, item.userName, item.userEmail, item.departmentName, item.tramiteId]
        .some(v => String(v ?? '').toLowerCase().includes(term));
    });
  });

  ngOnInit() {
    this.api.get<DocumentAuditEntry[]>('/document-audit').subscribe({
      next: entries => { this.entries.set(entries); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  meta(action: AuditAction) {
    return ACTION_META[action] ?? { label: action, icon: 'info', cls: 'bg-slate-100 text-slate-700' };
  }

  countByAction(action: string) {
    return this.entries().filter(e => e.action === action).length;
  }
}
