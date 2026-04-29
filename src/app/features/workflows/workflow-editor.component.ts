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
import { WorkflowAiPanelComponent } from './workflow-ai-panel.component';
import { NodeBehaviorResolver } from './utils/node-behavior-resolver';
import { autoLayoutWorkflowNodos } from './utils/workflow-layout.utils';
import {
  CollaborativeWorkflowNodo,
  CollaborativeWorkflowTransition,
  WorkflowCollaborationService,
  WorkflowNodoLock
} from '../../core/services/workflow-collaboration.service';

type NodeType = 'inicio' | 'proceso' | 'decision' | 'bifurcasion' | 'union' | 'fin' | 'iteracion';
type FieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'FILE' | 'EMAIL' | 'CHECKBOX' | 'GRID';
type GridColumnType = 'TEXT' | 'NUMBER' | 'DATE' | 'EMAIL' | 'CHECKBOX';
type ForwardMode = 'selected' | 'none' | 'all' | 'files-only';

interface Workflow {
  id: string;
  name: string;
  description?: string;
  companyId?: string;
  companyName?: string;
  nodo: Nodo[];
  transitions: Transition[];
}

interface FormField {
  id: string;
  name: string;
  type: FieldType;
  columns?: GridColumn[];
  options?: string[];
  isRequired?: boolean;
  order: number;
}

interface GridColumn {
  id: string;
  name: string;
  type: GridColumnType;
  order: number;
}

