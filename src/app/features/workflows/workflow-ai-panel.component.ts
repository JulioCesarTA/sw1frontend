import { CommonModule } from '@angular/common';
import { Component, Input, OnChanges, OnDestroy, SimpleChanges, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';

type NodeType = 'inicio' | 'proceso' | 'decision' | 'bifurcasion' | 'union' | 'fin' | 'iteracion';
type FieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'FILE' | 'EMAIL' | 'CHECKBOX' | 'GRID';
type SidebarTab = 'inspector' | 'diagram-ai' | 'worky' | 'bottleneck';

interface GridColumn {
  id: string;
  name: string;
  type: Exclude<FieldType, 'FILE' | 'GRID'>;
  order: number;
}

interface ForwardConfig {
  mode?: 'selected' | 'none' | 'all' | 'files-only';
  fieldNames?: string[];
  includeFiles?: boolean;
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
  avgMinutes: number;
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
      columns?: GridColumn[];
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
      columns?: Array<{
        id?: string;
        name?: string;
        type?: Exclude<FieldType, 'FILE' | 'GRID'>;
        order?: number;
      }>;
      required?: boolean;
      order?: number;
    }>;
  } | null;
  trueLabel?: string;
  falseLabel?: string;
  avgMinutes?: number;
  posX?: number;
  posY?: number;
  forwardConfig?: ForwardConfig;
}

interface DiagramAiResult {
  interpretation?: string;
  changes?: string;
  actions: DiagramAiAction[];
}

interface FormVoiceDesignResult {
  targetNodoId: string;
  requiresForm: boolean;
  formDefinition?: {
    title?: string;
    fields?: Array<{
      id?: string;
      name?: string;
      type?: FieldType;
      columns?: Array<{
        id?: string;
        name?: string;
        type?: Exclude<FieldType, 'FILE' | 'GRID'>;
        order?: number;
      }>;
      isRequired?: boolean;
      required?: boolean;
      order?: number;
    }>;
  } | null;
  changes?: string;
  warnings?: string[];
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
  nodoId?: string;
  type?: string;
  severity?: string;
  reason?: string;
  recommendation?: string;
  TiempoEsperaMinutes?: number;
  TiempoPromedioActividadEnNodoMinutes?: number;
  activeCount?: number;
  completedSamples?: number;
  avgMinutesTarget?: number;
}

interface BottleneckKpi {
  id: string;
  label: string;
  averageMinutes: number;
  displayValue: string;
  sampleSize: number;
  formula: string;
  sourceFields: string[];
  description?: string;
}

interface BottleneckNodeMetric {
  nodoId: string;
  nodoName: string;
  avgMinutesTarget: number;
  activeCount: number;
  completedSamples: number;
  TiempoEsperaMinutes: number;
  TiempoEsperaDisplay: string;
  TiempoPromedioActividadEnNodoMinutes: number;
  TiempoPromedioActividadEnNodoDisplay: string;
}

interface BottleneckResult {
  summary?: string;
  kpis?: BottleneckKpi[];
  nodeMetrics?: BottleneckNodeMetric[];
  bottlenecks: BottleneckItem[];
  parallelizationOpportunities: string[];
}

