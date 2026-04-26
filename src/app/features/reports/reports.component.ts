import { Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { forkJoin } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { ReportsRealtimeService } from '../../core/services/reports-realtime.service';

interface RolePerformance {
  departmentName: string;
  jobRoleName: string;
  finishedEarly: number;
  finishedLate: number;
  totalCompleted: number;
  averageDurationHours: number;
  averageSlaHours: number;
}

interface DepartmentFlow {
  departmentName: string;
  total: number;
}

interface DashboardStats {
  totalProcedures: number;
  totalWorkflows: number;
  totalUsers: number;
  byStatus: Record<string, number>;
  byWorkflow: Record<string, number>;
  rolePerformance: RolePerformance[];
  departmentFlow: DepartmentFlow[];
}

interface WorkflowReport {
  workflowId: string;
  workflowName: string;
  total: number;
}

interface WorkflowListItem {
  id: string;
  name: string;
  _count?: {
    procedures?: number;
    stages?: number;
  };
}

interface UserListItem {
  id: string;
}

interface ProcedureListItem {
  id: string;
  workflowId?: string | null;
  status?: string | null;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, MatCardModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  template: `
    <div class="mx-auto flex w-full max-w-[1440px] flex-col gap-6 px-6 py-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 class="text-3xl font-bold text-slate-900">Reportes</h2>
        </div>
        <div class="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
          <span class="h-2 w-2 rounded-full bg-emerald-500"></span>
          {{ realtimeConnected() ? 'Tiempo real activo' : 'Tiempo real desconectado' }}
        </div>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16"><mat-spinner /></div>
      } @else {
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <mat-card class="rounded-3xl p-5 shadow-sm">
            <p class="text-sm text-slate-500">Total tramites</p>
            <p class="mt-2 text-4xl font-bold text-slate-900">{{ stats()?.totalProcedures ?? 0 }}</p>
          </mat-card>
          <mat-card class="rounded-3xl p-5 shadow-sm">
            <p class="text-sm text-slate-500">Workflows</p>
            <p class="mt-2 text-4xl font-bold text-slate-900">{{ stats()?.totalWorkflows ?? 0 }}</p>
          </mat-card>
          <mat-card class="rounded-3xl p-5 shadow-sm">
            <p class="text-sm text-slate-500">Usuarios</p>
            <p class="mt-2 text-4xl font-bold text-slate-900">{{ stats()?.totalUsers ?? 0 }}</p>
          </mat-card>
          <mat-card class="rounded-3xl p-5 shadow-sm">
            <p class="text-sm text-slate-500">Roles fuera de SLA</p>
            <p class="mt-2 text-4xl font-bold text-rose-600">{{ lateTotal() }}</p>
          </mat-card>
        </div>

        <div class="grid gap-4 xl:grid-cols-2">
          <mat-card class="rounded-3xl p-5 shadow-sm">
            <h3 class="mb-4 text-lg font-semibold text-slate-900">Tramites por estado</h3>
            @for (entry of statusEntries(); track entry.key) {
              <div class="mb-3 flex items-center gap-3">
                <span class="rounded-full px-3 py-1 text-xs font-semibold" [ngClass]="statusBadgeClass(entry.key)">{{ entry.key }}</span>
                <div class="h-2 flex-1 overflow-hidden rounded-full bg-slate-100">
                  <div class="h-full rounded-full transition-all duration-500" [ngClass]="statusBarClass(entry.key)"
                    [style.width.%]="(entry.value / (stats()?.totalProcedures || 1)) * 100">
                  </div>
                </div>
                <span class="w-10 text-right text-sm font-semibold text-slate-900">{{ entry.value }}</span>
              </div>
            }
          </mat-card>

          <mat-card class="rounded-3xl p-5 shadow-sm">
            <h3 class="mb-4 text-lg font-semibold text-slate-900">Departamentos con mayor flujo</h3>
            @for (item of departmentFlowTop(); track item.departmentName) {
              <div class="mb-3 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
                <div>
                  <p class="font-semibold text-slate-900">{{ item.departmentName }}</p>
                  <p class="text-xs text-slate-500">Pasos de tramites registrados</p>
                </div>
                <span class="text-lg font-bold text-indigo-600">{{ item.total }}</span>
              </div>
            } @empty {
              <div class="py-6 text-center text-sm text-slate-400">Sin datos de flujo por departamento.</div>
            }
          </mat-card>

          <mat-card class="rounded-3xl p-5 shadow-sm xl:col-span-2">
            <h3 class="mb-4 text-lg font-semibold text-slate-900">Roles que terminan antes del SLA</h3>
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th class="px-4 py-3">Departamento</th>
                    <th class="px-4 py-3">Rol</th>
                    <th class="px-4 py-3">Antes de tiempo</th>
                    <th class="px-4 py-3">Promedio</th>
                    <th class="px-4 py-3">SLA promedio</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of earlyRoles(); track item.departmentName + '-' + item.jobRoleName) {
                    <tr class="border-t border-slate-100">
                      <td class="px-4 py-3">{{ item.departmentName }}</td>
                      <td class="px-4 py-3">{{ item.jobRoleName }}</td>
                      <td class="px-4 py-3 font-semibold text-emerald-600">{{ item.finishedEarly }}</td>
                      <td class="px-4 py-3">{{ item.averageDurationHours }} h</td>
                      <td class="px-4 py-3">{{ item.averageSlaHours }} h</td>
                    </tr>
                  } @empty {
                    <tr><td colspan="5" class="px-4 py-8 text-center text-slate-400">Sin roles adelantados todavia.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </mat-card>

          <mat-card class="rounded-3xl p-5 shadow-sm xl:col-span-2">
            <h3 class="mb-4 text-lg font-semibold text-slate-900">Roles que terminan despues del SLA</h3>
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th class="px-4 py-3">Departamento</th>
                    <th class="px-4 py-3">Rol</th>
                    <th class="px-4 py-3">Fuera de tiempo</th>
                    <th class="px-4 py-3">Promedio</th>
                    <th class="px-4 py-3">SLA promedio</th>
                  </tr>
                </thead>
                <tbody>
                  @for (item of lateRoles(); track item.departmentName + '-' + item.jobRoleName) {
                    <tr class="border-t border-slate-100">
                      <td class="px-4 py-3">{{ item.departmentName }}</td>
                      <td class="px-4 py-3">{{ item.jobRoleName }}</td>
                      <td class="px-4 py-3 font-semibold text-rose-600">{{ item.finishedLate }}</td>
                      <td class="px-4 py-3">{{ item.averageDurationHours }} h</td>
                      <td class="px-4 py-3">{{ item.averageSlaHours }} h</td>
                    </tr>
                  } @empty {
                    <tr><td colspan="5" class="px-4 py-8 text-center text-slate-400">Sin retrasos registrados todavia.</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </mat-card>

          <mat-card class="rounded-3xl p-5 shadow-sm xl:col-span-2">
            <h3 class="mb-4 text-lg font-semibold text-slate-900">Tramites por workflow</h3>
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr><th class="px-4 py-3">Workflow</th><th class="px-4 py-3">Total</th><th class="px-4 py-3">% del total</th></tr>
                </thead>
                <tbody>
                  @for (r of byWorkflow(); track r.workflowId) {
                    <tr class="border-t border-slate-100">
                      <td class="px-4 py-3">{{ r.workflowName }}</td>
                      <td class="px-4 py-3">{{ r.total }}</td>
                      <td class="px-4 py-3">{{ ((r.total / (stats()?.totalProcedures || 1)) * 100).toFixed(1) }}%</td>
                    </tr>
                  }
                  @empty {
                    <tr><td colspan="3" class="px-4 py-8 text-center text-slate-400">Sin datos</td></tr>
                  }
                </tbody>
              </table>
            </div>
          </mat-card>
        </div>
      }
    </div>
  `
})
export class ReportsComponent implements OnInit, OnDestroy {
  private api = inject(ApiService);
  private realtime = inject(ReportsRealtimeService);

