import { CdkDragEnd, DragDropModule } from '@angular/cdk/drag-drop';
import { CommonModule } from '@angular/common';
import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import {
  CollaborativeWorkflowStage,
  CollaborativeWorkflowTransition,
  WorkflowCollaborationService,
  WorkflowStageLock
} from '../../core/services/workflow-collaboration.service';

type NodeType = 'start' | 'process' | 'decision' | 'bifurcasion' | 'join' | 'end' | 'loop';
type FieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'FILE' | 'EMAIL';
type ForwardMode = 'all' | 'selected' | 'files-only' | 'none';

interface Workflow {
  id: string;
  name: string;
  description?: string;
  stages: Stage[];
  transitions: Transition[];
}

interface FormField {
  id: string;
  name: string;
  type: FieldType;
  options?: string[];
  isRequired?: boolean;
  order: number;
}

interface FormDefinition {
  id?: string;
  title: string;
  fields: FormField[];
}

interface Stage {
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
  formDefinition?: FormDefinition;
}

interface ForwardConfig {
  mode?: ForwardMode;
  fieldNames?: string[];
  includeFiles?: boolean;
}

interface Transition {
  id: string;
  workflowId: string;
  fromStageId: string;
  toStageId: string;
  name?: string;
  condition?: string;
  forwardConfig?: ForwardConfig;
}

interface Department {
  id: string;
  name: string;
}

interface JobRole {
  id: string;
  departmentId: string;
  name: string;
}

interface DepartmentLane {
  id: string;
  name: string;
  leftPercent: number;
  widthPercent: number;
  tintClass: string;
  borderClass: string;
}

interface StageForm {
  name: string;
  description: string;
  nodeType: NodeType;
  responsibleDepartmentId: string;
  responsibleJobRoleId: string;
  avgHours: number;
  trueLabel: string;
  falseLabel: string;
  condition: string;
  requiresForm: boolean;
  formTitle: string;
  formFields: FormField[];
}

interface TransitionForm {
  name: string;
  mode: ForwardMode;
  includeFiles: boolean;
  fieldNames: string[];
}

interface ResolvedStageField extends FormField {
  originStageId: string;
  originStageName: string;
}

type SidebarTab = 'inspector' | 'diagram-ai' | 'worky' | 'bottleneck';

interface AiChatMessage {
  content: string;
}

interface DiagramAiAction {
  type: 'create_stage' | 'update_stage' | 'delete_stage' | 'connect_stages' | 'disconnect_stages' | 'show_diagram';
  placeholderId?: string;
  stageId?: string;
  transitionId?: string;
  fromStageId?: string;
  toStageId?: string;
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
  actions: DiagramAiAction[];
  interpretation: string;
  affectedNodes: string[];
  changes: string;
}

interface WorkySuggestion {
  id: string;
  message: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  actions: DiagramAiAction[];
}

interface WorkyResult {
  assistantName: string;
  summary: string;
  suggestions: WorkySuggestion[];
}

interface BottleneckItem {
  stageId: string;
  stageName: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  description: string;
  recommendation: string;
}

interface BottleneckResult {
  summary: string;
  bottlenecks: BottleneckItem[];
  parallelizationOpportunities: Array<{ stageIds: string[]; reason: string }>;
}

