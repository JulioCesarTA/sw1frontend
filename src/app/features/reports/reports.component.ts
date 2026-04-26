import { CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit, computed, inject, signal } from '@angular/core';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/services/api.service';
import { ReportsRealtimeService } from '../../core/services/reports-realtime.service';

interface RolePerformance { departmentName: string; jobRoleName: string; finishedEarly: number; finishedLate: number; averageDurationHours: number; averageSlaHours: number; }
interface DepartmentFlow { departmentName: string; total: number; }
interface DashboardStats { totalProcedures: number; byStatus: Record<string, number>; rolePerformance: RolePerformance[]; departmentFlow: DepartmentFlow[]; }

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, MatProgressSpinnerModule],
  template: `
    <div class="mx-auto max-w-7xl p-6">
      <div class="mb-6 flex items-center justify-between gap-4">
        <div>
          <h2 class="text-3xl font-bold text-slate-900">Reportes</h2>
          <p class="text-sm text-slate-500">Resumen general del sistema.</p>
        </div>
        <div class="rounded-full border px-3 py-1 text-sm" [class.border-emerald-200]="realtimeConnected()" [class.bg-emerald-50]="realtimeConnected()" [class.text-emerald-700]="realtimeConnected()" [class.border-slate-200]="!realtimeConnected()" [class.bg-slate-100]="!realtimeConnected()" [class.text-slate-600]="!realtimeConnected()">
          {{ realtimeConnected() ? 'Tiempo real activo' : 'Tiempo real desconectado' }}
        </div>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16"><mat-spinner /></div>
      } @else {
        <div class="mb-6">
          <div class="rounded-2xl border border-slate-200 bg-white p-5"><div class="text-sm text-slate-500">Total tramites</div>
          <div class="mt-2 text-4xl font-bold text-slate-900">{{ stats()?.totalProcedures ?? 0 }}</div></div>
        </div>

        <div class="grid gap-6 xl:grid-cols-2">
          <section class="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 class="mb-4 text-lg font-semibold text-slate-900">Tramites por estado</h3>
            <div class="space-y-3">
              @for (item of statusEntries(); track item.key) {
                <div class="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <span class="font-medium text-slate-700">{{ item.key }}</span>
                  <span class="font-bold text-slate-900">{{ item.value }}</span>
                </div>
              } @empty {
                <div class="text-sm text-slate-400">Sin datos</div>
              }
            </div>
          </section>

          <section class="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 class="mb-4 text-lg font-semibold text-slate-900">Departamentos con mayor flujo</h3>
            <div class="space-y-3">
              @for (item of topDepartments(); track item.departmentName) {
                <div class="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <span class="font-medium text-slate-700">{{ item.departmentName }}</span>
                  <span class="font-bold text-indigo-600">{{ item.total }}</span>
                </div>
              } @empty {
                <div class="text-sm text-slate-400">Sin datos</div>
              }
            </div>
          </section>

          <section class="rounded-2xl border border-slate-200 bg-white p-5 xl:col-span-2">
            <h3 class="mb-4 text-lg font-semibold text-slate-900">Antes del SLA</h3>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="border-b border-slate-200 text-left text-slate-500">
                  <tr><th class="py-2">Departamento</th><th class="py-2">Rol</th><th class="py-2">Cantidad</th>
                  <th class="py-2">Promedio</th><th class="py-2">SLA</th></tr>
                </thead>
                <tbody>
                  @for (item of tempranoRoles(); track item.departmentName + item.jobRoleName) {
                    <tr class="border-b border-slate-100"><td class="py-2">{{ item.departmentName }}</td>
                    <td class="py-2">{{ item.jobRoleName }}</td><td class="py-2 text-emerald-600">{{ item.finishedEarly }}</td>
                    <td class="py-2">{{ item.averageDurationHours }}</td><td class="py-2">{{ item.averageSlaHours }}</td></tr>
                  } @empty {
                    <tr><td colspan="5" class="py-4 text-center text-slate-400">Sin datos</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </section>

          <section class="rounded-2xl border border-slate-200 bg-white p-5 xl:col-span-2">
            <h3 class="mb-4 text-lg font-semibold text-slate-900">Despues del SLA</h3>
            <div class="overflow-x-auto">
              <table class="w-full text-sm">
                <thead class="border-b border-slate-200 text-left text-slate-500">
                  <tr><th class="py-2">Departamento</th><th class="py-2">Rol</th><th class="py-2">Cantidad</th>\
                  <th class="py-2">Promedio</th><th class="py-2">SLA</th></tr>
                </thead>
                <tbody>
                  @for (item of tardeRoles(); track item.departmentName + item.jobRoleName) {
                    <tr class="border-b border-slate-100"><td class="py-2">{{ item.departmentName }}</td>
                    <td class="py-2">{{ item.jobRoleName }}</td><td class="py-2 text-rose-600">{{ item.finishedLate }}</td>
                    <td class="py-2">{{ item.averageDurationHours }}</td><td class="py-2">{{ item.averageSlaHours }}</td></tr>
                  } @empty {
                    <tr><td colspan="5" class="py-4 text-center text-slate-400">Sin datos</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </section>
        </div>
      }
    </div>
  `
})
export class ReportsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private realtime = inject(ReportsRealtimeService);
  stats = signal<DashboardStats | null>(null);
  loading = signal(true);
  realtimeConnected = signal(false);
  statusEntries = computed(() => Object.entries(this.stats()?.byStatus ?? {}).map(([key, value]) => ({ key, value })));
  topDepartments = computed(() => (this.stats()?.departmentFlow ?? []).slice(0, 8));
  tempranoRoles = computed(() => (this.stats()?.rolePerformance ?? []).filter(item => item.finishedEarly > 0).sort((a, b) => b.finishedEarly - a.finishedEarly).slice(0, 8));
  tardeRoles = computed(() => (this.stats()?.rolePerformance ?? []).filter(item => item.finishedLate > 0).sort((a, b) => b.finishedLate - a.finishedLate).slice(0, 8));

  ngOnInit() {
    this.api.get<DashboardStats>('/reports/dashboard').subscribe({ next: stats => { this.stats.set(stats); 
      this.loading.set(false); }, error: () => this.loading.set(false) });
    this.realtime.connect({ onConnected: () => this.realtimeConnected.set(true), 
      onDisconnected: () => this.realtimeConnected.set(false), onDashboard: stats => { this.stats.set(stats); 
        this.loading.set(false); this.realtimeConnected.set(true); } });
  }

  ngOnDestroy() { this.realtime.disconnect(); }
}