  stats = signal<DashboardStats | null>(null);
  byWorkflow = signal<WorkflowReport[]>([]);
  loading = signal(true);
  realtimeConnected = signal(false);

  statusEntries() {
    const s = this.stats();
    if (!s) return [];
    return Object.entries(s.byStatus).map(([key, value]) => ({ key, value }));
  }

  earlyRoles() {
    return (this.stats()?.rolePerformance ?? [])
      .filter(item => item.finishedEarly > 0)
      .sort((a, b) => b.finishedEarly - a.finishedEarly)
      .slice(0, 8);
  }

  lateRoles() {
    return (this.stats()?.rolePerformance ?? [])
      .filter(item => item.finishedLate > 0)
      .sort((a, b) => b.finishedLate - a.finishedLate)
      .slice(0, 8);
  }

  departmentFlowTop() {
    return (this.stats()?.departmentFlow ?? []).slice(0, 8);
  }

  lateTotal() {
    return (this.stats()?.rolePerformance ?? []).reduce((sum, item) => sum + item.finishedLate, 0);
  }

  statusBadgeClass(status: string) {
    const classes: Record<string, string> = {
      PENDING: 'bg-amber-100 text-amber-800',
      IN_PROGRESS: 'bg-blue-100 text-blue-800',
      OBSERVED: 'bg-orange-100 text-orange-800',
      APPROVED: 'bg-lime-100 text-lime-800',
      COMPLETED: 'bg-emerald-100 text-emerald-800',
      REJECTED: 'bg-rose-100 text-rose-800'
    };
    return classes[status] ?? 'bg-slate-100 text-slate-700';
  }