@Component({
  selector: 'app-workflow-editor',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    DragDropModule,
    MatButtonModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule
  ],
  template: `
    <div class="min-h-full bg-[#eef2ff] p-6">
      <div class="flex flex-col gap-[18px]">
        <header class="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div class="flex items-start gap-3">
            <button mat-icon-button (click)="goBack()"><mat-icon>arrow_back</mat-icon></button>
            <div>
              <div class="text-[11px] uppercase tracking-[.14em] text-slate-500">Workflow</div>
              <h1 class="m-0 text-[30px] leading-none text-slate-950">{{ workflow()?.name || 'Editor' }}</h1>
              <p class="mt-1 text-sm text-slate-500">{{ workflow()?.description || 'Editor visual del workflow' }}</p>
            </div>
          </div>
        </header>

        @if (loading()) {
          <div class="flex min-h-[60vh] items-center justify-center"><mat-spinner /></div>
        } @else {
          <div class="grid min-h-[78vh] gap-[18px] xl:grid-cols-[240px_minmax(0,1fr)_360px]">
            <aside class="rounded-[22px] border border-slate-200 bg-white p-[18px] shadow-[0_8px_30px_rgba(15,23,42,.05)]">
              <h3 class="m-0 mb-2.5 text-lg text-slate-950">Tipos de nodo</h3>

              <div class="grid gap-2.5">
                @for (item of palette; track item.type) {
                  <button
                    class="flex items-center gap-2.5 rounded-2xl border border-dashed border-indigo-200 bg-slate-50 px-3 py-3 text-left text-slate-900 transition hover:border-indigo-400 hover:bg-indigo-50"
                    draggable="true"
                    (dragstart)="onPaletteDragStart($event, item.type)"
                    (dragend)="onPaletteDragEnd()"
                  >
                    <mat-icon>{{ item.icon }}</mat-icon>
                    <span>{{ item.label }}</span>
                  </button>
                }
              </div>
            </aside>

            <section class="flex flex-col overflow-hidden rounded-[22px] border border-slate-200 bg-white shadow-[0_8px_30px_rgba(15,23,42,.05)]">
              <div class="flex items-center justify-between gap-3 border-b border-slate-200 px-[18px] py-3">
                <div class="flex min-w-0 items-center gap-2 overflow-x-auto">
                  <span class="shrink-0 text-sm font-semibold text-slate-600">Calles</span>
                  @for (department of departments(); track department.id) {
                    <button
                      type="button"
                      class="shrink-0 rounded-full border px-3 py-1.5 text-sm font-medium transition"
                      [class.border-indigo-500]="isLaneVisible(department.id)"
                      [class.bg-indigo-50]="isLaneVisible(department.id)"
                      [class.text-indigo-700]="isLaneVisible(department.id)"
                      [class.border-slate-300]="!isLaneVisible(department.id)"
                      [class.bg-white]="!isLaneVisible(department.id)"
                      [class.text-slate-700]="!isLaneVisible(department.id)"
                      (click)="assignDepartmentToSelectedStage(department.id)">
                      {{ department.name }}
                    </button>
                  }
                </div>

                <div class="flex gap-2.5">
                  @if (connectingFromId()) {
                    <button mat-stroked-button (click)="cancelConnect()"><mat-icon>link_off</mat-icon> Cancelar conexion</button>
                  }
                </div>
              </div>

              <div class="relative flex-1 overflow-auto bg-slate-50"
                   (click)="clearSelection()">
                @if (draggingPalette()) {
                  <div class="absolute inset-0 z-30 flex items-center justify-center border-2 border-dashed border-indigo-400 bg-indigo-100/70 text-base font-semibold text-indigo-700"
                       (dragover)="allowPaletteDrop($event)"
                       (drop)="onCanvasDrop($event)">
                    Suelta aqui para crear el nodo
                  </div>
                }

                <div #canvas
                     class="workflow-canvas-boundary relative bg-[radial-gradient(circle_at_1px_1px,_#cbd5e1_1px,_transparent_0)] bg-[length:24px_24px]"
                     [style.width.px]="canvasWidth()"
                     [style.min-width.px]="canvasWidth()"
                     [style.height.px]="canvasHeight()"
                     [style.min-height.px]="canvasHeight()"
                     (dragover)="allowPaletteDrop($event)"
                     (drop)="onCanvasDrop($event)">

                  @for (lane of visibleLanes(); track lane.id) {
                    <div class="pointer-events-none absolute inset-y-0 z-0 border-x"
                         [class]="lane.tintClass + ' ' + lane.borderClass"
                         [style.left.%]="lane.leftPercent"
                         [style.width.%]="lane.widthPercent">
                      <div class="sticky top-0 border-b border-inherit bg-white/75 px-3 py-2 text-[11px] font-bold uppercase tracking-[.14em] text-slate-600">
                        {{ lane.name }}
                      </div>
                    </div>
                  }

                  <svg class="absolute inset-0 z-0 h-full w-full overflow-visible">
                    <defs>
                      <marker id="arrow-default" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
                        <path d="M0,0 L10,5 L0,10 z" fill="#334155"></path>
                      </marker>
                      <marker id="arrow-selected" markerWidth="10" markerHeight="10" refX="9" refY="5" orient="auto">
                        <path d="M0,0 L10,5 L0,10 z" fill="#4f46e5"></path>
                      </marker>
                    </defs>

                    @for (transition of workflow()?.transitions || []; track transition.id) {
                      <path [attr.d]="transitionPath(transition)"
                            stroke="transparent"
                            stroke-width="14"
                            fill="none"
                            class="cursor-pointer"
                            (click)="onTransitionClick(transition, $event)"></path>
                      <path [attr.d]="transitionPath(transition)"
                            [attr.stroke]="selectedTransitionId() === transition.id ? '#4f46e5' : '#334155'"
                            stroke-width="2.2"
                            fill="none"
                            [attr.marker-end]="selectedTransitionId() === transition.id ? 'url(#arrow-selected)' : 'url(#arrow-default)'"></path>
                      @if (transitionLabelPosition(transition); as labelPos) {
                        <g class="cursor-pointer" (click)="onTransitionClick(transition, $event)">
                          <rect [attr.x]="labelPos.x - 34" [attr.y]="labelPos.y - 12" width="68" height="24" rx="12"
                                fill="white"
                                [attr.stroke]="selectedTransitionId() === transition.id ? '#4f46e5' : '#cbd5e1'"></rect>
                          <text [attr.x]="labelPos.x" [attr.y]="labelPos.y + 4" text-anchor="middle" font-size="11" font-weight="700"
                                [attr.fill]="selectedTransitionId() === transition.id ? '#4f46e5' : '#334155'">
                            {{ transition.name || 'flujo' }}
                          </text>
                        </g>
                      }
                    }
                  </svg>

                  @for (stage of workflow()?.stages || []; track stage.id) {
                    <div class="absolute left-0 top-0 z-10"
                         cdkDrag
                         [cdkDragFreeDragPosition]="{ x: stage.posX || 0, y: stage.posY || 0 }"
                         [cdkDragBoundary]="'.workflow-canvas-boundary'"
                         [cdkDragDisabled]="isLockedByOther(stage.id)"
                         (cdkDragStarted)="tryLockStage(stage.id)"
                         (cdkDragEnded)="onStageDragEnd(stage, $event)"
                         (click)="onStageClick(stage, $event)">
                      <div [class]="nodeCardClass(stage)">
                        <button type="button"
                                class="absolute -right-2 -top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-indigo-200 bg-white text-indigo-600 shadow hover:bg-indigo-50"
                                title="Conectar"
                                (click)="startConnect(stage, $event)">
                          <mat-icon class="!h-4 !w-4 !text-[16px]">add_link</mat-icon>
                        </button>

                        @switch (nodeType(stage)) {
                          @case ('start') {
                            <div class="flex h-[82px] w-[82px] items-center justify-center rounded-full bg-slate-800 text-sm font-bold text-white shadow">
                              {{ stage.name }}
                            </div>
                          }
                          @case ('end') {
                            <div class="flex h-[82px] w-[82px] items-center justify-center rounded-full border-[6px] border-slate-800 bg-white text-sm font-bold text-slate-900 shadow">
                              {{ stage.name }}
                            </div>
                          }
                          @case ('decision') {
                            <div class="relative h-[104px] w-[104px] rotate-45 rounded-2xl border-[3px] border-amber-500 bg-white shadow">
                              <div class="-rotate-45 absolute inset-0 flex items-center justify-center px-3 text-center text-sm font-semibold text-slate-900">
                                {{ stage.name }}
                              </div>
                            </div>
                          }
                          @case ('loop') {
                            <div class="relative h-[104px] w-[104px] rotate-45 rounded-2xl border-[3px] border-orange-500 bg-white shadow">
                              <div class="-rotate-45 absolute inset-0 flex items-center justify-center px-3 text-center text-sm font-semibold text-slate-900">
                                {{ stage.name }}
                              </div>
                            </div>
                          }
                          @case ('bifurcasion') {
                            <div class="flex min-w-[150px] flex-col items-center gap-2">
                              <div class="h-[16px] w-[140px] rounded-full bg-slate-800"></div>
                              <div class="text-center text-sm font-semibold text-slate-900">{{ stage.name || 'Bifurcacion' }}</div>
                            </div>
                          }
                          @case ('join') {
                            <div class="flex min-w-[150px] flex-col items-center gap-2">
                              <div class="h-[16px] w-[140px] rounded-full bg-slate-800"></div>
                              <div class="text-center text-sm font-semibold text-slate-900">{{ stage.name || 'Union' }}</div>
                            </div>
                          }
                          @default {
                            <div class="w-[210px] rounded-[20px] border-2 border-blue-600 bg-white p-4 shadow">
                              <div class="flex items-start justify-between gap-2">
                                <div class="text-base font-semibold text-slate-950">{{ stage.name }}</div>
                                @if (stage.requiresForm) {
                                  <span class="rounded-full bg-indigo-100 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-indigo-700">Formulario</span>
                                }
                              </div>
                              @if (stage.description) {
                                <div class="mt-1 text-sm text-slate-500">{{ stage.description }}</div>
                              }
                              @if (stage.responsibleDepartmentName) {
                                <div class="mt-3 text-sm font-medium text-slate-700">{{ stage.responsibleDepartmentName }}</div>
                              }
                              <div class="mt-3 text-xs text-slate-500">Promedio {{ stage.avgHours }}h</div>
                            </div>
                          }
                        }
                      </div>
                    </div>
                  }
                </div>
              </div>
            </section>

            <aside class="rounded-[22px] border border-slate-200 bg-white p-[18px] shadow-[0_8px_30px_rgba(15,23,42,.05)]">
              <div class="mb-4 grid grid-cols-4 gap-2 rounded-2xl bg-slate-100 p-1">
                <button type="button" class="rounded-xl px-2 py-2 text-xs font-semibold"
                        [class.bg-white]="sidebarTab() === 'inspector'"
                        [class.text-indigo-700]="sidebarTab() === 'inspector'"
                        (click)="sidebarTab.set('inspector')">Inspector</button>
                <button type="button" class="rounded-xl px-2 py-2 text-xs font-semibold"
                        [class.bg-white]="sidebarTab() === 'diagram-ai'"
                        [class.text-indigo-700]="sidebarTab() === 'diagram-ai'"
                        (click)="sidebarTab.set('diagram-ai')">IA</button>
                <button type="button" class="rounded-xl px-2 py-2 text-xs font-semibold"
                        [class.bg-white]="sidebarTab() === 'worky'"
                        [class.text-indigo-700]="sidebarTab() === 'worky'"
                        (click)="sidebarTab.set('worky')">Worky</button>
                <button type="button" class="rounded-xl px-2 py-2 text-xs font-semibold"
                        [class.bg-white]="sidebarTab() === 'bottleneck'"
                        [class.text-indigo-700]="sidebarTab() === 'bottleneck'"
                        (click)="sidebarTab.set('bottleneck')">Analisis</button>
              </div>

              @if (sidebarTab() === 'inspector' && selectedStage()) {
                <h3 class="m-0 mb-3 text-lg text-slate-950">Editar nodo</h3>

                @if (incomingFieldsForSelectedStage().length) {
                  <div class="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-3">
                    <div class="mb-2 text-sm font-semibold text-slate-900">Datos que llegan a este nodo</div>
                    <div class="grid gap-3">
                      @for (block of incomingFieldsForSelectedStage(); track block.fromStageName) {
                        <div>
                          <div class="mb-1 text-xs font-bold uppercase tracking-wide text-indigo-700">{{ block.fromStageName }}</div>
                          <div class="flex flex-wrap gap-2">
                            @for (field of block.fields; track field.id) {
                              <span class="rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-700">{{ field.name }}</span>
                            }
                          </div>
                        </div>
                      }
                    </div>
                  </div>
                }

                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Nombre</mat-label>
                  <input matInput [(ngModel)]="stageForm.name">
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Descripcion</mat-label>
                  <textarea matInput rows="3" [(ngModel)]="stageForm.description"></textarea>
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Tipo</mat-label>
                  <mat-select [(ngModel)]="stageForm.nodeType">
                    @for (item of palette; track item.type) {
                      <mat-option [value]="item.type">{{ item.label }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                @if (isHumanStage(stageForm.nodeType)) {
                  <mat-checkbox class="mb-2" [(ngModel)]="stageForm.requiresForm">Este proceso usa formulario</mat-checkbox>

                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Departamento</mat-label>
                    <mat-select [(ngModel)]="stageForm.responsibleDepartmentId">
                      <mat-option value="">Sin departamento</mat-option>
                      @for (department of departments(); track department.id) {
                        <mat-option [value]="department.id">{{ department.name }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Cargo</mat-label>
                    <mat-select [(ngModel)]="stageForm.responsibleJobRoleId">
                      <mat-option value="">Sin cargo</mat-option>
                      @for (role of rolesForDepartment(stageForm.responsibleDepartmentId); track role.id) {
                        <mat-option [value]="role.id">{{ role.name }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Promedio en horas</mat-label>
                    <input matInput type="number" min="1" [(ngModel)]="stageForm.avgHours">
                  </mat-form-field>

                  @if (stageForm.requiresForm) {
                    <div class="mt-3 rounded-2xl border border-slate-200 p-3">
                      <div class="mb-2 text-sm font-semibold text-slate-900">Formulario</div>
                      <mat-form-field appearance="outline" class="w-full">
                        <mat-label>Titulo del formulario</mat-label>
                        <input matInput [(ngModel)]="stageForm.formTitle">
                      </mat-form-field>

                      <div class="grid gap-2">
                        @for (field of stageForm.formFields; track field.id; let i = $index) {
                          <div class="rounded-xl border border-slate-200 p-3">
                            <div class="grid grid-cols-[1fr_110px] gap-2">
                              <mat-form-field appearance="outline" class="w-full">
                                <mat-label>Campo</mat-label>
                                <input matInput [(ngModel)]="field.name">
                              </mat-form-field>
                              <mat-form-field appearance="outline" class="w-full">
                                <mat-label>Tipo</mat-label>
                                <mat-select [(ngModel)]="field.type">
                                  @for (type of fieldTypes; track type) {
                                    <mat-option [value]="type">{{ type }}</mat-option>
                                  }
                                </mat-select>
                              </mat-form-field>
                            </div>
                            <div class="mt-2 flex items-center justify-between">
                              <mat-checkbox [(ngModel)]="field.isRequired">Obligatorio</mat-checkbox>
                              <button mat-button color="warn" (click)="removeFormField(i)">Quitar</button>
                            </div>
                          </div>
                        }
                      </div>

                      <button mat-stroked-button class="mt-3" (click)="addFormField()">
                        <mat-icon>add</mat-icon> Agregar campo
                      </button>
                    </div>
                  }
                }

                @if (stageForm.nodeType === 'decision' || stageForm.nodeType === 'loop') {
                  <div class="grid grid-cols-2 gap-2.5">
                    <mat-form-field appearance="outline">
                      <mat-label>Etiqueta 1</mat-label>
                      <input matInput [(ngModel)]="stageForm.trueLabel">
                    </mat-form-field>

                    <mat-form-field appearance="outline">
                      <mat-label>Etiqueta 2</mat-label>
                      <input matInput [(ngModel)]="stageForm.falseLabel">
                    </mat-form-field>
                  </div>

                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Condicion</mat-label>
                    <input matInput [(ngModel)]="stageForm.condition">
                  </mat-form-field>
                }

                <div class="mt-3 flex justify-end">
                  <div class="flex gap-2">
                    <button mat-stroked-button color="warn" (click)="removeSelected()">
                      <mat-icon>delete</mat-icon> Eliminar nodo
                    </button>
                    <button mat-flat-button color="primary" (click)="saveStage()">Guardar nodo</button>
                  </div>
                </div>
              } @else if (sidebarTab() === 'inspector' && selectedTransition()) {
                <h3 class="m-0 mb-3 text-lg text-slate-950">Editar conexion</h3>
                <div class="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  {{ sourceStageName(selectedTransition()!) }} -> {{ targetStageName(selectedTransition()!) }}
                </div>

                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Nombre de la conexion</mat-label>
                  <input matInput [(ngModel)]="transitionForm.name">
                </mat-form-field>

                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Que parte del formulario pasa</mat-label>
                  <mat-select [(ngModel)]="transitionForm.mode">
                    <mat-option value="all">Todo</mat-option>
                    <mat-option value="selected">Solo campos seleccionados</mat-option>
                    <mat-option value="files-only">Solo archivos</mat-option>
                    <mat-option value="none">Nada</mat-option>
                  </mat-select>
                </mat-form-field>

                <mat-checkbox class="mb-2" [(ngModel)]="transitionForm.includeFiles">Incluir archivos</mat-checkbox>

                @if (availableForwardFields().length) {
                  <div class="rounded-2xl border border-slate-200 p-3">
                    <div class="mb-2 text-sm font-semibold text-slate-900">Campos del formulario A</div>
                    <div class="grid gap-2">
                      @for (field of availableForwardFields(); track field.id) {
                        <mat-checkbox
                          [checked]="transitionForm.fieldNames.includes(field.name)"
                          [disabled]="transitionForm.mode !== 'selected'"
                          (change)="toggleForwardField(field.name, $event.checked)">
                          {{ field.name }} · {{ field.type }}
                        </mat-checkbox>
                      }
                    </div>
                  </div>

                  <div class="mt-3 rounded-2xl border border-indigo-200 bg-indigo-50 p-3">
                    <div class="mb-2 text-sm font-semibold text-slate-900">Campos que pasan de A a B</div>
                    @if (resolvedForwardFields().length) {
                      <div class="flex flex-wrap gap-2">
                        @for (field of resolvedForwardFields(); track field.name) {
                          <span class="rounded-full bg-white px-3 py-1 text-xs font-semibold text-indigo-700">{{ field.name }}</span>
                        }
                      </div>
                    } @else {
                      <div class="text-sm text-slate-500">Esta conexion no esta enviando campos.</div>
                    }
                  </div>
                } @else {
                  <div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    El nodo origen no tiene formulario configurado.
                  </div>
                }

                <div class="mt-3 flex justify-end">
                  <div class="flex gap-2">
                    <button mat-stroked-button color="warn" (click)="removeSelected()">
                      <mat-icon>delete</mat-icon> Eliminar conexion
                    </button>
                    <button mat-flat-button color="primary" (click)="saveTransition()">Guardar conexion</button>
                  </div>
                </div>
              } @else if (sidebarTab() === 'diagram-ai') {
                <h3 class="m-0 mb-3 text-lg text-slate-950">Diagrama por comando</h3>
                <p class="mb-3 text-sm text-slate-500">Escribe lo que quieres cambiar y la IA lo aplicara al workflow.</p>

                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Prompt</mat-label>
                  <textarea matInput rows="4" [(ngModel)]="diagramPrompt"></textarea>
                </mat-form-field>

                <div class="mb-3 flex justify-end">
                  <button mat-flat-button color="primary" [disabled]="diagramBusy()" (click)="runDiagramCommand()">
                    {{ diagramBusy() ? 'Procesando...' : 'Ejecutar comando' }}
                  </button>
                </div>

                @if (diagramResult()) {
                  <div class="rounded-2xl border border-slate-200 bg-slate-50 p-3">
                    <div class="mb-2 text-sm font-semibold text-slate-900">Respuesta</div>
                    @if (diagramResult()!.changes) {
                      <div class="mb-2 text-sm text-slate-700">{{ diagramResult()!.changes }}</div>
                    }
                    @if (diagramResult()!.interpretation) {
                      <div class="text-sm text-slate-600">{{ diagramResult()!.interpretation }}</div>
                    }
                    @if (diagramResult()!.actions.length) {
                      <div class="mt-3 rounded-xl border border-indigo-200 bg-indigo-50 p-3">
                        <div class="mb-2 text-xs font-bold uppercase tracking-wide text-indigo-700">Acciones aplicadas</div>
                        <div class="grid gap-2 text-sm text-slate-700">
                          @for (action of diagramResult()!.actions; track $index) {
                            <div>{{ describeAiAction(action) }}</div>
                          }
                        </div>
                      </div>
                    }
                  </div>
                }
              } @else if (sidebarTab() === 'worky') {
                <h3 class="m-0 mb-3 text-lg text-slate-950">Worky</h3>
                @if (workyLoading()) {
                  <div class="flex justify-center py-8"><mat-spinner diameter="28" /></div>
                } @else if (workyResult()) {
                  <div class="rounded-2xl border border-emerald-200 bg-emerald-50 p-3 text-sm text-slate-700">
                    <div class="font-semibold text-emerald-800">{{ workyResult()!.assistantName }}</div>
                    <div class="mt-1">{{ workyResult()!.summary }}</div>
                  </div>

                  <div class="mt-3 grid gap-3">
                    @for (suggestion of workyResult()!.suggestions; track suggestion.id) {
                      <div class="rounded-2xl border border-slate-200 p-3">
                        <div class="mb-2 flex items-center justify-between gap-2">
                          <span class="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide"
                                [class.bg-rose-100]="suggestion.priority === 'high'"
                                [class.text-rose-700]="suggestion.priority === 'high'"
                                [class.bg-amber-100]="suggestion.priority === 'medium'"
                                [class.text-amber-700]="suggestion.priority === 'medium'"
                                [class.bg-slate-100]="suggestion.priority === 'low'"
                                [class.text-slate-700]="suggestion.priority === 'low'">
                            {{ suggestion.priority }}
                          </span>
                          @if (suggestion.actions.length) {
                            <button mat-stroked-button (click)="applyWorkySuggestion(suggestion)" [disabled]="diagramBusy()">Aplicar</button>
                          }
                        </div>
                        <div class="text-sm font-semibold text-slate-900">{{ suggestion.message }}</div>
                        <div class="mt-2 text-sm text-slate-600">{{ suggestion.reason }}</div>
                      </div>
                    }
                  </div>
                } @else {
                  <div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    Worky esta leyendo tu canvas y te mostrara sugerencias aqui.
                  </div>
                }
              } @else if (sidebarTab() === 'bottleneck') {
                <div class="mb-3 flex items-center justify-between gap-2">
                  <h3 class="m-0 text-lg text-slate-950">Cuello de botella</h3>
                  <button mat-stroked-button [disabled]="bottleneckLoading()" (click)="runBottleneckAnalysis()">
                    {{ bottleneckLoading() ? 'Analizando...' : 'Analizar' }}
                  </button>
                </div>

                @if (bottleneckLoading()) {
                  <div class="flex justify-center py-8"><mat-spinner diameter="28" /></div>
                } @else if (bottleneckResult()) {
                  <div class="rounded-2xl border border-amber-200 bg-amber-50 p-3 text-sm text-slate-700">
                    {{ bottleneckResult()!.summary }}
                  </div>

                  <div class="mt-3 grid gap-3">
                    @for (item of bottleneckResult()!.bottlenecks; track item.stageId) {
                      <div class="rounded-2xl border border-slate-200 p-3">
                        <div class="mb-1 flex items-center justify-between gap-2">
                          <div class="font-semibold text-slate-900">{{ item.stageName }}</div>
                          <span class="rounded-full px-2 py-1 text-[10px] font-bold uppercase tracking-wide"
                                [class.bg-rose-100]="item.severity === 'high'"
                                [class.text-rose-700]="item.severity === 'high'"
                                [class.bg-amber-100]="item.severity === 'medium'"
                                [class.text-amber-700]="item.severity === 'medium'"
                                [class.bg-slate-100]="item.severity === 'low'"
                                [class.text-slate-700]="item.severity === 'low'">
                            {{ item.severity }}
                          </span>
                        </div>
                        <div class="text-sm text-slate-600">{{ item.description }}</div>
                        <div class="mt-2 rounded-xl bg-slate-50 p-3 text-sm text-slate-700">{{ item.recommendation }}</div>
                      </div>
                    }

                    @if (bottleneckResult()!.parallelizationOpportunities.length) {
                      <div class="rounded-2xl border border-indigo-200 bg-indigo-50 p-3">
                        <div class="mb-2 text-sm font-semibold text-slate-900">Oportunidades</div>
                        <div class="grid gap-2 text-sm text-slate-700">
                          @for (item of bottleneckResult()!.parallelizationOpportunities; track $index) {
                            <div>{{ item.reason }}</div>
                          }
                        </div>
                      </div>
                    }
                  </div>
                } @else {
                  <div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                    Ejecuta el analisis para detectar cuellos de botella y ver sugerencias.
                  </div>
                }
              } @else {
                <h3 class="m-0 mb-3 text-lg text-slate-950">Inspector</h3>
                <div class="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-5 text-sm text-slate-500">
                  Haz click en un nodo para editarlo o en la flecha para editar lo que pasa de A hacia B.
                </div>
              }
            </aside>
          </div>
        }
      </div>
    </div>
  `
})
export class WorkflowEditorComponent implements OnInit, OnDestroy {
  @ViewChild('canvas') canvas?: ElementRef<HTMLDivElement>;