interface FormDefinition {
  id?: string;
  title: string;
  fields: FormField[];
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

interface DepartmentLane {
  id: string;
  name: string;
  leftPercent: number;
  widthPercent: number;
  tintClass: string;
  borderClass: string;
}

interface NodoForm {
  name: string;
  description: string;
  nodeType: NodeType;
  responsibleDepartmentId: string;
  responsibleJobRoleId: string;
  avgMinutes: number;
  trueLabel: string;
  falseLabel: string;
  condition: string;
  requiresForm: boolean;
  formTitle: string;
  formFields: FormField[];
}

interface TransitionForm {
  mode: ForwardMode;
  fieldNames: string[];
  includeFiles: boolean;
}

interface ResolvedNodoField extends FormField {
  originNodoId: string;
  originNodoName: string;
}

type SidebarTab = 'inspector' | 'diagram-ai' | 'worky' | 'bottleneck';

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
        type?: GridColumnType;
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
    MatSnackBarModule,
    WorkflowAiPanelComponent
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
                      (click)="assignDepartmentToSelectedNodo(department.id)">
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
                      <marker id="arrow-default" markerWidth="14" markerHeight="10" refX="13" refY="5" orient="auto" markerUnits="userSpaceOnUse">
                        <path d="M0,0 L14,5 L0,10 z" fill="#334155"></path>
                      </marker>
                      <marker id="arrow-selected" markerWidth="14" markerHeight="10" refX="13" refY="5" orient="auto" markerUnits="userSpaceOnUse">
                        <path d="M0,0 L14,5 L0,10 z" fill="#4f46e5"></path>
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
                      @if (transitionLabel(transition); as label) {
                        @if (transitionLabelPosition(transition); as labelPos) {
                          <g class="cursor-pointer" (click)="onTransitionClick(transition, $event)">
                            <rect [attr.x]="labelPos.x - 34" [attr.y]="labelPos.y - 12" width="68" height="24" rx="12"
                                  fill="white"
                                  [attr.stroke]="selectedTransitionId() === transition.id ? '#4f46e5' : '#cbd5e1'"></rect>
                            <text [attr.x]="labelPos.x" [attr.y]="labelPos.y + 4" text-anchor="middle" font-size="11" font-weight="700"
                                  [attr.fill]="selectedTransitionId() === transition.id ? '#4f46e5' : '#334155'">
                              {{ label }}
                            </text>
                          </g>
                        }
                      }
                    }
                  </svg>

                  @for (nodo of workflow()?.nodo || []; track nodo.id) {
                    <div class="absolute left-0 top-0 z-10"
                         cdkDrag
                         [cdkDragFreeDragPosition]="{ x: nodo.posX || 0, y: nodo.posY || 0 }"
                         [cdkDragBoundary]="'.workflow-canvas-boundary'"
                         [cdkDragDisabled]="isLockedByOther(nodo.id)"
                         (cdkDragStarted)="tryLockNodo(nodo.id)"
                         (cdkDragEnded)="onNodoDragEnd(nodo, $event)"
                         (click)="onNodoClick(nodo, $event)">
                      <div [class]="nodeCardClass(nodo)">
                        <button type="button"
                                class="absolute -right-2 -top-2 z-20 flex h-8 w-8 items-center justify-center rounded-full border border-indigo-200 bg-white text-indigo-600 shadow hover:bg-indigo-50"
                                title="Conectar"
                                (click)="iniciarConexion(nodo, $event)">
                          <mat-icon class="!h-4 !w-4 !text-[16px]">add_link</mat-icon>
                        </button>

                        @switch (tipoNodo(nodo)) {
                          @case ('inicio') {
                            <div class="h-[52px] w-[52px] rounded-full bg-slate-900 shadow-md"></div>
                          }
                          @case ('fin') {
                            <div class="flex h-[56px] w-[56px] items-center justify-center rounded-full border-[5px] border-slate-900 bg-white shadow-md">
                              <div class="h-[32px] w-[32px] rounded-full bg-slate-900"></div>
                            </div>
                          }
                          @case ('decision') {
                            <div class="h-[80px] w-[80px] rotate-45 border-[2px] border-slate-700 bg-white shadow"></div>
                          }
                          @case ('iteracion') {
                            <div class="h-[80px] w-[80px] rotate-45 border-[2px] border-slate-700 bg-white shadow"></div>
                          }
                          @case ('bifurcasion') {
                            <div class="h-[8px] w-[120px] rounded bg-slate-900"></div>
                          }
                          @case ('union') {
                            <div class="h-[8px] w-[120px] rounded bg-slate-900"></div>
                          }
                          @default {
                            <div class="flex w-[150px] items-center justify-center rounded-[14px] border-2 border-slate-700 bg-white px-3 py-2.5 shadow-sm">
                              <div class="text-center text-sm font-semibold text-slate-900">{{ nodo.name }}</div>
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

              @if (sidebarTab() === 'inspector' && selectedNodo()) {
                <h3 class="m-0 mb-3 text-lg text-slate-950">Editar nodo</h3>

                @if (incomingFieldsForSelectedNodo().length) {
                  <div class="mb-4 rounded-2xl border border-indigo-200 bg-indigo-50 p-3">
                    <div class="mb-2 text-sm font-semibold text-slate-900">Datos que llegan a este nodo</div>
                    <div class="grid gap-3">
                      @for (block of incomingFieldsForSelectedNodo(); track block.fromNodoName) {
                        <div>
                          <div class="mb-1 text-xs font-bold uppercase tracking-wide text-indigo-700">{{ block.fromNodoName }}</div>
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

                @if (nodoForm.nodeType !== 'decision' && nodoForm.nodeType !== 'iteracion') {
                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Nombre</mat-label>
                    <input matInput [(ngModel)]="nodoForm.name">
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Descripcion</mat-label>
                    <textarea matInput rows="3" [(ngModel)]="nodoForm.description"></textarea>
                  </mat-form-field>
                }

                <mat-form-field appearance="outline" class="w-full">
                  <mat-label>Tipo</mat-label>
                  <mat-select [(ngModel)]="nodoForm.nodeType">
                    @for (item of palette; track item.type) {
                      <mat-option [value]="item.type">{{ item.label }}</mat-option>
                    }
                  </mat-select>
                </mat-form-field>

                @if (esNodoHumano(nodoForm.nodeType)) {
                  <mat-checkbox class="mb-2" [(ngModel)]="nodoForm.requiresForm">Este proceso usa formulario</mat-checkbox>

                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Departamento</mat-label>
                    <mat-select [(ngModel)]="nodoForm.responsibleDepartmentId">
                      <mat-option value="">Sin departamento</mat-option>
                      @for (department of departments(); track department.id) {
                        <mat-option [value]="department.id">{{ department.name }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Cargo</mat-label>
                    <mat-select [(ngModel)]="nodoForm.responsibleJobRoleId">
                      <mat-option value="">Sin cargo</mat-option>
                      @for (role of rolesForDepartment(nodoForm.responsibleDepartmentId); track role.id) {
                        <mat-option [value]="role.id">{{ role.name }}</mat-option>
                      }
                    </mat-select>
                  </mat-form-field>

                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>Promedio en minutos</mat-label>
                    <input matInput type="number" min="1" [(ngModel)]="nodoForm.avgMinutes">
                  </mat-form-field>

                  @if (nodoForm.requiresForm) {
                    <div class="mt-3 rounded-2xl border border-slate-200 p-3">
                      <div class="mb-2 text-sm font-semibold text-slate-900">Formulario</div>
                      <mat-form-field appearance="outline" class="w-full">
                        <mat-label>Titulo del formulario</mat-label>
                        <input matInput [(ngModel)]="nodoForm.formTitle">
                      </mat-form-field>

                      <div class="grid gap-2">
                        @for (field of nodoForm.formFields; track field.id; let i = $index) {
                          <div class="rounded-xl border border-slate-200 p-3">
                            <div class="grid grid-cols-[1fr_110px] gap-2">
                              <mat-form-field appearance="outline" class="w-full">
                                <mat-label>Campo</mat-label>
                                <input matInput [(ngModel)]="field.name">
                              </mat-form-field>
                              <mat-form-field appearance="outline" class="w-full">
                                <mat-label>Tipo</mat-label>
                                <mat-select [ngModel]="field.type" (ngModelChange)="onFieldTypeChange(field, $event)">
                                  @for (type of fieldTypes; track type) {
                                    <mat-option [value]="type">{{ type }}</mat-option>
                                  }
                                </mat-select>
                              </mat-form-field>
                            </div>
                            @if (field.type === 'GRID') {
                              <div class="mt-2 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-2">
                                <div class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-600">Columnas de la grilla</div>
                                <div class="flex flex-col gap-1.5">
                                  @for (column of field.columns || []; track column.id; let j = $index) {
                                    <div class="flex items-center gap-1.5">
                                      <input
                                        class="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-indigo-400"
                                        placeholder="Nombre"
                                        [(ngModel)]="column.name" />
                                      <select
                                        class="w-[90px] shrink-0 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-indigo-400"
                                        [(ngModel)]="column.type">
                                        @for (type of gridColumnTypes; track type) {
                                          <option [value]="type">{{ type }}</option>
                                        }
                                      </select>
                                      <button
                                        type="button"
                                        class="shrink-0 rounded-lg border border-rose-200 bg-rose-50 px-2 py-1.5 text-xs font-medium text-rose-600 hover:bg-rose-100"
                                        (click)="removeGridColumn(field, j)">✕</button>
                                    </div>
                                  }
                                </div>
                                <button mat-stroked-button class="mt-2 w-full" (click)="addGridColumn(field)">
                                  <mat-icon>view_column</mat-icon> Agregar columna
                                </button>
                              </div>
                            }
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

                @if (nodoForm.nodeType === 'decision' || nodoForm.nodeType === 'iteracion') {
                  <div class="grid grid-cols-2 gap-2.5">
                    <mat-form-field appearance="outline">
                      <mat-label>Etiqueta 1</mat-label>
                      <input matInput [(ngModel)]="nodoForm.trueLabel">
                    </mat-form-field>

                    <mat-form-field appearance="outline">
                      <mat-label>Etiqueta 2</mat-label>
                      <input matInput [(ngModel)]="nodoForm.falseLabel">
                    </mat-form-field>
                  </div>

                }

                <div class="mt-3 flex justify-end">
                  <div class="flex gap-2">
                    <button mat-stroked-button color="warn" (click)="removeSelected()">
                      <mat-icon>delete</mat-icon> Eliminar nodo
                    </button>
                    <button mat-flat-button color="primary" (click)="saveNodo()">Guardar nodo</button>
                  </div>
                </div>
              } @else if (sidebarTab() === 'inspector' && selectedTransition()) {
                <h3 class="m-0 mb-3 text-lg text-slate-950">Editar conexion</h3>
                <div class="mb-3 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600">
                  {{ sourceNodoName(selectedTransition()!) }} -> {{ targetNodoName(selectedTransition()!) }}
                </div>

                    <mat-form-field appearance="outline" class="w-full">
                      <mat-label>Que parte del formulario pasa</mat-label>
                      <mat-select [(ngModel)]="transitionForm.mode">
                        <mat-option value="none">No pasar campos</mat-option>
                        <mat-option value="all">Pasar todo el formulario</mat-option>
                        <mat-option value="selected">Seleccionar campos</mat-option>
                        <mat-option value="files-only">Solo archivos</mat-option>
                      </mat-select>
                    </mat-form-field>

                  @if (transitionForm.mode === 'selected' || transitionForm.mode === 'all') {
                    <mat-checkbox class="mb-3" [(ngModel)]="transitionForm.includeFiles">
                      Incluir archivos
                    </mat-checkbox>
                  }

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
              } @else if (sidebarTab() === 'diagram-ai' || sidebarTab() === 'worky' || sidebarTab() === 'bottleneck') {
                <app-workflow-ai-panel
                  [activeTab]="sidebarTab()"
                  [workflowId]="workflow()?.id || ''"
                  [workflowName]="workflow()?.name || ''"
                  [nodo]="workflow()?.nodo || []"
                  [transitions]="workflow()?.transitions || []"
                  [departments]="departments()"
                  [jobRoles]="jobRoles()"
                  [applyAiActions]="applyAiActionsBound"
                  [onError]="showAiError">
                </app-workflow-ai-panel>
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
  private nodeBehaviorResolver = new NodeBehaviorResolver();

  readonly fieldTypes: FieldType[] = ['TEXT', 'NUMBER', 'DATE', 'FILE', 'EMAIL', 'CHECKBOX', 'GRID'];
  readonly gridColumnTypes: GridColumnType[] = ['TEXT', 'NUMBER', 'DATE', 'EMAIL', 'CHECKBOX'];
  readonly palette = [
    { type: 'inicio' as NodeType, label: 'Inicio', icon: 'play_circle' },
    { type: 'proceso' as NodeType, label: 'Proceso', icon: 'settings' },
    { type: 'decision' as NodeType, label: 'Decision', icon: 'diamond' },
    { type: 'bifurcasion' as NodeType, label: 'Bifurcacion', icon: 'call_split' },
    { type: 'union' as NodeType, label: 'Union', icon: 'merge' },
    { type: 'iteracion' as NodeType, label: 'Iteracion', icon: 'refresh' },
    { type: 'fin' as NodeType, label: 'Fin', icon: 'stop_circle' }
  ];

  id = '';
  loading = signal(true);
  workflow = signal<Workflow | null>(null);
  departments = signal<Department[]>([]);
  jobRoles = signal<JobRole[]>([]);
  draggingPalette = signal(false);
  nodoLocks = signal(new Map<string, WorkflowNodoLock>());
  selectedNodoId = signal<string | null>(null);
  selectedTransitionId = signal<string | null>(null);
  connectingFromId = signal<string | null>(null);
  sidebarTab = signal<SidebarTab>('inspector');
  readonly applyAiActionsBound = (actions: DiagramAiAction[]) => this.applyAiActions(actions);
  readonly showAiError = (message: string) => this.snack.open(message, '', { duration: 3500 });

  selectedNodo = computed(() => this.workflow()?.nodo.find(nodo => nodo.id === this.selectedNodoId()) ?? null);
  selectedTransition = computed(() => this.workflow()?.transitions.find(transition => transition.id === this.selectedTransitionId()) ?? null);
  availableForwardFields = computed(() => {
    const transition = this.selectedTransition();
    if (!transition) return [] as ResolvedNodoField[];
    return this.resolveFieldsAvailableAtNodo(transition.fromNodoId);
  });
    resolvedForwardFields = computed(() => this.filterForwardFields(this.availableForwardFields(), this.transitionForm));
  incomingFieldsForSelectedNodo = computed(() => {
    const nodo = this.selectedNodo();
    const workflow = this.workflow();
    if (!nodo || !workflow) return [] as Array<{ fromNodoName: string; fields: ResolvedNodoField[] }>;
    return workflow.transitions
      .filter(transition => transition.toNodoId === nodo.id)
      .map(transition => {
        const fromNodoName = workflow.nodo.find(candidate => candidate.id === transition.fromNodoId)?.name || 'Origen';
        return {
          fromNodoName,
          fields: this.resolveTransitionFields(transition)
        };
      })
      .filter(block => block.fields.length > 0);
  });
  visibleLanes = computed(() => {
    const nodoDepartmentIds = this.workflow()?.nodo
      .map(nodo => nodo.responsibleDepartmentId)
      .filter((departmentId): departmentId is string => !!departmentId) ?? [];
    const orderedIds = [...new Set(nodoDepartmentIds)];
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
    const nodo = this.workflow()?.nodo ?? [];
    const laneCount = Math.max(this.visibleLanes().length, 1);
    const lanesWidth = laneCount * 300;
    const maxNodoRight = nodo.reduce((max, nodo) => {
      const width = this.nodoBoxWidth(nodo);
      return Math.max(max, (nodo.posX ?? 0) + width + 120);
    }, 0);
    return Math.max(1200, lanesWidth, maxNodoRight);
  });
  canvasHeight = computed(() => {
    const nodo = this.workflow()?.nodo ?? [];
    const maxNodoBottom = nodo.reduce((max, nodo) => {
      const height = this.nodoBoxHeight(nodo);
      return Math.max(max, (nodo.posY ?? 0) + height + 120);
    }, 0);
    return Math.max(720, maxNodoBottom);
  });

  nodoForm: NodoForm = this.emptyNodoForm();
  transitionForm: TransitionForm = this.emptyTransitionForm();

  ngOnInit() {
    this.id = this.route.snapshot.paramMap.get('id') || '';
    this.loadReferenceData();
    this.loadWorkflow();
    this.connectRealtime();
  }

  ngOnDestroy() {
    const selectedNodoId = this.selectedNodoId();
    if (selectedNodoId && this.isLockedByMe(selectedNodoId)) {
      this.collab.unlockNodo(selectedNodoId);
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
    this.createNodo(type, event.clientX - rect.left, event.clientY - rect.top);
  }

  onNodoClick(nodo: Nodo, event: MouseEvent) {
    event.stopPropagation();
    if (this.connectingFromId() && this.connectingFromId() !== nodo.id) {
      this.createTransition(this.connectingFromId()!, nodo.id);
      return;
    }
    if (this.isLockedByOther(nodo.id)) return;
    this.tryLockNodo(nodo.id);
    this.selectedTransitionId.set(null);
    this.sidebarTab.set('inspector');
    this.selectNodo(nodo.id);
  }

  iniciarConexion(nodo: Nodo, event: MouseEvent) {
    event.stopPropagation();
    this.selectedNodoId.set(null);
    this.selectedTransitionId.set(null);
    this.connectingFromId.set(nodo.id);
  }

  cancelConnect() {
    this.connectingFromId.set(null);
  }

  onTransitionClick(transition: Transition, event: MouseEvent) {
    event.stopPropagation();
    this.selectedNodoId.set(null);
    this.selectedTransitionId.set(transition.id);
    this.connectingFromId.set(null);
    this.sidebarTab.set('inspector');
    this.ensureReachableFormsLoaded(transition.fromNodoId);
    this.transitionForm = {
      mode: this.normalizeForwardMode(transition.forwardConfig?.mode),
      fieldNames: [...(transition.forwardConfig?.fieldNames ?? [])],
      includeFiles: Boolean(transition.forwardConfig?.includeFiles)
    };
  }

  onNodoDragEnd(nodo: Nodo, event: CdkDragEnd) {
    const position = event.source.getFreeDragPosition();
    this.updateNodoignal(nodo.id, { posX: position.x, posY: position.y });
    this.api.patch<Nodo>(`/workflow-nodos/${nodo.id}`, {
      posX: position.x,
      posY: position.y
    }).subscribe({
      next: saved => this.upsertNodo(saved),
      error: () => this.snack.open('No se pudo guardar la posicion', '', { duration: 2500 })
    });
  }

  clearSelection() {
    const selectedNodoId = this.selectedNodoId();
    if (selectedNodoId && this.isLockedByMe(selectedNodoId)) {
      this.collab.unlockNodo(selectedNodoId);
    }
    this.selectedNodoId.set(null);
    this.selectedTransitionId.set(null);
    this.connectingFromId.set(null);
  }

  removeSelected() {
    const nodo = this.selectedNodo();
    if (nodo) {
    this.api.delete<void>(`/workflow-nodos/${nodo.id}`).subscribe({
        next: () => {
          this.removeNodo(nodo.id);
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
      },
      error: err => this.snack.open(err?.error?.message || 'No se pudo eliminar la conexion', '', { duration: 3000 })
    });
  }

  saveNodo() {
    const nodo = this.selectedNodo();
    if (!nodo) return;
    const nodoProceso = this.esNodoHumano(this.nodoForm.nodeType);
    const requiresForm = nodoProceso && this.nodoForm.requiresForm;
    const formDefinition: FormDefinition | null = requiresForm ? {
      title: this.nodoForm.formTitle || 'Formulario',
      fields: this.nodoForm.formFields.map((field, index) => ({
        id: field.id || this.createFieldId(),
        name: field.name,
        type: field.type,
        columns: field.type === 'GRID'
          ? this.normalizeGridColumns(field.columns)
          : [],
        isRequired: Boolean(field.isRequired),
        order: index + 1
      }))
    } : null;

    this.api.patch<Nodo>(`/workflow-nodos/${nodo.id}`, {
      name: this.nodoForm.name.trim() || 'Etapa',
      description: this.nodoForm.description,
      nodeType: this.nodoForm.nodeType,
      responsibleDepartmentId: nodoProceso ? this.nodoForm.responsibleDepartmentId || null : null,
      responsibleJobRoleId: nodoProceso ? this.nodoForm.responsibleJobRoleId || null : null,
      avgMinutes: nodoProceso ? Number(this.nodoForm.avgMinutes || 1) : 0,
      condition: this.nodoForm.condition,
      trueLabel: this.nodoForm.trueLabel,
      falseLabel: this.nodoForm.falseLabel,
      requiresForm,
      formDefinition,
      posX: nodo.posX ?? 0,
      posY: nodo.posY ?? 0
    }).subscribe({
      next: saved => {
        this.upsertNodo({
          ...nodo,
          ...saved,
          trueLabel: this.nodoForm.trueLabel,
          falseLabel: this.nodoForm.falseLabel,
          requiresForm,
          formDefinition: formDefinition ?? undefined
        });
        this.snack.open('Nodo actualizado', '', { duration: 1800 });
      },
      error: err => this.snack.open(err?.error?.message || 'Error al guardar el nodo', '', { duration: 3000 })
    });
  }

  saveTransition() {
      const transition = this.selectedTransition();
      if (!transition) return;
      this.api.patch<Transition>(`/workflow-transitions/${transition.id}`, {
        forwardConfig: {
          mode: this.transitionForm.mode,
          fieldNames: this.transitionForm.mode === 'selected' ? this.transitionForm.fieldNames : [],
          includeFiles: this.transitionForm.mode === 'files-only' || this.transitionForm.includeFiles
        }
      }).subscribe({
      next: saved => {
        this.upsertTransition(saved);
        this.snack.open('Conexion actualizada', '', { duration: 1800 });
      },
      error: err => this.snack.open(err?.error?.message || 'Error al guardar la conexion', '', { duration: 3000 })
    });
  }

  addFormField() {
    this.nodoForm.formFields = [
      ...this.nodoForm.formFields,
      { id: this.createFieldId(), name: `campo_${this.nodoForm.formFields.length + 1}`, type: 'TEXT', columns: [], isRequired: false, order: this.nodoForm.formFields.length + 1 }
    ];
  }

  removeFormField(index: number) {
    this.nodoForm.formFields = this.nodoForm.formFields.filter((_, i) => i !== index).map((field, i) => ({ ...field, order: i + 1 }));
  }

  onFieldTypeChange(field: FormField, type: FieldType) {
    field.type = type;
    field.columns = type === 'GRID'
      ? this.normalizeGridColumns(field.columns?.length ? field.columns : [this.createGridColumn(1)])
      : [];
  }

  addGridColumn(field: FormField) {
    field.columns = [
      ...(field.columns ?? []),
      this.createGridColumn((field.columns?.length ?? 0) + 1)
    ];
  }

  removeGridColumn(field: FormField, index: number) {
    field.columns = this.normalizeGridColumns((field.columns ?? []).filter((_, i) => i !== index));
  }

  toggleForwardField(fieldName: string, checked: boolean) {
    const next = new Set(this.transitionForm.fieldNames);
    if (checked) next.add(fieldName); else next.delete(fieldName);
    this.transitionForm = { ...this.transitionForm, fieldNames: [...next] };
  }

  assignDepartmentToSelectedNodo(departmentId: string) {
    const nodo = this.selectedNodo();
    if (!nodo || !this.esNodoHumano(nodo.nodeType)) {
      this.snack.open('Selecciona un proceso para moverlo a esa calle', '', { duration: 2200 });
      return;
    }
    this.nodoForm = {
      ...this.nodoForm,
      responsibleDepartmentId: departmentId,
      responsibleJobRoleId: this.rolesForDepartment(departmentId).some(role => role.id === this.nodoForm.responsibleJobRoleId)
        ? this.nodoForm.responsibleJobRoleId
        : ''
    };
    this.saveNodo();
  }

  esNodoHumano(type: string | undefined) {
    return this.nodeBehaviorResolver.resolve(type).isHuman;
  }

  rolesForDepartment(departmentId: string) {
    return departmentId ? this.jobRoles().filter(role => role.departmentId === departmentId) : this.jobRoles();
  }

  isLaneVisible(departmentId: string) {
    return this.visibleLanes().some(lane => lane.id === departmentId);
  }

  tipoNodo(nodo: Pick<Nodo, 'nodeType'>) {
    return this.nodeBehaviorResolver.resolveType(nodo) as NodeType;
  }

  nodeCardClass(nodo: Nodo) {
    const selected = this.selectedNodoId() === nodo.id ? 'ring-4 ring-indigo-200 ' : '';
    const connecting = this.connectingFromId() === nodo.id ? 'ring-4 ring-emerald-200 ' : '';
    const locked = this.isLockedByOther(nodo.id) ? 'opacity-60 cursor-not-allowed ' : 'cursor-pointer ';
    return `${selected}${connecting}${locked}relative transition`;
  }

  transitionPath(transition: Transition) {
    const source = this.nodoCenter(transition.fromNodoId);
    const target = this.nodoCenter(transition.toNodoId);
    if (!source || !target) return '';
    const fromNodo = this.workflow()?.nodo.find(n => n.id === transition.fromNodoId);
    const fromType = fromNodo ? this.tipoNodo(fromNodo) : '';
    let from: { x: number; y: number };
    if ((fromType === 'decision' || fromType === 'iteracion') && fromNodo) {
      const hw = this.nodeBehaviorResolver.resolve(fromNodo).width / 2;
      from = target.x >= source.x
        ? { x: source.x + hw, y: source.y }
        : { x: source.x - hw, y: source.y };
    } else {
      from = this.nodoEdgePoint(transition.fromNodoId, target.x, target.y) ?? source;
    }
    const to = this.nodoEdgePoint(transition.toNodoId, source.x, source.y) ?? target;
    return `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
  }

  transitionLabel(transition: Transition): string | null {
    const src = this.workflow()?.nodo.find(n => n.id === transition.fromNodoId);
    const workflow = this.workflow();
    if (!src) return null;
    const type = this.tipoNodo(src);
    if (type !== 'decision' && type !== 'iteracion') return null;
    const outgoingTransitions = (workflow?.transitions ?? []).filter(item => item.fromNodoId === transition.fromNodoId);
    const transitionIndex = outgoingTransitions.findIndex(item => item.id === transition.id);
    if (transitionIndex === 0) {
      return src.trueLabel || 'Si';
    }
    if (transitionIndex === 1) {
      return src.falseLabel || 'No';
    }
    const sc = this.nodoCenter(transition.fromNodoId);
    const tc = this.nodoCenter(transition.toNodoId);
    if (!sc || !tc) return src.trueLabel || 'Si';
    return tc.x >= sc.x ? (src.trueLabel || 'Si') : (src.falseLabel || 'No');
  }

  transitionLabelPosition(transition: Transition) {
    const source = this.nodoCenter(transition.fromNodoId);
    const target = this.nodoCenter(transition.toNodoId);
    if (!source || !target) return null;
    return { x: (source.x + target.x) / 2, y: (source.y + target.y) / 2 };
  }

  private nodoEdgePoint(nodoId: string, fromX: number, fromY: number): { x: number; y: number } | null {
    const center = this.nodoCenter(nodoId);
    if (!center) return null;
    const nodo = this.workflow()?.nodo.find(item => item.id === nodoId);
    if (!nodo) return null;
    const dx = fromX - center.x;
    const dy = fromY - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return center;
    const nx = dx / dist;
    const ny = dy / dist;
    const type = this.tipoNodo(nodo);
    if (type === 'inicio' || type === 'fin') {
      const r = this.nodeBehaviorResolver.resolve(nodo).width / 2;
      return { x: center.x + nx * r, y: center.y + ny * r };
    }
    const hw = this.nodeBehaviorResolver.resolve(nodo).width / 2;
    const hh = Math.max(this.nodeBehaviorResolver.resolve(nodo).height / 2, 8);
    const tx = nx !== 0 ? Math.abs(hw / nx) : Infinity;
    const ty = ny !== 0 ? Math.abs(hh / ny) : Infinity;
    const t = Math.min(tx, ty);
    return { x: center.x + nx * t, y: center.y + ny * t };
  }

  sourceNodoName(transition: Transition) {
    return this.workflow()?.nodo.find(nodo => nodo.id === transition.fromNodoId)?.name || 'Origen';
  }

  targetNodoName(transition: Transition) {
    return this.workflow()?.nodo.find(nodo => nodo.id === transition.toNodoId)?.name || 'Destino';
  }

  tryLockNodo(nodoId: string) {
    if (this.isLockedByOther(nodoId)) return;
    const selected = this.selectedNodoId();
    if (selected && selected !== nodoId && this.isLockedByMe(selected)) {
      this.collab.unlockNodo(selected);
    }
    if (!this.isLockedByMe(nodoId)) {
      this.collab.lockNodo(nodoId);
    }
  }

  isLockedByOther(nodoId: string) {
    const lock = this.nodoLocks().get(nodoId);
    return !!lock && lock.userId !== this.collab.getClientId();
  }

  private async applyAiActions(actions: DiagramAiAction[]) {
    const placeholderMap = new Map<string, string>();
    let shouldRelayout = false;
    for (const action of actions) {
      switch (action.type) {
        case 'create_department':
          await this.applyCreateDepartmentAction(action);
          break;
        case 'create_job_role':
          await this.applyCreateJobRoleAction(action);
          break;
        case 'create_nodo':
          await this.applyCreateNodoAction(action, placeholderMap);
          shouldRelayout = true;
          break;
        case 'update_nodo':
          await this.applyUpdateNodoAction(action, placeholderMap);
          shouldRelayout = true;
          break;
        case 'delete_nodo':
          await this.applyDeleteNodoAction(action, placeholderMap);
          shouldRelayout = true;
          break;
        case 'connect_nodo':
          await this.applyConnectNodoAction(action, placeholderMap);
          shouldRelayout = true;
          break;
        case 'disconnect_nodo':
          await this.applyDisconnectNodoAction(action);
          shouldRelayout = true;
          break;
        default:
          break;
      }
    }
    if (shouldRelayout) {
      await this.autoLayoutWorkflow();
    }
  }

  private async applyCreateDepartmentAction(action: DiagramAiAction) {
    const name = String(action.name || '').trim();
    if (!name) return;
    const existing = this.departments().find(item => item.name.toLowerCase() === name.toLowerCase());
    if (existing) return;
    const companyId = this.workflow()?.companyId || this.departments()[0]?.companyId;
    if (!companyId) {
      throw new Error('No se encontro la empresa para crear el departamento');
    }
    const saved = await firstValueFrom(this.api.post<Department>('/departments', { companyId, name }));
    this.departments.set([...this.departments(), saved].sort((a, b) => a.name.localeCompare(b.name)));
  }

  private async applyCreateJobRoleAction(action: DiagramAiAction) {
    const name = String(action.name || '').trim();
    if (!name) return;
    const departmentId = this.departmentIdByName(action.departmentName || action.responsibleDepartmentName);
    if (!departmentId) {
      throw new Error(`No se encontro el departamento ${action.departmentName || action.responsibleDepartmentName || ''} para crear el rol`);
    }
    const existing = this.jobRoles().find(role =>
      role.departmentId === departmentId &&
      role.name.toLowerCase() === name.toLowerCase()
    );
    if (existing) return;
    const saved = await firstValueFrom(this.api.post<JobRole>('/job-roles', { departmentId, name }));
    this.jobRoles.set([...this.jobRoles(), saved].sort((a, b) => a.name.localeCompare(b.name)));
  }

  private async applyCreateNodoAction(action: DiagramAiAction, placeholderMap: Map<string, string>) {
    const saved = await firstValueFrom(this.api.post<Nodo>('/workflow-nodos', {
      workflowId: this.id,
      name: action.name || 'Etapa',
      description: action.description || '',
      order: action.order || ((Math.max(0, ...(this.workflow()?.nodo.map(nodo => nodo.order || 0) ?? [0])) + 1)),
      nodeType: action.nodeType || 'proceso',
      responsibleDepartmentId: this.departmentIdByName(action.responsibleDepartmentName),
      responsibleJobRoleId: this.jobRoleIdByName(action.responsibleDepartmentName, action.responsibleJobRoleName),
      requiresForm: Boolean(action.requiresForm),
      formDefinition: this.normalizeAiFormDefinition(action.formDefinition),
      avgMinutes: Number(action.avgMinutes ?? (action.nodeType === 'proceso' ? 60 : 0)),
      trueLabel: action.trueLabel || 'Si',
      falseLabel: action.falseLabel || 'No',
      posX: Number(action.posX ?? 120),
      posY: Number(action.posY ?? 120)
    }));
    this.upsertNodo(saved);
    if (action.placeholderId) {
      placeholderMap.set(action.placeholderId, saved.id);
    }
  }

  private async applyUpdateNodoAction(action: DiagramAiAction, placeholderMap: Map<string, string>) {
    const nodoId = this.resolveNodoRef(action.nodoId, placeholderMap);
    if (!nodoId) return;
    const current = this.workflow()?.nodo.find(nodo => nodo.id === nodoId);
    const nextType = action.nodeType || current?.nodeType || 'proceso';
    const requiresForm = action.requiresForm ?? current?.requiresForm ?? false;
    const saved = await firstValueFrom(this.api.patch<Nodo>(`/workflow-nodos/${nodoId}`, {
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
      avgMinutes: Number(action.avgMinutes ?? current?.avgMinutes ?? 60),
      trueLabel: action.trueLabel ?? current?.trueLabel ?? 'Si',
      falseLabel: action.falseLabel ?? current?.falseLabel ?? 'No',
      posX: Number(action.posX ?? current?.posX ?? 0),
      posY: Number(action.posY ?? current?.posY ?? 0)
    }));
    this.upsertNodo(saved);
  }

  private async applyDeleteNodoAction(action: DiagramAiAction, placeholderMap: Map<string, string>) {
    const nodoId = this.resolveNodoRef(action.nodoId, placeholderMap);
    if (!nodoId) return;
    await firstValueFrom(this.api.delete<void>(`/workflow-nodos/${nodoId}`));
    this.removeNodo(nodoId);
  }

  private async applyConnectNodoAction(action: DiagramAiAction, placeholderMap: Map<string, string>) {
    const fromNodoId = this.resolveNodoRef(action.fromNodoId, placeholderMap);
    const toNodoId = this.resolveNodoRef(action.toNodoId, placeholderMap);
    if (!fromNodoId || !toNodoId) return;
    const saved = await firstValueFrom(this.api.post<Transition>('/workflow-transitions', {
      workflowId: this.id,
      fromNodoId,
      toNodoId,
      name: action.name || '',
      forwardConfig: action.forwardConfig ?? null
    }));
    this.upsertTransition(saved);
  }

  private async applyDisconnectNodoAction(action: DiagramAiAction) {
    if (!action.transitionId) return;
    await firstValueFrom(this.api.delete<void>(`/workflow-transitions/${action.transitionId}`));
    this.removeTransition(action.transitionId);
  }

  private resolveNodoRef(value: string | undefined, placeholderMap: Map<string, string>) {
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
        columns: field.type === 'GRID' ? this.normalizeGridColumns(field.columns) : [],
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
        this.departments.set([...departments].sort((a, b) => a.name.localeCompare(b.name)));
      }
    });
    this.api.get<JobRole[]>('/job-roles').subscribe({
      next: roles => {
        this.jobRoles.set([...roles].sort((a, b) => a.name.localeCompare(b.name)));
      }
    });
  }

  private loadWorkflow() {
    this.api.get<Workflow>(`/workflows/${this.id}`).subscribe({
      next: workflow => {
        this.workflow.set({
          ...workflow,
          nodo: workflow.nodo.map((nodo, index) => ({
            ...nodo,
            posX: nodo.posX ?? 60 + (index % 4) * 240,
            posY: nodo.posY ?? 60 + Math.floor(index / 4) * 180
          }))
        });
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('No se pudo cargar el workflow', '', { duration: 3000 });
      }
    });
  }

  private createNodo(type: NodeType, x: number, y: number) {
    const workflow = this.workflow();
    if (!workflow) return;
    const nextOrder = Math.max(0, ...workflow.nodo.map(nodo => nodo.order || 0)) + 1;
    this.api.post<Nodo>('/workflow-nodos', {
      workflowId: workflow.id,
      name: type === 'proceso' ? `Etapa ${nextOrder}` : this.palette.find(item => item.type === type)?.label,
      description: '',
      order: nextOrder,
      nodeType: type,
      responsibleDepartmentId: this.esNodoHumano(type) ? this.departments()[0]?.id ?? null : null,
      responsibleJobRoleId: null,
      requiresForm: false,
      avgMinutes: this.esNodoHumano(type) ? 60 : 0,
      isConditional: type === 'decision' || type === 'iteracion',
      trueLabel: 'Si',
      falseLabel: 'No',
      posX: Math.max(12, x),
      posY: Math.max(12, y)
    }).subscribe({
      next: saved => {
        this.upsertNodo(saved);
        this.selectedTransitionId.set(null);
        this.selectNodo(saved.id);
      },
      error: err => this.snack.open(err?.error?.message || 'No se pudo crear el nodo', '', { duration: 3000 })
    });
  }

  private createTransition(fromNodoId: string, toNodoId: string) {
    const validationError = this.validateTransition(fromNodoId, toNodoId);
    if (validationError) {
      this.snack.open(validationError, '', { duration: 3000 });
      this.connectingFromId.set(null);
      return;
    }

    const source = this.workflow()?.nodo.find(nodo => nodo.id === fromNodoId);
    this.api.post<Transition>('/workflow-transitions', {
      workflowId: this.id,
      fromNodoId,
      toNodoId,
      name: this.defaultTransitionName(source)
    }).subscribe({
      next: saved => {
        this.upsertTransition(saved);
        this.connectingFromId.set(null);
        this.onTransitionClick(saved, new MouseEvent('click'));
      },
      error: err => {
        this.connectingFromId.set(null);
        this.snack.open(err?.error?.message || 'No se pudo crear la conexion', '', { duration: 3000 });
      }
    });
  }

  private validateTransition(fromNodoId: string, toNodoId: string) {
    const workflow = this.workflow();
    if (!workflow || fromNodoId === toNodoId) return 'Conexion invalida';
    const from = workflow.nodo.find(nodo => nodo.id === fromNodoId);
    const to = workflow.nodo.find(nodo => nodo.id === toNodoId);
    if (!from || !to) return 'Conexion invalida';
    const fromType = this.tipoNodo(from);
    const toType = this.tipoNodo(to);
    const outgoing = workflow.transitions.filter(transition => transition.fromNodoId === fromNodoId);
    const incomingToTarget = workflow.transitions.filter(transition => transition.toNodoId === toNodoId);

    if (workflow.transitions.some(transition => transition.fromNodoId === fromNodoId && transition.toNodoId === toNodoId)) return 'Esa conexion ya existe';
    if (toType === 'inicio') return 'Inicio no recibe conexiones';
    if (fromType === 'fin') return 'Fin no puede salir a otro nodo';
    if (fromType === 'inicio' && toType !== 'proceso') return 'Inicio solo puede conectarse a un Proceso';
    if (toType === 'fin' && fromType !== 'proceso') return 'Fin solo puede recibir conexion desde un Proceso';
    if (fromType === 'inicio' && outgoing.length >= 1) return 'Inicio solo puede tener una salida';
    if ((toType === 'decision' || toType === 'iteracion') && incomingToTarget.length >= 1) {
      return `${to.name} solo puede tener una entrada`;
    }
    if ((fromType === 'decision' || fromType === 'iteracion') && outgoing.length >= 2) {
      return `${from.name} ya tiene sus dos salidas configuradas`;
    }
    if (fromType === 'union' && outgoing.length >= 1) return 'La union solo puede devolver una salida';
    if (toType === 'bifurcasion' && incomingToTarget.length >= 1) return 'La bifurcacion solo puede tener una entrada';
    return '';
  }

  private connectRealtime() {
    this.collab.connect(this.id, {
      onSnapshot: locks => {
        const next = new Map<string, WorkflowNodoLock>();
        for (const lock of locks) next.set(lock.nodoId, lock);
        this.nodoLocks.set(next);
      },
      onNodoLocked: lock => {
        const next = new Map(this.nodoLocks());
        next.set(lock.nodoId, lock);
        this.nodoLocks.set(next);
      },
      onNodoUnlocked: nodoId => {
        const next = new Map(this.nodoLocks());
        next.delete(nodoId);
        this.nodoLocks.set(next);
      },
      onNodoMoved: event => {
        if (event.userId === this.collab.getClientId()) return;
        this.updateNodoignal(event.nodoId, { posX: event.x, posY: event.y });
      },
      onNodoCreated: event => {
        if (event.nodo) {
          this.upsertNodo(event.nodo);
        }
      },
      onNodoUpdated: event => {
        if (event.nodo) {
          this.upsertNodo(event.nodo);
        }
      },
      onNodoDeleted: event => {
        if (event.nodoId) {
          this.removeNodo(event.nodoId);
        }
      },
      onTransitionCreated: event => {
        if (event.transition) {
          this.upsertTransition(event.transition);
        }
      },
      onTransitionUpdated: event => {
        if (event.transition) {
          this.upsertTransition(event.transition);
        }
      },
      onTransitionDeleted: event => {
        if (event.transitionId) {
          this.removeTransition(event.transitionId);
        }
      },
      onLockDenied: event => {
        const owner = event.lock?.userName ? ` por ${event.lock.userName}` : '';
        this.snack.open(`Ese nodo ya esta bloqueado${owner}`, '', { duration: 2500 });
      }
    });
  }

  private selectNodo(nodoId: string) {
    this.selectedNodoId.set(nodoId);
    const nodo = this.workflow()?.nodo.find(item => item.id === nodoId);
    if (!nodo) return;
    this.ensureReachableFormsLoaded(nodoId);
    this.nodoForm = {
      name: nodo.name || '',
      description: nodo.description || '',
      nodeType: this.tipoNodo(nodo),
      responsibleDepartmentId: nodo.responsibleDepartmentId || '',
      responsibleJobRoleId: nodo.responsibleJobRoleId || '',
      avgMinutes: nodo.avgMinutes ?? 60,
      trueLabel: nodo.trueLabel || 'Si',
      falseLabel: nodo.falseLabel || 'No',
      condition: nodo.condition || '',
      requiresForm: Boolean(nodo.requiresForm),
      formTitle: nodo.formDefinition?.title || 'Formulario',
      formFields: [...(nodo.formDefinition?.fields ?? [])]
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
        .map(field => ({ ...field, columns: this.normalizeGridColumns(field.columns) }))
    };
    if (nodo.requiresForm && !nodo.formDefinition) {
      this.loadNodoFormDefinition(nodoId);
    }
  }

  private upsertNodo(nodo: Nodo | CollaborativeWorkflowNodo) {
    const current = this.workflow();
    if (!current) return;
    const fullNodo = this.normalizeNodo(nodo);
    const nextNodo = current.nodo.some(item => item.id === fullNodo.id)
      ? current.nodo.map(item => item.id === fullNodo.id ? {
          ...item,
          ...fullNodo,
          formDefinition: fullNodo.formDefinition ?? item.formDefinition
        } : item)
      : [...current.nodo, fullNodo].sort((a, b) => a.order - b.order);
    this.workflow.set({ ...current, nodo: nextNodo });
    if (this.selectedNodoId() === fullNodo.id) this.selectNodo(fullNodo.id);
  }

  private removeNodo(nodoId: string) {
    const current = this.workflow();
    if (!current) return;
    this.workflow.set({
      ...current,
      nodo: current.nodo.filter(item => item.id !== nodoId),
      transitions: current.transitions.filter(item => item.fromNodoId !== nodoId && item.toNodoId !== nodoId)
    });
    if (this.selectedNodoId() === nodoId || this.connectingFromId() === nodoId) this.clearSelection();
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

  private updateNodoignal(nodoId: string, patch: Partial<Nodo>) {
    const current = this.workflow();
    if (!current) return;
    this.workflow.set({
      ...current,
      nodo: current.nodo.map(nodo => nodo.id === nodoId ? { ...nodo, ...patch } : nodo)
    });
  }

  private isLockedByMe(nodoId: string) {
    const lock = this.nodoLocks().get(nodoId);
    return !!lock && lock.userId === this.collab.getClientId();
  }

  private normalizeNodo(nodo: Nodo | CollaborativeWorkflowNodo): Nodo {
    const typed = nodo as Nodo;
    return {
      ...typed,
      formDefinition: typed.formDefinition ? {
        ...typed.formDefinition,
        fields: [...(typed.formDefinition.fields ?? [])].map(field => ({
          ...field,
          columns: this.normalizeGridColumns(field.columns)
        }))
      } : typed.formDefinition,
      responsibleDepartmentName: typed.responsibleDepartmentName || this.departments().find(item => item.id === typed.responsibleDepartmentId)?.name,
      requiresForm: typed.requiresForm ?? false,
      avgMinutes: typed.avgMinutes ?? 1440
    };
  }

  private loadNodoFormDefinition(nodoId: string) {
    this.api.get<FormDefinition>(`/forms/nodo/${nodoId}`).subscribe({
      next: formDefinition => {
        const current = this.workflow();
        if (!current) return;
        this.workflow.set({
          ...current,
          nodo: current.nodo.map(nodo => nodo.id === nodoId ? { ...nodo, formDefinition } : nodo)
        });
        if (this.selectedNodoId() === nodoId) {
          const nodo = this.workflow()?.nodo.find(item => item.id === nodoId);
          if (!nodo) return;
          this.nodoForm = {
            ...this.nodoForm,
            requiresForm: true,
            formTitle: formDefinition.title || 'Formulario',
            formFields: [...(formDefinition.fields ?? [])]
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map(field => ({ ...field, columns: this.normalizeGridColumns(field.columns) }))
          };
        }
      },
      error: () => {}
    });
  }

  private ensureReachableFormsLoaded(nodoId: string, visited = new Set<string>()) {
    const workflow = this.workflow();
    if (!workflow || visited.has(nodoId)) return;
    visited.add(nodoId);

    const current = workflow.nodo.find(nodo => nodo.id === nodoId);
    if (current?.requiresForm && !current.formDefinition) {
      this.loadNodoFormDefinition(nodoId);
    }

     if (!current || !this.esNodoLogico(current.nodeType)) {
      return;
    }

    for (const transition of workflow.transitions.filter(item => item.toNodoId === nodoId)) {
      this.ensureReachableFormsLoaded(transition.fromNodoId, visited);
    }
  }

  private resolveFieldsAvailableAtNodo(nodoId: string, visited = new Set<string>()): ResolvedNodoField[] {
    const workflow = this.workflow();
    if (!workflow || visited.has(nodoId)) return [] as ResolvedNodoField[];
    const nodo = workflow.nodo.find(item => item.id === nodoId);
    if (!nodo) return [] as ResolvedNodoField[];

    const ownFields: ResolvedNodoField[] = [...(nodo.formDefinition?.fields ?? [])]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
      .map(field => ({
        ...field,
        originNodoId: nodo.id,
        originNodoName: nodo.name
      }));

    if (!this.esNodoLogico(nodo.nodeType)) {
      return ownFields;
    }

    const nextVisited = new Set(visited);
    nextVisited.add(nodoId);

    const inheritedFields: ResolvedNodoField[] = workflow.transitions
      .filter(transition => transition.toNodoId === nodoId)
      .flatMap(transition => this.resolveTransitionFields(transition, nextVisited));

    return this.uniqueResolvedFields([...ownFields, ...inheritedFields]);
  }

  private resolveTransitionFields(transition: Transition, visited = new Set<string>()): ResolvedNodoField[] {
    const sourceFields: ResolvedNodoField[] = this.resolveFieldsAvailableAtNodo(transition.fromNodoId, visited);
    return this.filterForwardFields(sourceFields, {
      mode: this.normalizeForwardMode(transition.forwardConfig?.mode),
      fieldNames: [...(transition.forwardConfig?.fieldNames ?? [])],
      includeFiles: Boolean(transition.forwardConfig?.includeFiles)
    });
  }

  private uniqueResolvedFields(fields: ResolvedNodoField[]): ResolvedNodoField[] {
    const seen = new Set<string>();
    return fields.filter(field => {
      const key = `${field.originNodoId}::${field.name}::${field.type}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private esNodoLogico(nodeType: string | undefined) {
    return this.nodeBehaviorResolver.resolve(nodeType).isLogical;
  }

  private nodoCenter(nodoId: string) {
    const nodo = this.workflow()?.nodo.find(item => item.id === nodoId);
    if (!nodo) return null;
    const x = nodo.posX ?? 0;
    const y = nodo.posY ?? 0;
    return this.nodeBehaviorResolver.resolve(nodo).resolveCenter(x, y);
  }

  private nodoBoxWidth(nodo: Pick<Nodo, 'nodeType'>) {
    return this.nodeBehaviorResolver.resolve(nodo).width;
  }

  private nodoBoxHeight(nodo: Pick<Nodo, 'nodeType'>) {
    return this.nodeBehaviorResolver.resolve(nodo).height;
  }

  private defaultTransitionName(source?: Nodo) {
    if (!source) return '';
    const outgoing = this.workflow()?.transitions.filter(item => item.fromNodoId === source.id).length || 0;
    return this.nodeBehaviorResolver.resolve(source).defaultTransitionName(outgoing);
  }

  private async autoLayoutWorkflow() {
    const workflow = this.workflow();
    if (!workflow?.nodo.length) return;
    const nextNodos = autoLayoutWorkflowNodos(workflow, this.departments(), this.nodeBehaviorResolver);

    this.workflow.set({ ...workflow, nodo: nextNodos });

    await Promise.all(nextNodos.map(async nodo => {
      await firstValueFrom(this.api.patch<Nodo>(`/workflow-nodos/${nodo.id}`, {
        posX: nodo.posX,
        posY: nodo.posY
      }));
    }));
  }

  private createFieldId() {
    return `field-${Math.random().toString(36).slice(2, 10)}`;
  }

  private createGridColumn(order: number): GridColumn {
    return {
      id: this.createFieldId(),
      name: `columna_${order}`,
      type: 'TEXT',
      order
    };
  }

  private normalizeGridColumns(columns?: Array<Partial<GridColumn>> | null): GridColumn[] {
    return [...(columns ?? [])]
      .filter(column => !!column)
      .map((column, index) => ({
        id: column.id || this.createFieldId(),
        name: column.name || `columna_${index + 1}`,
        type: this.normalizeGridColumnType(column.type),
        order: index + 1
      }));
  }

  private normalizeGridColumnType(type: string | undefined): GridColumnType {
    return this.gridColumnTypes.includes(type as GridColumnType) ? type as GridColumnType : 'TEXT';
  }

  private emptyNodoForm(): NodoForm {
    return {
      name: '',
      description: '',
      nodeType: 'proceso',
      responsibleDepartmentId: '',
      responsibleJobRoleId: '',
      avgMinutes: 1440,
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
        mode: 'none',
        fieldNames: [],
        includeFiles: false
      };
    }

  private filterForwardFields(fields: ResolvedNodoField[], config: TransitionForm): ResolvedNodoField[] {
    const selectedNames = new Set(config.fieldNames);
    return fields.filter(field => {
      const isFileField = field.type === 'FILE';
      if (config.mode === 'none') return false;
      if (config.mode === 'files-only') return isFileField;
      if (config.mode === 'all') return config.includeFiles || !isFileField;
      if (config.mode === 'selected') return selectedNames.has(field.name) || (config.includeFiles && isFileField);
      return false;
    });
  }

  private normalizeForwardMode(mode: string | undefined): ForwardMode {
    if (mode === 'selected' || mode === 'all' || mode === 'files-only') {
      return mode;
    }
    return 'none';
  }
}