  statusBarClass(status: string) {
    const classes: Record<string, string> = {
      PENDING: 'bg-amber-500',
      IN_PROGRESS: 'bg-blue-500',
      OBSERVED: 'bg-orange-500',
      APPROVED: 'bg-lime-500',
      COMPLETED: 'bg-emerald-500',
      REJECTED: 'bg-rose-500'
    };
    return classes[status] ?? 'bg-slate-400';
  }

  ngOnInit() {
    this.loadReports();
    this.realtime.connect({
      onConnected: () => {
        this.realtimeConnected.set(true);
      },
      onDisconnected: () => {
        this.realtimeConnected.set(false);
      },
      onDashboard: payload => {
        this.stats.set(payload);
        this.loading.set(false);
        this.realtimeConnected.set(true);
      },
      onByWorkflow: payload => {
        this.byWorkflow.set(payload);
        this.realtimeConnected.set(true);
      }
    });
  }

  ngOnDestroy() {
    this.realtime.disconnect();
  }

  private loadReports() {
    this.api.get<DashboardStats>('/reports/dashboard').subscribe({
      next: stats => {
        this.stats.set(stats);
        this.loading.set(false);
      },
      error: () => this.loadReportsFallback()
    });

    this.api.get<WorkflowReport[]>('/reports/by-workflow').subscribe({
      next: reports => this.byWorkflow.set(reports),
      error: () => {}
    });
  }

  private loadReportsFallback() {
    forkJoin({
      workflows: this.api.get<WorkflowListItem[]>('/workflows'),
      users: this.api.get<UserListItem[]>('/users'),
      procedures: this.api.get<ProcedureListItem[]>('/procedures')
    }).subscribe({
      next: ({ workflows, users, procedures }) => {
        const byStatus = procedures.reduce<Record<string, number>>((acc, procedure) => {
          const status = (procedure.status || 'PENDING').toUpperCase();
          acc[status] = (acc[status] ?? 0) + 1;
          return acc;
        }, {
          PENDING: 0,
          IN_PROGRESS: 0,
          OBSERVED: 0,
          APPROVED: 0,
          COMPLETED: 0,
          REJECTED: 0
        });

        const byWorkflowCounts = procedures.reduce<Record<string, number>>((acc, procedure) => {
          const workflowId = procedure.workflowId || 'unknown';
          acc[workflowId] = (acc[workflowId] ?? 0) + 1;
          return acc;
        }, {});

        this.stats.set({
          totalProcedures: procedures.length,
          totalWorkflows: workflows.length,
          totalUsers: users.length,
          byStatus,
          byWorkflow: byWorkflowCounts,
          rolePerformance: [],
          departmentFlow: []
        });

        this.byWorkflow.set(
          workflows.map(workflow => ({
            workflowId: workflow.id,
            workflowName: workflow.name,
            total: workflow._count?.procedures ?? byWorkflowCounts[workflow.id] ?? 0
          }))
        );

        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
      }
    });
  }
}
