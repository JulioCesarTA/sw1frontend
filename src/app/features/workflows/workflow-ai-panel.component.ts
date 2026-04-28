import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';

type NodeType = 'inicio' | 'proceso' | 'decision' | 'bifurcasion' | 'union' | 'fin' | 'iteracion';
type FieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'FILE' | 'EMAIL';
type SidebarTab = 'inspector' | 'diagram-ai' | 'worky' | 'bottleneck';

interface ForwardConfig {
  mode?: 'selected' | 'none';
  fieldNames?: string[];
}

interface Nodo {
  id: string;
  workflowId: string;
  name: string;
  description?: string;
  order: number;
  nodeType?: string;
  responsibleDepartmentId?: string;
  responsibleDepartmentName?: string;
  responsibleJobRoleId?: string;
  requiresForm: boolean;
  avgHours: number;
  condition?: string;
  trueLabel?: string;
  falseLabel?: string;
  posX?: number;
  posY?: number;
  formDefinition?: {
    title: string;
    fields: Array<{
      id: string;
      name: string;
      type: FieldType;
      options?: string[];
      isRequired?: boolean;
      order: number;
    }>;
  };
}

interface Transition {
  id: string;
  workflowId: string;
  fromNodoId: string;
  toNodoId: string;
  name?: string;
  condition?: string;
  forwardConfig?: ForwardConfig;
}

interface Department {
  id: string;
  companyId?: string;
  name: string;
}

interface JobRole {
  id: string;
  companyId?: string;
  departmentId: string;
  name: string;
}

interface AiChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

interface DiagramAiAction {
  type: 'create_nodo' | 'update_nodo' | 'delete_nodo' | 'connect_nodo' | 'disconnect_nodo' | 'create_department' | 'create_job_role' | 'show_diagram';
  placeholderId?: string;
  nodoId?: string;
  transitionId?: string;
  fromNodoId?: string;
  toNodoId?: string;
  departmentName?: string | null;
  name?: string;
  description?: string;
  nodeType?: NodeType;
  order?: number;
  responsibleDepartmentName?: string | null;
  responsibleJobRoleName?: string | null;
  requiresForm?: boolean;
  formDefinition?: {
    title?: string;
    fields?: Array<{
      id?: string;
      name?: string;
      type?: FieldType;
      required?: boolean;
      order?: number;
    }>;
  } | null;
  trueLabel?: string;
  falseLabel?: string;
  avgHours?: number;
  posX?: number;
  posY?: number;
  forwardConfig?: ForwardConfig;
}

interface DiagramAiResult {
  interpretation?: string;
  changes?: string;
  actions: DiagramAiAction[];
}

interface WorkySuggestion {
  title: string;
  reason: string;
  actions: DiagramAiAction[];
}

interface WorkyResult {
  assistantName?: string;
  summary?: string;
  suggestions: WorkySuggestion[];
}

interface BottleneckItem {
  nodoName?: string;
  severity?: string;
  reason?: string;
  recommendation?: string;
}

interface BottleneckResult {
  summary?: string;
  bottlenecks: BottleneckItem[];
  parallelizationOpportunities: string[];
}

