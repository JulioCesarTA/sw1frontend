import { Component, computed, inject, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/services/api.service';

interface HistoryEntry { id: string; action: string; fromNodoId?: string; toNodoId?: string; comment?: string; changedAt: string; nodoName?: string; departmentName?: string; jobRoleName?: string; isCurrent?: boolean }
interface TramiteDetail { id: string; code: string; title: string; description?: string; status: string; workflowId: string; currentNodoId: string; history: HistoryEntry[] }

const H_COLOR: Record<string, string> = {
  CREADO: 'blue', RECHAZADO: 'rose', DECISION_RECHAZADA: 'orange',
  LOOP_RECHAZADO: 'orange', LOOP_APROBADO: 'sky', LOOP_EVALUADO: 'sky'
};
const H_LABELS: Record<string, string> = {
  AVANZADO: 'Avanzado',
  CREADO: 'Creado', UNION_COMPLETADA: 'Union completada', DECISION_RECHAZADA: 'Rechazado',
  LOOP_RECHAZADO: 'Rechazado', LOOP_APROBADO: 'Iteracion aprobada', RECHAZADO: 'Rechazado',
  BIFURCACION: 'Bifurcacion'
};
const H_ICONS: Record<string, string> = {
  CREADO: 'add_circle', RECHAZADO: 'cancel', DECISION_RECHAZADA: 'undo',
  UNION_COMPLETADA: 'merge_type', LOOP_RECHAZADO: 'repeat', LOOP_APROBADO: 'repeat',
  BIFURCACION: 'call_split'
};

@Component({
  selector: 'app-tramite-detail',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatCardModule, MatProgressSpinnerModule],
  template: `
    <div class="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-6 py-6">
      <div class="flex items-center gap-3">
        <button mat-icon-button (click)="router.navigate(['/tramites'])"><mat-icon>arrow_back</mat-icon></button>
        <div>
          <h2 class="text-2xl font-bold text-slate-900">{{ tramite()?.title }}</h2>
          <code class="rounded bg-slate-100 px-2 py-1 text-xs">{{ tramite()?.code }}</code>
        </div>
        <span class="ml-auto rounded-full px-3 py-1 text-xs font-semibold" [ngClass]="statusClass(tramite()?.status || '')">{{ tramite()?.status }}</span>
      </div>

      @if (loading()) { <div class="flex justify-center py-16"><mat-spinner /></div> }
      @else if (tramite()) {
        <div class="grid gap-4 xl:grid-cols-2">
          <mat-card class="rounded-3xl p-5 shadow-sm">
            <h3 class="mb-3 text-base font-semibold text-slate-900">Informacion</h3>
            <p class="mb-2 text-sm text-slate-600"><strong class="text-slate-900">Descripcion:</strong> {{ tramite()!.description || 'Sin Descripcion' }}</p>
            <p class="text-sm text-slate-600"><strong class="text-slate-900">Estado:</strong> <span class="ml-1 rounded-full px-3 py-1 text-xs font-semibold" [ngClass]="statusClass(tramite()!.status)">{{ tramite()!.status }}</span></p>
          </mat-card>

          <mat-card class="rounded-3xl p-5 shadow-sm">
            <h3 class="mb-3 text-base font-semibold text-slate-900">Seguimiento</h3>
            <p class="mb-2 text-sm text-slate-600"><strong class="text-slate-900">Etapa actual:</strong> {{ currentNodoName() || 'Sin etapa activa' }}</p>
            <p class="text-sm text-slate-600"><strong class="text-slate-900">Workflow:</strong> {{ tramite()!.workflowId }}</p>
          </mat-card>

          <mat-card class="rounded-3xl p-5 shadow-sm xl:col-span-2">
            <h3 class="mb-3 text-base font-semibold text-slate-900">Historial</h3>
            <div class="relative pl-5">
              <div class="absolute bottom-4 left-[15px] top-4 w-[2px] bg-slate-200"></div>
              @for (h of tramite()!.history; track h.id) {
                <div class="relative flex gap-3 py-3">
                  <div class="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" [ngClass]="hDotClass(h)">
                    <mat-icon class="!h-[18px] !w-[18px] !text-[18px]">{{ H_ICONS[h.action] || 'arrow_forward' }}</mat-icon>
                  </div>
                  <div class="flex-1 pt-0.5">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-sm font-semibold" [ngClass]="hLabelClass(h)">{{ H_LABELS[h.action] || h.action }}</span>
                      @if (h.isCurrent) { <span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">EN CURSO</span> }
                    </div>
                    @if (h.nodoName) { <p class="mt-0.5 text-xs font-medium text-slate-700">{{ h.nodoName }}</p> }
                    @if (h.departmentName || h.jobRoleName) {
                      <p class="text-xs text-slate-500">{{ h.departmentName }}@if(h.departmentName && h.jobRoleName){<span class="mx-1 text-slate-300">·</span>}{{ h.jobRoleName }}</p>
                    }
                    @if (h.comment) { <p class="mt-0.5 text-xs italic text-slate-500">{{ h.comment }}</p> }
                    <p class="mt-1 text-xs text-slate-400">{{ h.changedAt | date:'dd/MM/yyyy HH:mm' }}</p>
                  </div>
                </div>
              }
              @if (tramite()!.status === 'COMPLETADO') {
                <div class="relative flex gap-3 py-3">
                  <div class="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700"><mat-icon class="!h-[18px] !w-[18px] !text-[18px]">flag</mat-icon></div>
                  <div class="flex-1 pt-0.5"><span class="text-sm font-semibold text-blue-700">FIN</span><p class="text-xs text-slate-500">Trámite completado</p></div>
                </div>
              }
            </div>
          </mat-card>
        </div>
      }
    </div>
  `
})
export class TramiteDetailComponent implements OnInit {
  @Input() id!: string;
  protected readonly H_ICONS = H_ICONS;
  protected readonly H_LABELS = H_LABELS;

  private api = inject(ApiService);
  readonly router = inject(Router);

  tramite = signal<TramiteDetail | null>(null);
  loading = signal(true);
  currentNodoName = computed(() => this.tramite()?.history.find(item => item.isCurrent)?.nodoName || '');

  ngOnInit() { this.load(); }

  load() {
    this.api.get<TramiteDetail>(`/tramites/${this.id}`).subscribe({
      next: p => { this.tramite.set(p); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
  }

  statusClass(status: string) {
    return ({ PENDIENTE: 'bg-amber-100 text-amber-800', EN_PROGRESO: 'bg-blue-100 text-blue-800',
      COMPLETADO: 'bg-emerald-100 text-emerald-800', RECHAZADO: 'bg-rose-100 text-rose-800'
    } as Record<string, string>)[status] ?? 'bg-slate-100 text-slate-700';
  }

  private hColor(h: HistoryEntry) { return h.isCurrent ? 'amber' : (H_COLOR[h.action] ?? 'emerald'); }
  hDotClass(h: HistoryEntry) { const c = this.hColor(h); return `bg-${c}-100 text-${c}-700`; }
  hLabelClass(h: HistoryEntry) { return `text-${this.hColor(h)}-700`; }
}