  private paletteDragMimeType = 'application/x-workflow-node';
  private route = inject(ActivatedRoute);
  private router = inject(Router);
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  private collab = inject(WorkflowCollaborationService);

  readonly fieldTypes: FieldType[] = ['TEXT', 'NUMBER', 'DATE', 'FILE', 'EMAIL'];
  readonly palette = [
    { type: 'start' as NodeType, label: 'Inicio', icon: 'play_circle' },
    { type: 'process' as NodeType, label: 'Proceso', icon: 'settings' },
    { type: 'decision' as NodeType, label: 'Decision', icon: 'diamond' },
    { type: 'bifurcasion' as NodeType, label: 'Bifurcacion', icon: 'call_split' },
    { type: 'join' as NodeType, label: 'Union', icon: 'merge' },
    { type: 'loop' as NodeType, label: 'Iteracion', icon: 'refresh' },
    { type: 'end' as NodeType, label: 'Fin', icon: 'stop_circle' }
  ];

  id = '';
  loading = signal(true);
  workflow = signal<Workflow | null>(null);
  departments = signal<Department[]>([]);
  jobRoles = signal<JobRole[]>([]);
  draggingPalette = signal(false);
  stageLocks = signal(new Map<string, WorkflowStageLock>());
  selectedStageId = signal<string | null>(null);
  selectedTransitionId = signal<string | null>(null);
  connectingFromId = signal<string | null>(null);
  sidebarTab = signal<SidebarTab>('inspector');
  diagramBusy = signal(false);
  diagramResult = signal<DiagramAiResult | null>(null);
  workyLoading = signal(false);
  workyResult = signal<WorkyResult | null>(null);
  bottleneckLoading = signal(false);
  bottleneckResult = signal<BottleneckResult | null>(null);