declare global {
  interface Window {
    SpeechRecognition?: new () => any;
    webkitSpeechRecognition?: new () => any;
  }
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
        @if (diagramVoiceTranscript()) {
          <div class="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-sm text-sky-900">
            {{ diagramVoiceTranscript() }}
          </div>
        }
        <div class="flex justify-end gap-2">
          <button mat-stroked-button type="button" [disabled]="diagramBusy() || diagramVoiceProcessing()" (click)="toggleDiagramVoiceCapture()">
            @if (diagramVoiceListening()) {
              <mat-spinner diameter="18" />
            } @else {
              <mat-icon>mic</mat-icon>
            }
            {{ diagramVoiceListening() ? 'Detener grabacion' : 'Hablar' }}
          </button>
          <button mat-flat-button color="primary" [disabled]="diagramBusy() || diagramVoiceListening() || !diagramPrompt.trim()" (click)="runDiagramCommand()">
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
        <div class="flex items-center gap-3">
          <h3 class="m-0 text-lg text-slate-950">Worky</h3>
          @if (workyLoading()) {
            <mat-spinner diameter="18" />
          }
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
            @if (groupedRoleMetrics().length) {
              <div>
                <div class="mb-2 text-sm font-semibold text-slate-900">Metricas por departamento / rol</div>
                <div class="grid gap-2">
                  @for (grp of groupedRoleMetrics(); track grp.key) {
                    <div class="rounded-xl border border-slate-200 bg-white p-3">
                      <div class="mb-2">
                        <div class="text-sm font-semibold text-slate-900">{{ grp.roleName || 'Sin rol' }}</div>
                        @if (grp.deptName) {
                          <div class="mt-0.5 text-[11px] text-slate-500">{{ grp.deptName }}</div>
                        }
                      </div>
                      <div class="grid grid-cols-2 gap-x-3 gap-y-1.5">
                        <div>
                          <div class="text-[10px] uppercase tracking-wide text-slate-400">Espera promedio</div>
                          <div class="text-sm font-semibold text-slate-900">{{ formatMinutes(grp.avgEspera) }}</div>
                        </div>
                        <div>
                          <div class="text-[10px] uppercase tracking-wide text-slate-400">En nodo promedio</div>
                          <div class="text-sm font-semibold text-slate-900">{{ formatMinutes(grp.avgEnNodo) }}</div>
                        </div>
                        <div>
                          <div class="text-[10px] uppercase tracking-wide text-slate-400">Activas</div>
                          <div class="text-sm font-semibold text-slate-900">{{ grp.totalActivas }}</div>
                        </div>
                        <div>
                          <div class="text-[10px] uppercase tracking-wide text-slate-400">Muestras</div>
                          <div class="text-sm font-semibold text-slate-900">{{ grp.totalMuestras }}</div>
                        </div>
                      </div>
                      <div class="mt-1.5 text-[11px] text-slate-400">meta: {{ formatMinutes(grp.avgTarget) }}</div>
                    </div>
                  }
                </div>
              </div>
            }
            @if (bottleneckSuggestions().length) {
              <div class="rounded-2xl border border-violet-200 bg-violet-50 p-4">
                <div class="mb-2.5 text-sm font-semibold text-violet-900">Sugerencias</div>
                <div class="grid gap-2">
                  @for (s of bottleneckSuggestions(); track $index) {
                    <div class="flex gap-2 text-sm text-violet-800">
                      <span class="mt-0.5 shrink-0 text-violet-400">›</span>
                      <span>{{ s }}</span>
                    </div>
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
  @Input() selectedNodo: Nodo | null = null;
  @Input({ required: true }) applyAiActions!: (actions: DiagramAiAction[]) => Promise<void>;
  @Input() applyVoiceFormPatch?: (result: FormVoiceDesignResult) => Promise<void>;
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
  diagramVoiceListening = signal(false);
  diagramVoiceProcessing = signal(false);
  diagramVoiceTranscript = signal('');
  diagramPrompt = '';
  workyPrompt = '';
  private aiHistory: AiChatMessage[] = [];
  private workyHistory: AiChatMessage[] = [];
  private speechRecognition: any = null;
  private shouldExecuteVoiceCommand = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnChanges(changes: SimpleChanges) {
    if (this.activeTab === 'worky' && (changes['activeTab'] || changes['nodo'] || changes['transitions'] || changes['departments'] || changes['jobRoles'])) {
      this.queueWorkyRefresh();
    }
  }

  ngOnDestroy() {
    this.stopDiagramVoiceCapture();
    if (this.workyRefreshTimer) {
      clearTimeout(this.workyRefreshTimer);
    }
  }

  async runDiagramCommand() {
    const command = this.diagramPrompt.trim();
    if (!command || this.diagramBusy()) return;
    await this.executeAiCommand(command, false);
  }

  private async executeAiCommand(command: string, fromVoice: boolean) {
    if (this.looksLikeFormCommand(command)) {
      await this.executeFormVoiceCommand(command);
      return;
    }
    await this.executeDiagramCommand(command, fromVoice ? '/workflow-ai/diagramaporvoz' : '/workflow-ai/diagramaporcomand');
  }

  private async executeDiagramCommand(command: string, endpoint: string) {
    this.diagramBusy.set(true);
    try {
      const result = await firstValueFrom(this.api.post<DiagramAiResult>(endpoint, {
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

  private async executeFormVoiceCommand(command: string) {
    if (!this.applyVoiceFormPatch) {
      this.handleError('No hay manejador para aplicar cambios de formulario');
      return;
    }
    this.diagramBusy.set(true);
    try {
      const result = await firstValueFrom(this.api.post<FormVoiceDesignResult>('/workflow-ai/formularioporvoz', {
        ...this.aiContextPayload(),
        transcript: command,
        selectedNodo: this.selectedNodo
      }));
      if (result.warnings?.length && !result.targetNodoId) {
        this.diagramResult.set({
          interpretation: 'No se aplicaron cambios al formulario',
          changes: result.warnings.join(' | '),
          actions: []
        });
        return;
      }
      await this.applyVoiceFormPatch(result);
      const warnings = result.warnings?.length ? ` Advertencias: ${result.warnings.join(' | ')}` : '';
      this.diagramResult.set({
        interpretation: `Formulario actualizado en ${this.resolveNodoName(result.targetNodoId)}`,
        changes: `${result.changes || 'Cambios aplicados al formulario.'}${warnings}`,
        actions: []
      });
      this.queueWorkyRefresh();
      this.diagramPrompt = '';
    } catch (err: any) {
      this.handleError(err?.error?.message || err?.message || 'No se pudo editar el formulario por voz');
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

  groupedRoleMetrics() {
    const metrics = this.bottleneckResult()?.nodeMetrics ?? [];
    const map = new Map<string, {
      key: string; deptName: string; roleName: string;
      esperas: number[]; enNodos: number[]; totalActivas: number; totalMuestras: number; targets: number[];
    }>();
    for (const metric of metrics) {
      const n = this.nodo.find(item => item.id === metric.nodoId);
      if (!n) continue;
      const dept = n.responsibleDepartmentName || this.departments.find(d => d.id === n.responsibleDepartmentId)?.name || '';
      const role = this.jobRoles.find(r => r.id === n.responsibleJobRoleId)?.name || '';
      if (!dept && !role) continue;
      const key = `${dept}::${role}`;
      if (!map.has(key)) map.set(key, { key, deptName: dept, roleName: role, esperas: [], enNodos: [], totalActivas: 0, totalMuestras: 0, targets: [] });
      const g = map.get(key)!;
      g.esperas.push(metric.TiempoEsperaMinutes);
      g.enNodos.push(metric.TiempoPromedioActividadEnNodoMinutes);
      g.totalActivas += metric.activeCount;
      g.totalMuestras += metric.completedSamples;
      g.targets.push(metric.avgMinutesTarget);
    }
    const avg = (arr: number[]) => arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
    return [...map.values()].map(g => ({
      key: g.key, deptName: g.deptName, roleName: g.roleName,
      avgEspera: avg(g.esperas), avgEnNodo: avg(g.enNodos),
      totalActivas: g.totalActivas, totalMuestras: g.totalMuestras,
      avgTarget: avg(g.targets)
    }));
  }

  nodoMeta(nodoId: string): { dept: string; role: string } | null {
    const n = this.nodo.find(item => item.id === nodoId);
    if (!n) return null;
    const dept = n.responsibleDepartmentName || this.departments.find(d => d.id === n.responsibleDepartmentId)?.name || '';
    const role = this.jobRoles.find(r => r.id === n.responsibleJobRoleId)?.name || '';
    return (dept || role) ? { dept, role } : null;
  }

  bottleneckSuggestions(): string[] {
    const result = this.bottleneckResult();
    if (!result) return [];
    const fromBottlenecks = (result.bottlenecks ?? [])
      .map(b => b.recommendation)
      .filter((r): r is string => !!r);
    const fromParallelization = result.parallelizationOpportunities ?? [];
    return [...fromBottlenecks, ...fromParallelization];
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

  toggleDiagramVoiceCapture() {
    if (this.diagramVoiceListening()) {
      this.stopDiagramVoiceCapture(true);
      return;
    }
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      this.handleError('Tu navegador no soporta reconocimiento de voz');
      return;
    }
    this.shouldExecuteVoiceCommand = false;
    this.speechRecognition = new SpeechRecognitionCtor();
    this.speechRecognition.lang = 'es-ES';
    this.speechRecognition.continuous = true;
    this.speechRecognition.interimResults = true;
    this.speechRecognition.onstart = () => {
      this.diagramVoiceListening.set(true);
      this.diagramVoiceTranscript.set('');
      this.clearSilenceTimer();
    };
    this.speechRecognition.onerror = () => {
      this.diagramVoiceListening.set(false);
      this.diagramVoiceProcessing.set(false);
      this.shouldExecuteVoiceCommand = false;
      this.clearSilenceTimer();
      this.handleError('No se pudo capturar la voz');
    };
    this.speechRecognition.onend = async () => {
      this.clearSilenceTimer();
      this.diagramVoiceListening.set(false);
      const shouldExecute = this.shouldExecuteVoiceCommand;
      this.shouldExecuteVoiceCommand = false;
      if (!shouldExecute) {
        return;
      }
      const transcript = this.diagramVoiceTranscript().trim();
      if (!transcript) {
        this.diagramVoiceProcessing.set(false);
        this.handleError('No se detecto ningun comando de voz');
        return;
      }
      this.diagramPrompt = transcript;
      try {
        await this.executeAiCommand(transcript, true);
      } finally {
        this.diagramVoiceProcessing.set(false);
      }
    };
    this.speechRecognition.onresult = (event: any) => {
      const transcript = Array.from(event.results ?? [])
        .map((result: any) => result?.[0]?.transcript || '')
        .join(' ')
        .trim();
      if (!transcript) return;
      this.diagramVoiceTranscript.set(transcript);
      this.restartSilenceTimer();
    };
    this.speechRecognition.start();
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
      jobRoles: this.jobRoles,
      selectedNodo: this.selectedNodo
    };
  }

  private looksLikeFormCommand(command: string) {
    const normalized = command.trim().toLowerCase();
    return /formulario|campo|grilla|grid|checkbox|check|obligatorio|required|requerido|columna|titulo del formulario|título del formulario/.test(normalized);
  }

  private resolveNodoName(nodoId: string) {
    return this.nodo.find(item => item.id === nodoId)?.name || nodoId || 'nodo';
  }

  private handleError(message: string) {
    this.onError?.(message);
  }

  private stopDiagramVoiceCapture(executeCommand = false) {
    this.shouldExecuteVoiceCommand = executeCommand;
    if (executeCommand) {
      this.diagramVoiceProcessing.set(true);
    }
    this.clearSilenceTimer();
    if (this.speechRecognition) {
      this.speechRecognition.stop();
      this.speechRecognition = null;
      return;
    }
    this.diagramVoiceListening.set(false);
    if (executeCommand) {
      this.diagramVoiceProcessing.set(false);
    }
  }

  private restartSilenceTimer() {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      if (this.diagramVoiceListening()) {
        this.stopDiagramVoiceCapture(true);
      }
    }, 4000);
  }

  private clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }

  formatMinutes(value: number | null | undefined) {
    const minutes = Number(value ?? 0);
    if (!minutes || minutes <= 0) return '0 min';
    if (minutes >= 1440) return `${Math.round((minutes / 1440) * 100) / 100} d`;
    if (minutes >= 60) return `${Math.round((minutes / 60) * 100) / 100} h`;
    return `${Math.round(minutes * 100) / 100} min`;
  }
}