@Component({
  selector: 'app-workflow-ai-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    @if (activeTab === 'diagram-ai') {
      <div class="space-y-4">
        <h3 class="m-0 text-lg text-slate-950">IA del Diagrama</h3>
        <textarea
          [(ngModel)]="diagramPrompt"
          rows="6"
          class="w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
          placeholder="Ejemplo: elimina el nodo Revision, crea un proceso Aprobacion final y conectalo con Fin"></textarea>
        <div class="flex justify-end">
          <button mat-flat-button color="primary" [disabled]="diagramBusy() || !diagramPrompt.trim()" (click)="runDiagramCommand()">
            @if (diagramBusy()) {
              <mat-spinner diameter="18" />
            } @else {
              <mat-icon>auto_awesome</mat-icon>
            }
            Ejecutar
          </button>
        </div>

        @if (diagramResult()) {
          <div class="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
            <div class="text-sm font-semibold text-slate-900">{{ diagramResult()?.interpretation || 'Resultado' }}</div>
            @if (diagramResult()?.changes) {
              <div class="mt-2 text-sm text-slate-600">{{ diagramResult()?.changes }}</div>
            }
            @if (diagramResult()?.actions?.length) {
              <div class="mt-3 grid gap-2">
                @for (action of diagramResult()?.actions || []; track $index) {
                  <div class="rounded-xl bg-white px-3 py-2 text-sm text-slate-700">{{ describeAiAction(action) }}</div>
                }
              </div>
            }
          </div>
        }
      </div>
    } @else if (activeTab === 'worky') {
      <div class="space-y-4">
        <div class="flex items-center justify-between gap-3">
          <h3 class="m-0 text-lg text-slate-950">Worky</h3>
          <button mat-stroked-button [disabled]="workyLoading() || !workflowId" (click)="refreshWorkySuggestions()">
            @if (workyLoading()) {
              <mat-spinner diameter="18" />
            } @else {
              <mat-icon>refresh</mat-icon>
            }
            Actualizar
          </button>
        </div>

        @if (!workflowId) {
          <div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            Guarda el workflow antes de pedir sugerencias.
          </div>
        } @else {
          <div class="grid gap-3">
            <div class="rounded-2xl border border-slate-200 bg-white p-4">
              <div class="text-sm font-semibold text-slate-900">Hablar con Worky</div>
              <textarea
                [(ngModel)]="workyPrompt"
                rows="4"
                class="mt-3 w-full rounded-2xl border border-slate-300 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
                placeholder="Ejemplo: Worky, que ves mal en mi canvas?"></textarea>
              <div class="mt-3 flex justify-end">
                <button mat-flat-button color="primary" [disabled]="workyLoading() || !workyPrompt.trim()" (click)="sendWorkyMessage()">
                  @if (workyLoading()) {
                    <mat-spinner diameter="18" />
                  } @else {
                    <mat-icon>send</mat-icon>
                  }
                  Preguntar
                </button>
              </div>
            </div>

            @if (workyChat().length) {
              <div class="grid gap-2">
                @for (message of workyChat(); track $index) {
                  <div
                    class="rounded-2xl px-4 py-3 text-sm"
                    [class.bg-slate-100]="message.role === 'user'"
                    [class.text-slate-900]="message.role === 'user'"
                    [class.bg-emerald-50]="message.role === 'assistant'"
                    [class.text-emerald-900]="message.role === 'assistant'">
                    {{ message.content }}
                  </div>
                }
              </div>
            }

            @if (workyResult()?.summary) {
              <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {{ workyResult()?.summary }}
              </div>
            }
            @for (suggestion of workyResult()?.suggestions || []; track $index) {
              <div class="rounded-2xl border border-slate-200 bg-white p-4">
                <div class="text-sm font-semibold text-slate-900">{{ suggestion.title }}</div>
                <div class="mt-1 text-sm text-slate-600">{{ suggestion.reason }}</div>
                @if (suggestion.actions.length) {
                  <div class="mt-3 grid gap-2">
                    @for (action of suggestion.actions; track $index) {
                      <div class="rounded-xl bg-slate-50 px-3 py-2 text-sm text-slate-700">{{ describeAiAction(action) }}</div>
                    }
                  </div>
                  <div class="mt-3 flex justify-end">
                    <button mat-flat-button color="primary" [disabled]="diagramBusy()" (click)="applyWorkySuggestion(suggestion)">
                      Aplicar sugerencia
                    </button>
                  </div>
                }
              </div>
            }
            @if (!workyResult()?.suggestions?.length && !workyResult()?.summary) {
              <div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                @if (workyLoading()) {
                  Worky esta analizando el workflow...
                } @else {
                  No hay sugerencias todavia.
                }
              </div>
            }
          </div>
        }
      </div>
    } @else if (activeTab === 'bottleneck') {
      <div class="space-y-4">
        <div class="flex items-center justify-between gap-3">
          <h3 class="m-0 text-lg text-slate-950">Analisis de Cuellos</h3>
          <button mat-stroked-button [disabled]="bottleneckLoading() || !workflowId" (click)="runBottleneckAnalysis()">
            @if (bottleneckLoading()) {
              <mat-spinner diameter="18" />
            } @else {
              <mat-icon>insights</mat-icon>
            }
            Analizar
          </button>
        </div>

        @if (!workflowId) {
          <div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            Guarda el workflow antes de analizarlo.
          </div>
        } @else if (bottleneckResult()) {
          <div class="grid gap-3">
            @if (bottleneckResult()?.summary) {
              <div class="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                {{ bottleneckResult()?.summary }}
              </div>
            }
            @for (item of bottleneckResult()?.bottlenecks || []; track $index) {
              <div class="rounded-2xl border border-slate-200 bg-white p-4">
                <div class="text-sm font-semibold text-slate-900">{{ item.nodoName || 'Etapa' }}</div>
                <div class="mt-1 text-sm text-slate-600">{{ item.reason }}</div>
                @if (item.recommendation) {
                  <div class="mt-2 text-sm text-indigo-700">{{ item.recommendation }}</div>
                }
              </div>
            }
            @if (bottleneckResult()?.parallelizationOpportunities?.length) {
              <div class="rounded-2xl border border-indigo-200 bg-indigo-50 p-4">
                <div class="mb-2 text-sm font-semibold text-slate-900">Oportunidades de paralelizacion</div>
                <div class="grid gap-2">
                  @for (opportunity of bottleneckResult()?.parallelizationOpportunities || []; track $index) {
                    <div class="text-sm text-slate-700">{{ opportunity }}</div>
                  }
                </div>
              </div>
            }
          </div>
        } @else {
          <div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
            Ejecuta el analisis para ver cuellos de botella.
          </div>
        }
      </div>
    }
  `
})
export class WorkflowAiPanelComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) activeTab!: SidebarTab;
  @Input() workflowId = '';
  @Input() workflowName = '';
  @Input() nodo: Nodo[] = [];
  @Input() transitions: Transition[] = [];
  @Input() departments: Department[] = [];
  @Input() jobRoles: JobRole[] = [];
  @Input({ required: true }) applyAiActions!: (actions: DiagramAiAction[]) => Promise<void>;
  @Input() onError?: (message: string) => void;

  private api = inject(ApiService);
  private workyRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  diagramBusy = signal(false);
  diagramResult = signal<DiagramAiResult | null>(null);
  workyLoading = signal(false);
  workyResult = signal<WorkyResult | null>(null);
  workyChat = signal<AiChatMessage[]>([]);
  bottleneckLoading = signal(false);
  bottleneckResult = signal<BottleneckResult | null>(null);
  diagramPrompt = '';
  workyPrompt = '';
  private aiHistory: AiChatMessage[] = [];
  private workyHistory: AiChatMessage[] = [];

  ngOnChanges(changes: SimpleChanges) {
    if (this.activeTab === 'worky' && (changes['activeTab'] || changes['nodo'] || changes['transitions'] || changes['departments'] || changes['jobRoles'])) {
      this.queueWorkyRefresh();
    }
  }

  ngOnDestroy() {
    if (this.workyRefreshTimer) {
      clearTimeout(this.workyRefreshTimer);
    }
  }

  async runDiagramCommand() {
    const command = this.diagramPrompt.trim();
    if (!command || this.diagramBusy()) return;
    this.diagramBusy.set(true);
    try {
      const result = await firstValueFrom(this.api.post<DiagramAiResult>('/workflow-ai/diagramaporcomand', {
        ...this.aiContextPayload(),
        command,
        history: this.aiHistory
      }));
      this.diagramResult.set(result);
      this.aiHistory = [
        ...this.aiHistory,
        { role: 'user' as const, content: command },
        { role: 'assistant' as const, content: result.changes || result.interpretation || 'Sin cambios' }
      ].slice(-8);
      if (result.actions.length) {
        await this.applyAiActions(result.actions);
        this.queueWorkyRefresh();
      }
      this.diagramPrompt = '';
    } catch (err: any) {
      this.handleError(err?.error?.message || err?.message || 'No se pudo ejecutar la IA del diagrama');
    } finally {
      this.diagramBusy.set(false);
    }
  }

  async applyWorkySuggestion(suggestion: WorkySuggestion) {
    if (!suggestion.actions.length || this.diagramBusy()) return;
    this.diagramBusy.set(true);
    try {
      await this.applyAiActions(suggestion.actions);
      this.queueWorkyRefresh();
    } catch (err: any) {
      this.handleError(err?.error?.message || err?.message || 'No se pudo aplicar la sugerencia');
    } finally {
      this.diagramBusy.set(false);
    }
  }

  async sendWorkyMessage() {
    const command = this.workyPrompt.trim();
    if (!command || this.workyLoading() || !this.workflowId) return;
    this.workyLoading.set(true);
    try {
      const result = await firstValueFrom(this.api.post<WorkyResult>('/workflow-ai/sugerenciaworky', {
        ...this.aiContextPayload(),
        command,
        history: this.workyHistory
      }));
      this.workyResult.set(result);
      const assistantReply = result.summary || 'Sin respuesta';
      this.workyHistory = [
        ...this.workyHistory,
        { role: 'user' as const, content: command },
        { role: 'assistant' as const, content: assistantReply }
      ].slice(-12);
      this.workyChat.set(this.workyHistory);
      this.workyPrompt = '';
    } catch (err: any) {
      this.handleError(err?.error?.message || err?.message || 'No se pudo consultar a Worky');
    } finally {
      this.workyLoading.set(false);
    }
  }

  async runBottleneckAnalysis() {
    if (this.bottleneckLoading()) return;
    this.bottleneckLoading.set(true);
    try {
      const result = await firstValueFrom(this.api.post<BottleneckResult>('/workflow-ai/detectcuellodebotella', {
        workflowId: this.workflowId,
        workflowName: this.workflowName,
        nodo: this.nodo,
        transitions: this.transitions
      }));
      this.bottleneckResult.set(result);
    } catch (err: any) {
      this.handleError(err?.error?.message || err?.message || 'No se pudo analizar el workflow');
    } finally {
      this.bottleneckLoading.set(false);
    }
  }

  describeAiAction(action: DiagramAiAction) {
    switch (action.type) {
      case 'create_department': return `Crear departamento ${action.name || 'nuevo'}`;
      case 'create_job_role': return `Crear rol ${action.name || 'nuevo'} en ${action.departmentName || action.responsibleDepartmentName || 'departamento'}`;
      case 'create_nodo': return `Crear nodo ${action.name || 'nuevo'} (${action.nodeType || 'proceso'})`;
      case 'update_nodo': return `Actualizar nodo ${action.nodoId || ''}`;
      case 'delete_nodo': return `Eliminar nodo ${action.nodoId || ''}`;
      case 'connect_nodo': return `Conectar ${action.fromNodoId || ''} -> ${action.toNodoId || ''}`;
      case 'disconnect_nodo': return `Eliminar conexion ${action.transitionId || ''}`;
      default: return 'Mostrar diagrama';
    }
  }

  private queueWorkyRefresh() {
    if (this.workyRefreshTimer) {
      clearTimeout(this.workyRefreshTimer);
    }
    this.workyRefreshTimer = setTimeout(() => void this.refreshWorkySuggestions(), 1200);
  }

  async refreshWorkySuggestions() {
    if (!this.workflowId || this.workyLoading()) return;
    this.workyLoading.set(true);
    try {
      const result = await firstValueFrom(this.api.post<WorkyResult>('/workflow-ai/sugerenciaworky', {
        ...this.aiContextPayload(),
        history: this.workyHistory
      }));
      this.workyResult.set(result);
    } catch {
      this.workyResult.set(null);
    } finally {
      this.workyLoading.set(false);
    }
  }

  private aiContextPayload() {
    return {
      workflowId: this.workflowId,
      workflowName: this.workflowName,
      companyId: this.departments[0]?.companyId || null,
      nodo: this.nodo,
      transitions: this.transitions,
      departments: this.departments,
      jobRoles: this.jobRoles
    };
  }

  private handleError(message: string) {
    this.onError?.(message);
  }
}