  selectedStage = computed(() => this.workflow()?.stages.find(stage => stage.id === this.selectedStageId()) ?? null);
  selectedTransition = computed(() => this.workflow()?.transitions.find(transition => transition.id === this.selectedTransitionId()) ?? null);
  availableForwardFields = computed(() => {
    const transition = this.selectedTransition();
    if (!transition) return [] as ResolvedStageField[];
    return this.resolveFieldsAvailableAtStage(transition.fromStageId);
  });
  resolvedForwardFields = computed(() => {
    const fields: ResolvedStageField[] = this.availableForwardFields();
    switch (this.transitionForm.mode) {
      case 'none':
        return [];
      case 'files-only':
        return fields.filter((field: ResolvedStageField) => field.type === 'FILE');
      case 'selected':
        return fields.filter((field: ResolvedStageField) => this.transitionForm.fieldNames.includes(field.name));
      default:
        return fields;
    }
  });
  incomingFieldsForSelectedStage = computed(() => {
    const stage = this.selectedStage();
    const workflow = this.workflow();
    if (!stage || !workflow) return [] as Array<{ fromStageName: string; fields: ResolvedStageField[] }>;
    return workflow.transitions
      .filter(transition => transition.toStageId === stage.id)
      .map(transition => {
        const fromStageName = workflow.stages.find(candidate => candidate.id === transition.fromStageId)?.name || 'Origen';
        return {
          fromStageName,
          fields: this.resolveTransitionFields(transition)
        };
      })
      .filter(block => block.fields.length > 0);
  });
  visibleLanes = computed(() => {
    const stageDepartmentIds = this.workflow()?.stages
      .map(stage => stage.responsibleDepartmentId)
      .filter((departmentId): departmentId is string => !!departmentId) ?? [];
    const orderedIds = [...new Set(stageDepartmentIds)];
    const selected = this.departments().filter(department => orderedIds.includes(department.id));
    const palette = [
      { tintClass: 'bg-amber-50/70', borderClass: 'border-amber-200' },
      { tintClass: 'bg-sky-50/70', borderClass: 'border-sky-200' },
      { tintClass: 'bg-emerald-50/70', borderClass: 'border-emerald-200' },
      { tintClass: 'bg-rose-50/70', borderClass: 'border-rose-200' },
      { tintClass: 'bg-violet-50/70', borderClass: 'border-violet-200' },
      { tintClass: 'bg-orange-50/70', borderClass: 'border-orange-200' }
    ];
    const count = selected.length;
    return selected.map((department, index) => {
      const widthPercent = count ? 100 / count : 100;
      return {
        id: department.id,
        name: department.name,
        leftPercent: index * widthPercent,
        widthPercent,
        tintClass: palette[index % palette.length].tintClass,
        borderClass: palette[index % palette.length].borderClass
      } satisfies DepartmentLane;
    });
  });
  canvasWidth = computed(() => {
    const stages = this.workflow()?.stages ?? [];
    const laneCount = Math.max(this.visibleLanes().length, 1);
    const lanesWidth = laneCount * 300;
    const maxStageRight = stages.reduce((max, stage) => {
      const width = this.stageBoxWidth(stage);
      return Math.max(max, (stage.posX ?? 0) + width + 120);
    }, 0);
    return Math.max(1200, lanesWidth, maxStageRight);
  });
  canvasHeight = computed(() => {
    const stages = this.workflow()?.stages ?? [];
    const maxStageBottom = stages.reduce((max, stage) => {
      const height = this.stageBoxHeight(stage);
      return Math.max(max, (stage.posY ?? 0) + height + 120);
    }, 0);
    return Math.max(720, maxStageBottom);
  });

  stageForm: StageForm = this.emptyStageForm();
  transitionForm: TransitionForm = this.emptyTransitionForm();
  diagramPrompt = '';
  private aiHistory: AiChatMessage[] = [];
  private workyRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') || '';
    this.loadReferenceData();
    this.loadWorkflow();
    this.connectRealtime();
  }

  ngOnDestroy() {
    if (this.workyRefreshTimer) {
      clearTimeout(this.workyRefreshTimer);
    }
    const selectedStageId = this.selectedStageId();
    if (selectedStageId && this.isLockedByMe(selectedStageId)) {
      this.collab.unlockStage(selectedStageId);
    }
    this.collab.disconnect();
  }

  goBack() {
    this.router.navigate(['/workflows']);
  }

  onPaletteDragStart(event: DragEvent, type: NodeType) {
    this.draggingPalette.set(true);
    if (event.dataTransfer) {
      event.dataTransfer.setData(this.paletteDragMimeType, type);
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onPaletteDragEnd() {
    this.draggingPalette.set(false);
  }

  allowPaletteDrop(event: DragEvent) {
    if (!event.dataTransfer?.types.includes(this.paletteDragMimeType)) return;
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = 'copy';
    }
  }

  onCanvasDrop(event: DragEvent) {
    this.onPaletteDragEnd();
    if (!event.dataTransfer?.types.includes(this.paletteDragMimeType)) return;
    event.preventDefault();
    const type = event.dataTransfer.getData(this.paletteDragMimeType) as NodeType | '';
    const rect = this.canvas?.nativeElement.getBoundingClientRect();
    if (!type || !rect) return;
    this.createStage(type, event.clientX - rect.left, event.clientY - rect.top);
  }

  onStageClick(stage: Stage, event: MouseEvent) {
    event.stopPropagation();
    if (this.connectingFromId() && this.connectingFromId() !== stage.id) {
      this.createTransition(this.connectingFromId()!, stage.id);
      return;
    }
    if (this.isLockedByOther(stage.id)) return;
    this.tryLockStage(stage.id);
    this.selectedTransitionId.set(null);
    this.sidebarTab.set('inspector');
    this.selectStage(stage.id);
  }

  startConnect(stage: Stage, event: MouseEvent) {
    event.stopPropagation();
    this.selectedStageId.set(null);
    this.selectedTransitionId.set(null);
    this.connectingFromId.set(stage.id);
  }

  cancelConnect() {
    this.connectingFromId.set(null);
  }

  onTransitionClick(transition: Transition, event: MouseEvent) {
    event.stopPropagation();
    this.selectedStageId.set(null);
    this.selectedTransitionId.set(transition.id);
    this.connectingFromId.set(null);
    this.sidebarTab.set('inspector');
    this.ensureReachableFormsLoaded(transition.fromStageId);
    this.transitionForm = {
      name: transition.name || '',
      mode: transition.forwardConfig?.mode || 'all',
      includeFiles: Boolean(transition.forwardConfig?.includeFiles),
      fieldNames: [...(transition.forwardConfig?.fieldNames ?? [])]
    };
  }

  onStageDragEnd(stage: Stage, event: CdkDragEnd) {
    const position = event.source.getFreeDragPosition();
    this.updateStageSignal(stage.id, { posX: position.x, posY: position.y });
    this.api.patch<Stage>(`/workflow-stages/${stage.id}`, {
      posX: position.x,
      posY: position.y
    }).subscribe({
      next: saved => this.upsertStage(saved),
      error: () => this.snack.open('No se pudo guardar la posicion', '', { duration: 2500 })
    });
  }

  clearSelection() {
    const selectedStageId = this.selectedStageId();
    if (selectedStageId && this.isLockedByMe(selectedStageId)) {
      this.collab.unlockStage(selectedStageId);
    }
    this.selectedStageId.set(null);
    this.selectedTransitionId.set(null);
    this.connectingFromId.set(null);
  }

  removeSelected() {
    const stage = this.selectedStage();
    if (stage) {
    this.api.delete<void>(`/workflow-stages/${stage.id}`).subscribe({
        next: () => {
          this.removeStage(stage.id);
          this.queueWorkyRefresh();
        },
        error: err => this.snack.open(err?.error?.message || 'No se pudo eliminar el nodo', '', { duration: 3000 })
      });
      return;
    }

    const transition = this.selectedTransition();
    if (!transition) return;
    this.api.delete<void>(`/workflow-transitions/${transition.id}`).subscribe({
      next: () => {
        this.removeTransition(transition.id);
        this.queueWorkyRefresh();
      },
      error: err => this.snack.open(err?.error?.message || 'No se pudo eliminar la conexion', '', { duration: 3000 })
    });
  }

  saveStage() {
    const stage = this.selectedStage();
    if (!stage) return;
    const processStage = this.isHumanStage(this.stageForm.nodeType);
    const requiresForm = processStage && this.stageForm.requiresForm;
    const formDefinition: FormDefinition | null = requiresForm ? {
      title: this.stageForm.formTitle || 'Formulario',
      fields: this.stageForm.formFields.map((field, index) => ({
        id: field.id || this.createFieldId(),
        name: field.name,
        type: field.type,
        isRequired: Boolean(field.isRequired),
        order: index + 1
      }))
    } : null;

    this.api.patch<Stage>(`/workflow-stages/${stage.id}`, {
      name: this.stageForm.name.trim() || 'Etapa',
      description: this.stageForm.description,
      nodeType: this.stageForm.nodeType,
      responsibleDepartmentId: processStage ? this.stageForm.responsibleDepartmentId || null : null,
      responsibleJobRoleId: processStage ? this.stageForm.responsibleJobRoleId || null : null,
      avgHours: processStage ? Number(this.stageForm.avgHours || 1) : 0,
      condition: this.stageForm.condition,
      trueLabel: this.stageForm.trueLabel,
      falseLabel: this.stageForm.falseLabel,
      requiresForm,
      formDefinition,
      posX: stage.posX ?? 0,
      posY: stage.posY ?? 0
    }).subscribe({
      next: saved => {
        this.upsertStage({
          ...stage,
          ...saved,
          requiresForm,
          formDefinition: formDefinition ?? undefined
        });
        this.queueWorkyRefresh();
        this.snack.open('Nodo actualizado', '', { duration: 1800 });
      },
      error: err => this.snack.open(err?.error?.message || 'Error al guardar el nodo', '', { duration: 3000 })
    });
  }

  saveTransition() {
    const transition = this.selectedTransition();
    if (!transition) return;
    this.api.patch<Transition>(`/workflow-transitions/${transition.id}`, {
      name: this.transitionForm.name,
      forwardConfig: {
        mode: this.transitionForm.mode,
        includeFiles: this.transitionForm.includeFiles,
        fieldNames: this.transitionForm.mode === 'selected' ? this.transitionForm.fieldNames : []
      }
    }).subscribe({
      next: saved => {
        this.upsertTransition(saved);
        this.queueWorkyRefresh();
        this.snack.open('Conexion actualizada', '', { duration: 1800 });
      },
      error: err => this.snack.open(err?.error?.message || 'Error al guardar la conexion', '', { duration: 3000 })
    });
  }

  addFormField() {
    this.stageForm.formFields = [
      ...this.stageForm.formFields,
      { id: this.createFieldId(), name: `campo_${this.stageForm.formFields.length + 1}`, type: 'TEXT', isRequired: false, order: this.stageForm.formFields.length + 1 }
    ];
  }

  removeFormField(index: number) {
    this.stageForm.formFields = this.stageForm.formFields.filter((_, i) => i !== index).map((field, i) => ({ ...field, order: i + 1 }));
  }

  toggleForwardField(fieldName: string, checked: boolean) {
    const next = new Set(this.transitionForm.fieldNames);
    if (checked) next.add(fieldName); else next.delete(fieldName);
    this.transitionForm = { ...this.transitionForm, fieldNames: [...next] };
  }

  assignDepartmentToSelectedStage(departmentId: string) {
    const stage = this.selectedStage();
    if (!stage || !this.isHumanStage(stage.nodeType)) {
      this.snack.open('Selecciona un proceso para moverlo a esa calle', '', { duration: 2200 });
      return;
    }
    this.stageForm = {
      ...this.stageForm,
      responsibleDepartmentId: departmentId,
      responsibleJobRoleId: this.rolesForDepartment(departmentId).some(role => role.id === this.stageForm.responsibleJobRoleId)
        ? this.stageForm.responsibleJobRoleId
        : ''
    };
    this.saveStage();
  }

  isHumanStage(type: string | undefined) {
    return (type || 'process') === 'process';
  }

  rolesForDepartment(departmentId: string) {
    return departmentId ? this.jobRoles().filter(role => role.departmentId === departmentId) : this.jobRoles();
  }

  isLaneVisible(departmentId: string) {
    return this.visibleLanes().some(lane => lane.id === departmentId);
  }

  nodeType(stage: Pick<Stage, 'nodeType'>) {
    const raw = (stage.nodeType || 'process').toLowerCase();
    if (raw === 'proceso') return 'process';
    if (raw === 'fork') return 'bifurcasion';
    if (raw === 'bifurcation') return 'bifurcasion';
    if (raw === 'union') return 'join';
    return raw as NodeType;
  }

  nodeCardClass(stage: Stage) {
    const selected = this.selectedStageId() === stage.id ? 'ring-4 ring-indigo-200 ' : '';
    const connecting = this.connectingFromId() === stage.id ? 'ring-4 ring-emerald-200 ' : '';
    const locked = this.isLockedByOther(stage.id) ? 'opacity-60 cursor-not-allowed ' : 'cursor-pointer ';
    return `${selected}${connecting}${locked}relative transition`;
  }

  transitionPath(transition: Transition) {
    const source = this.stageCenter(transition.fromStageId);
    const target = this.stageCenter(transition.toStageId);
    if (!source || !target) return '';
    const middleX = source.x + (target.x - source.x) / 2;
    return `M ${source.x} ${source.y} C ${middleX} ${source.y}, ${middleX} ${target.y}, ${target.x} ${target.y}`;
  }

  transitionLabelPosition(transition: Transition) {
    const source = this.stageCenter(transition.fromStageId);
    const target = this.stageCenter(transition.toStageId);
    if (!source || !target) return null;
    return { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
  }

  sourceStageName(transition: Transition) {
    return this.workflow()?.stages.find(stage => stage.id === transition.fromStageId)?.name || 'Origen';
  }

  targetStageName(transition: Transition) {
    return this.workflow()?.stages.find(stage => stage.id === transition.toStageId)?.name || 'Destino';
  }

  tryLockStage(stageId: string) {
    if (this.isLockedByOther(stageId)) return;
    const selected = this.selectedStageId();
    if (selected && selected !== stageId && this.isLockedByMe(selected)) {
      this.collab.unlockStage(selected);
    }
    if (!this.isLockedByMe(stageId)) {
      this.collab.lockStage(stageId);
    }
  }

  isLockedByOther(stageId: string) {
    const lock = this.stageLocks().get(stageId);
    return !!lock && lock.userId !== this.collab.getClientId();
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
      this.snack.open(err?.error?.message || 'No se pudo ejecutar la IA del diagrama', '', { duration: 3500 });
    } finally {
      this.diagramBusy.set(false);
    }
  }

  async applyWorkySuggestion(suggestion: WorkySuggestion) {
    if (!suggestion.actions.length || this.diagramBusy()) return;
    this.diagramBusy.set(true);
    try {
      await this.applyAiActions(suggestion.actions);
      this.snack.open('Sugerencia aplicada', '', { duration: 2200 });
      this.queueWorkyRefresh();
    } catch (err: any) {
      this.snack.open(err?.error?.message || 'No se pudo aplicar la sugerencia', '', { duration: 3500 });
    } finally {
      this.diagramBusy.set(false);
    }
  }

  async runBottleneckAnalysis() {
    if (this.bottleneckLoading()) return;
    this.bottleneckLoading.set(true);
    try {
      const result = await firstValueFrom(this.api.post<BottleneckResult>('/workflow-ai/detectcuellodebotella', {
        workflowId: this.workflow()?.id,
        workflowName: this.workflow()?.name,
        stages: this.workflow()?.stages ?? [],
        transitions: this.workflow()?.transitions ?? []
      }));
      this.bottleneckResult.set(result);
      this.sidebarTab.set('bottleneck');
    } catch (err: any) {
      this.snack.open(err?.error?.message || 'No se pudo analizar el workflow', '', { duration: 3500 });
    } finally {
      this.bottleneckLoading.set(false);
    }
  }

  describeAiAction(action: DiagramAiAction) {
    switch (action.type) {
      case 'create_stage': return `Crear nodo ${action.name || 'nuevo'} (${action.nodeType || 'process'})`;
      case 'update_stage': return `Actualizar nodo ${action.stageId || ''}`;
      case 'delete_stage': return `Eliminar nodo ${action.stageId || ''}`;
      case 'connect_stages': return `Conectar ${action.fromStageId || ''} -> ${action.toStageId || ''}`;
      case 'disconnect_stages': return `Eliminar conexion ${action.transitionId || ''}`;
      default: return 'Mostrar diagrama';
    }
  }

  private queueWorkyRefresh() {
    if (this.workyRefreshTimer) {
      clearTimeout(this.workyRefreshTimer);
    }
    this.workyRefreshTimer = setTimeout(() => void this.refreshWorkySuggestions(), 1200);
  }

  private async refreshWorkySuggestions() {
    if (!this.workflow() || this.workyLoading()) return;
    this.workyLoading.set(true);
    try {
      const result = await firstValueFrom(this.api.post<WorkyResult>('/workflow-ai/sugerenciaworky', this.aiContextPayload()));
      this.workyResult.set(result);
    } catch {
      this.workyResult.set(null);
    } finally {
      this.workyLoading.set(false);
    }
  }

  private aiContextPayload() {
    return {
      workflowId: this.workflow()?.id,
      workflowName: this.workflow()?.name,
      stages: this.workflow()?.stages ?? [],
      transitions: this.workflow()?.transitions ?? [],
      departments: this.departments(),
      jobRoles: this.jobRoles()
    };
  }

  private async applyAiActions(actions: DiagramAiAction[]) {
    const placeholderMap = new Map<string, string>();
    for (const action of actions) {
      switch (action.type) {
        case 'create_stage':
          await this.applyCreateStageAction(action, placeholderMap);
          break;
        case 'update_stage':
          await this.applyUpdateStageAction(action, placeholderMap);
          break;
        case 'delete_stage':
          await this.applyDeleteStageAction(action, placeholderMap);
          break;
        case 'connect_stages':
          await this.applyConnectStagesAction(action, placeholderMap);
          break;
        case 'disconnect_stages':
          await this.applyDisconnectStagesAction(action);
          break;
        default:
          break;
      }
    }
  }

  private async applyCreateStageAction(action: DiagramAiAction, placeholderMap: Map<string, string>) {
    const saved = await firstValueFrom(this.api.post<Stage>('/workflow-stages', {
      workflowId: this.id,
      name: action.name || 'Etapa',
      description: action.description || '',
      order: action.order || ((Math.max(0, ...(this.workflow()?.stages.map(stage => stage.order || 0) ?? [0])) + 1)),
      nodeType: action.nodeType || 'process',
      responsibleDepartmentId: this.departmentIdByName(action.responsibleDepartmentName),
      responsibleJobRoleId: this.jobRoleIdByName(action.responsibleDepartmentName, action.responsibleJobRoleName),
      requiresForm: Boolean(action.requiresForm),
      formDefinition: this.normalizeAiFormDefinition(action.formDefinition),
      avgHours: Number(action.avgHours ?? (action.nodeType === 'process' ? 1 : 0)),
      trueLabel: action.trueLabel || 'Si',
      falseLabel: action.falseLabel || 'No',
      posX: Number(action.posX ?? 120),
      posY: Number(action.posY ?? 120)
    }));
    this.upsertStage(saved);
    if (action.placeholderId) {
      placeholderMap.set(action.placeholderId, saved.id);
    }
  }

  private async applyUpdateStageAction(action: DiagramAiAction, placeholderMap: Map<string, string>) {
    const stageId = this.resolveStageRef(action.stageId, placeholderMap);
    if (!stageId) return;
    const current = this.workflow()?.stages.find(stage => stage.id === stageId);
    const nextType = action.nodeType || current?.nodeType || 'process';
    const requiresForm = action.requiresForm ?? current?.requiresForm ?? false;
    const saved = await firstValueFrom(this.api.patch<Stage>(`/workflow-stages/${stageId}`, {
      name: action.name ?? current?.name ?? 'Etapa',
      description: action.description ?? current?.description ?? '',
      nodeType: nextType,
      responsibleDepartmentId: this.hasActionField(action, 'responsibleDepartmentName')
        ? this.departmentIdByName(action.responsibleDepartmentName)
        : (current?.responsibleDepartmentId ?? null),
      responsibleJobRoleId: this.hasActionField(action, 'responsibleJobRoleName')
        ? this.jobRoleIdByName(action.responsibleDepartmentName ?? current?.responsibleDepartmentName ?? null, action.responsibleJobRoleName)
        : (current?.responsibleJobRoleId ?? null),
      requiresForm,
      formDefinition: this.hasActionField(action, 'formDefinition')
        ? this.normalizeAiFormDefinition(action.formDefinition)
        : (current?.formDefinition ?? null),
      avgHours: Number(action.avgHours ?? current?.avgHours ?? 1),
      trueLabel: action.trueLabel ?? current?.trueLabel ?? 'Si',
      falseLabel: action.falseLabel ?? current?.falseLabel ?? 'No',
      posX: Number(action.posX ?? current?.posX ?? 0),
      posY: Number(action.posY ?? current?.posY ?? 0)
    }));
    this.upsertStage(saved);
  }

  private async applyDeleteStageAction(action: DiagramAiAction, placeholderMap: Map<string, string>) {
    const stageId = this.resolveStageRef(action.stageId, placeholderMap);
    if (!stageId) return;
    await firstValueFrom(this.api.delete<void>(`/workflow-stages/${stageId}`));
    this.removeStage(stageId);
  }

  private async applyConnectStagesAction(action: DiagramAiAction, placeholderMap: Map<string, string>) {
    const fromStageId = this.resolveStageRef(action.fromStageId, placeholderMap);
    const toStageId = this.resolveStageRef(action.toStageId, placeholderMap);
    if (!fromStageId || !toStageId) return;
    const saved = await firstValueFrom(this.api.post<Transition>('/workflow-transitions', {
      workflowId: this.id,
      fromStageId,
      toStageId,
      name: action.name || '',
      forwardConfig: action.forwardConfig ?? null
    }));
    this.upsertTransition(saved);
  }

  private async applyDisconnectStagesAction(action: DiagramAiAction) {
    if (!action.transitionId) return;
    await firstValueFrom(this.api.delete<void>(`/workflow-transitions/${action.transitionId}`));
    this.removeTransition(action.transitionId);
  }

  private resolveStageRef(value: string | undefined, placeholderMap: Map<string, string>) {
    if (!value) return '';
    return placeholderMap.get(value) || value;
  }

  private normalizeAiFormDefinition(formDefinition: DiagramAiAction['formDefinition']) {
    if (!formDefinition) return null;
    return {
      title: formDefinition.title || 'Formulario',
      fields: (formDefinition.fields ?? []).map((field, index) => ({
        id: field.id || this.createFieldId(),
        name: field.name || `campo_${index + 1}`,
        type: field.type || 'TEXT',
        isRequired: Boolean(field.required),
        order: field.order || index + 1
      }))
    };
  }

  private departmentIdByName(name: string | null | undefined) {
    if (!name) return null;
    return this.departments().find(item => item.name.toLowerCase() === String(name).toLowerCase())?.id ?? null;
  }

  private jobRoleIdByName(departmentName: string | null | undefined, roleName: string | null | undefined) {
    if (!roleName) return null;
    const departmentId = this.departmentIdByName(departmentName);
    return this.jobRoles().find(role =>
      role.name.toLowerCase() === String(roleName).toLowerCase() &&
      (!departmentId || role.departmentId === departmentId)
    )?.id ?? null;
  }

  private hasActionField<T extends keyof DiagramAiAction>(action: DiagramAiAction, key: T) {
    return Object.prototype.hasOwnProperty.call(action, key);
  }

  private loadReferenceData() {
    this.api.get<Department[]>('/departments').subscribe({
      next: departments => {
        this.departments.set(departments);
        this.queueWorkyRefresh();
      }
    });
    this.api.get<JobRole[]>('/job-roles').subscribe({
      next: roles => {
        this.jobRoles.set(roles);
        this.queueWorkyRefresh();
      }
    });
  }

  private loadWorkflow() {
    this.api.get<Workflow>(`/workflows/${this.id}`).subscribe({
      next: workflow => {
        this.workflow.set({
          ...workflow,
          stages: workflow.stages.map((stage, index) => ({
            ...stage,
            posX: stage.posX ?? 60 + (index % 4) * 240,
            posY: stage.posY ?? 60 + Math.floor(index / 4) * 180
          }))
        });
        this.loading.set(false);
        this.queueWorkyRefresh();
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudo cargar el workflow', '', { duration: 3000 });
      }
    });
  }

  private createStage(type: NodeType, x: number, y: number) {
    const workflow = this.workflow();
    if (!workflow) return;
    const nextOrder = Math.max(0, ...workflow.stages.map(stage => stage.order || 0)) + 1;
    this.api.post<Stage>('/workflow-stages', {
      workflowId: workflow.id,
      name: type === 'process' ? `Etapa ${nextOrder}` : this.palette.find(item => item.type === type)?.label,
      description: '',
      order: nextOrder,
      nodeType: type,
      responsibleDepartmentId: this.isHumanStage(type) ? this.departments()[0]?.id ?? null : null,
      responsibleJobRoleId: null,
      requiresForm: false,
      avgHours: this.isHumanStage(type) ? 24 : 0,
      isConditional: type === 'decision' || type === 'loop',
      trueLabel: 'Si',
      falseLabel: 'No',
      posX: Math.max(12, x),
      posY: Math.max(12, y)
    }).subscribe({
      next: saved => {
        this.upsertStage(saved);
        this.selectedTransitionId.set(null);
        this.queueWorkyRefresh();
        this.selectStage(saved.id);
      },
      error: err => this.snack.open(err?.error?.message || 'No se pudo crear el nodo', '', { duration: 3000 })
    });
  }

  private createTransition(fromStageId: string, toStageId: string) {
    const validationError = this.validateTransition(fromStageId, toStageId);
    if (validationError) {
      this.snack.open(validationError, '', { duration: 3000 });
      this.connectingFromId.set(null);
      return;
    }

    const source = this.workflow()?.stages.find(stage => stage.id === fromStageId);
    this.api.post<Transition>('/workflow-transitions', {
      workflowId: this.id,
      fromStageId,
      toStageId,
      name: this.defaultTransitionName(source)
    }).subscribe({
      next: saved => {
        this.upsertTransition(saved);
        this.connectingFromId.set(null);
        this.queueWorkyRefresh();
        this.onTransitionClick(saved, new MouseEvent('click'));
      },
      error: err => {
        this.connectingFromId.set(null);
        this.snack.open(err?.error?.message || 'No se pudo crear la conexion', '', { duration: 3000 });
      }
    });
  }

  private validateTransition(fromStageId: string, toStageId: string) {
    const workflow = this.workflow();
    if (!workflow || fromStageId === toStageId) return 'Conexion invalida';
    const from = workflow.stages.find(stage => stage.id === fromStageId);
    const to = workflow.stages.find(stage => stage.id === toStageId);
    if (!from || !to) return 'Conexion invalida';
    const fromType = this.nodeType(from);
    const toType = this.nodeType(to);
    const outgoing = workflow.transitions.filter(transition => transition.fromStageId === fromStageId);
    const incomingToTarget = workflow.transitions.filter(transition => transition.toStageId === toStageId);

    if (workflow.transitions.some(transition => transition.fromStageId === fromStageId && transition.toStageId === toStageId)) return 'Esa conexion ya existe';
    if (toType === 'start') return 'Inicio no recibe conexiones';
    if (fromType === 'end') return 'Fin no puede salir a otro nodo';
    if (fromType === 'start' && outgoing.length >= 1) return 'Inicio solo puede tener una salida';
    if ((toType === 'decision' || toType === 'loop') && incomingToTarget.length >= 1) {
      return `${to.name} solo puede tener una entrada`;
    }
    if ((fromType === 'decision' || fromType === 'loop') && outgoing.length >= 2) {
      return `${from.name} ya tiene sus dos salidas configuradas`;
    }
    if (fromType === 'join' && outgoing.length >= 1) return 'La union solo puede devolver una salida';
    if (toType === 'bifurcasion' && incomingToTarget.length >= 1) return 'La bifurcacion solo puede tener una entrada';
    return '';
  }

  private connectRealtime() {
    this.collab.connect(this.id, {
      onSnapshot: locks => {
        const next = new Map<string, WorkflowStageLock>();
        for (const lock of locks) next.set(lock.stageId, lock);
        this.stageLocks.set(next);
      },
      onStageLocked: lock => {
        const next = new Map(this.stageLocks());
        next.set(lock.stageId, lock);
        this.stageLocks.set(next);
      },
      onStageUnlocked: stageId => {
        const next = new Map(this.stageLocks());
        next.delete(stageId);
        this.stageLocks.set(next);
      },
      onStageMoved: event => {
        if (event.userId === this.collab.getClientId()) return;
        this.updateStageSignal(event.stageId, { posX: event.x, posY: event.y });
      },
      onStageCreated: event => {
        if (event.stage) {
          this.upsertStage(event.stage);
          this.queueWorkyRefresh();
        }
      },
      onStageUpdated: event => {
        if (event.stage) {
          this.upsertStage(event.stage);
          this.queueWorkyRefresh();
        }
      },
      onStageDeleted: event => {
        if (event.stageId) {
          this.removeStage(event.stageId);
          this.queueWorkyRefresh();
        }
      },
      onTransitionCreated: event => {
        if (event.transition) {
          this.upsertTransition(event.transition);
          this.queueWorkyRefresh();
        }
      },
      onTransitionUpdated: event => {
        if (event.transition) {
          this.upsertTransition(event.transition);
          this.queueWorkyRefresh();
        }
      },
      onTransitionDeleted: event => {
        if (event.transitionId) {
          this.removeTransition(event.transitionId);
          this.queueWorkyRefresh();
        }
      },
      onLockDenied: event => {
        const owner = event.lock?.userName ? ` por ${event.lock.userName}` : '';
        this.snack.open(`Ese nodo ya esta bloqueado${owner}`, '', { duration: 2500 });
      }
    });
  }

  private selectStage(stageId: string) {
    this.selectedStageId.set(stageId);
    const stage = this.workflow()?.stages.find(item => item.id === stageId);
    if (!stage) return;
    this.ensureReachableFormsLoaded(stageId);
    this.stageForm = {
      name: stage.name || '',
      description: stage.description || '',
      nodeType: this.nodeType(stage),
      responsibleDepartmentId: stage.responsibleDepartmentId || '',
      responsibleJobRoleId: stage.responsibleJobRoleId || '',
      avgHours: stage.avgHours ?? 1,
      trueLabel: stage.trueLabel || 'Si',
      falseLabel: stage.falseLabel || 'No',
      condition: stage.condition || '',
      requiresForm: Boolean(stage.requiresForm),
      formTitle: stage.formDefinition?.title || 'Formulario',
      formFields: [...(stage.formDefinition?.fields ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(field => ({ ...field }))
    };
    if (stage.requiresForm && !stage.formDefinition) {
      this.loadStageFormDefinition(stageId);
    }
  }

  private upsertStage(stage: Stage | CollaborativeWorkflowStage) {
    const current = this.workflow();
    if (!current) return;
    const fullStage = this.normalizeStage(stage);
    const stages = current.stages.some(item => item.id === fullStage.id)
      ? current.stages.map(item => item.id === fullStage.id ? {
          ...item,
          ...fullStage,
          formDefinition: fullStage.formDefinition ?? item.formDefinition
        } : item)
      : [...current.stages, fullStage].sort((a, b) => a.order - b.order);
    this.workflow.set({ ...current, stages });
    if (this.selectedStageId() === fullStage.id) this.selectStage(fullStage.id);
  }

  private removeStage(stageId: string) {
    const current = this.workflow();
    if (!current) return;
    this.workflow.set({
      ...current,
      stages: current.stages.filter(item => item.id !== stageId),
      transitions: current.transitions.filter(item => item.fromStageId !== stageId && item.toStageId !== stageId)
    });
    if (this.selectedStageId() === stageId || this.connectingFromId() === stageId) this.clearSelection();
  }

  private upsertTransition(transition: Transition | CollaborativeWorkflowTransition) {
    const current = this.workflow();
    if (!current) return;
    const nextTransition = transition as Transition;
    const transitions = current.transitions.some(item => item.id === nextTransition.id)
      ? current.transitions.map(item => item.id === nextTransition.id ? { ...item, ...nextTransition } : item)
      : [...current.transitions, nextTransition];
    this.workflow.set({ ...current, transitions });
    if (this.selectedTransitionId() === nextTransition.id) {
      this.onTransitionClick(nextTransition, new MouseEvent('click'));
    }
  }

  private removeTransition(transitionId: string) {
    const current = this.workflow();
    if (!current) return;
    this.workflow.set({ ...current, transitions: current.transitions.filter(item => item.id !== transitionId) });
    if (this.selectedTransitionId() === transitionId) this.clearSelection();
  }

  private updateStageSignal(stageId: string, patch: Partial<Stage>) {
    const current = this.workflow();
    if (!current) return;
    this.workflow.set({
      ...current,
      stages: current.stages.map(stage => stage.id === stageId ? { ...stage, ...patch } : stage)
    });
  }

  private isLockedByMe(stageId: string) {
    const lock = this.stageLocks().get(stageId);
    return !!lock && lock.userId === this.collab.getClientId();
  }

  private normalizeStage(stage: Stage | CollaborativeWorkflowStage): Stage {
    const typed = stage as Stage;
    return {
      ...typed,
      responsibleDepartmentName: typed.responsibleDepartmentName || this.departments().find(item => item.id === typed.responsibleDepartmentId)?.name,
      requiresForm: typed.requiresForm ?? false,
      avgHours: typed.avgHours ?? 24
    };
  }

  private loadStageFormDefinition(stageId: string) {
    this.api.get<FormDefinition>(`/forms/stage/${stageId}`).subscribe({
      next: formDefinition => {
        const current = this.workflow();
        if (!current) return;
        this.workflow.set({
          ...current,
          stages: current.stages.map(stage => stage.id === stageId ? { ...stage, formDefinition } : stage)
        });
        if (this.selectedStageId() === stageId) {
          const stage = this.workflow()?.stages.find(item => item.id === stageId);
          if (!stage) return;
          this.stageForm = {
            ...this.stageForm,
            requiresForm: true,
            formTitle: formDefinition.title || 'Formulario',
            formFields: [...(formDefinition.fields ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)).map(field => ({ ...field }))
          };
        }
      },
      error: () => {}
    });
  }

  private ensureReachableFormsLoaded(stageId: string, visited = new Set<string>()) {
    const workflow = this.workflow();
    if (!workflow || visited.has(stageId)) return;
    visited.add(stageId);

    const current = workflow.stages.find(stage => stage.id === stageId);
    if (current?.requiresForm && !current.formDefinition) {
      this.loadStageFormDefinition(stageId);
    }

     if (!current || !this.isLogicalStage(current.nodeType)) {
      return;
    }

    for (const transition of workflow.transitions.filter(item => item.toStageId === stageId)) {
      this.ensureReachableFormsLoaded(transition.fromStageId, visited);
    }
  }

  private resolveFieldsAvailableAtStage(stageId: string, visited = new Set<string>()): ResolvedStageField[] {
    const workflow = this.workflow();
    if (!workflow || visited.has(stageId)) return [] as ResolvedStageField[];
    const stage = workflow.stages.find(item => item.id === stageId);
    if (!stage) return [] as ResolvedStageField[];

    const ownFields: ResolvedStageField[] = [...(stage.formDefinition?.fields ?? [])]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(field => ({
        ...field,
        originStageId: stage.id,
        originStageName: stage.name
      }));

    if (!this.isLogicalStage(stage.nodeType)) {
      return ownFields;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(stageId);

    const inheritedFields: ResolvedStageField[] = workflow.transitions
      .filter(transition => transition.toStageId === stageId)
      .flatMap(transition => this.resolveTransitionFields(transition, nextVisited));

    return this.uniqueResolvedFields([...ownFields, ...inheritedFields]);
  }

  private resolveTransitionFields(transition: Transition, visited = new Set<string>()): ResolvedStageField[] {
    const sourceFields: ResolvedStageField[] = this.resolveFieldsAvailableAtStage(transition.fromStageId, visited);
    const mode = transition.forwardConfig?.mode || 'all';
    const selectedNames = new Set(transition.forwardConfig?.fieldNames ?? []);
    return sourceFields.filter((field: ResolvedStageField) => {
      if (mode === 'none') return false;
      if (mode === 'files-only') return field.type === 'FILE';
      if (mode === 'selected') return selectedNames.has(field.name);
      return true;
    });
  }

  private uniqueResolvedFields(fields: ResolvedStageField[]): ResolvedStageField[] {
    const seen = new Set<string>();
    return fields.filter(field => {
      const key = `${field.originStageId}::${field.name}::${field.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private isLogicalStage(nodeType: string | undefined) {
    return ['decision', 'loop', 'bifurcasion', 'join'].includes((nodeType || '').toLowerCase());
  }

  private stageCenter(stageId: string) {
    const stage = this.workflow()?.stages.find(item => item.id === stageId);
    if (!stage) return null;
    const x = stage.posX ?? 0;
    const y = stage.posY ?? 0;
    switch (this.nodeType(stage)) {
      case 'start':
      case 'end':
        return { x: x + 41, y: y + 41 };
      case 'decision':
      case 'loop':
        return { x: x + 52, y: y + 52 };
      case 'bifurcasion':
      case 'join':
        return { x: x + 75, y: y + 8 };
      default:
        return { x: x + 105, y: y + 46 };
    }
  }

  private stageBoxWidth(stage: Pick<Stage, 'nodeType'>) {
    switch (this.nodeType(stage)) {
      case 'start':
      case 'end':
        return 82;
      case 'decision':
      case 'loop':
        return 104;
      case 'bifurcasion':
      case 'join':
        return 150;
      default:
        return 210;
    }
  }

  private stageBoxHeight(stage: Pick<Stage, 'nodeType'>) {
    switch (this.nodeType(stage)) {
      case 'start':
      case 'end':
        return 82;
      case 'decision':
      case 'loop':
        return 104;
      case 'bifurcasion':
      case 'join':
        return 44;
      default:
        return 140;
    }
  }

  private defaultTransitionName(source?: Stage) {
    if (!source) return '';
    const type = this.nodeType(source);
    if (type === 'decision' || type === 'loop') {
      const outgoing = this.workflow()?.transitions.filter(item => item.fromStageId === source.id).length || 0;
      return outgoing === 0 ? (source.trueLabel || 'Si') : (source.falseLabel || 'No');
    }
    return '';
  }

  private createFieldId() {
    return `field-${Math.random().toString(36).slice(2, 10)}`;
  }

  private emptyStageForm(): StageForm {
    return {
      name: '',
      description: '',
      nodeType: 'process',
      responsibleDepartmentId: '',
      responsibleJobRoleId: '',
      avgHours: 24,
      trueLabel: 'Si',
      falseLabel: 'No',
      condition: '',
      requiresForm: false,
      formTitle: 'Formulario',
      formFields: []
    };
  }

  private emptyTransitionForm(): TransitionForm {
    return {
      name: '',
      mode: 'all',
      includeFiles: false,
      fieldNames: []
    };
  }
}
