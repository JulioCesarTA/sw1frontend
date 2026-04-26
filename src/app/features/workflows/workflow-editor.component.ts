import {
  Component, Input, OnInit, OnDestroy, inject, signal, computed, effect,
  ViewChild, ElementRef, afterRender, HostListener
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { firstValueFrom } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import {
  CollaborativeWorkflowStage,
  CollaborativeWorkflowTransition,
  WorkflowCollaborationService,
  WorkflowStageLock
} from '../../core/services/workflow-collaboration.service';

// ─────────────────────────── domain types ────────────────────────────────────

type FieldType = 'TEXT' | 'NUMBER' | 'DATE' | 'FILE';
type NodeVisualType = 'start' | 'process' | 'decision' | 'end' | 'fork' | 'join' | 'loop';
type ForwardMode = 'all' | 'selected' | 'files-only' | 'none';

interface FormField {
  id: string;
  label: string;
  name: string;
  type: FieldType;
  placeholder?: string;
  options?: string[];
  isRequired: boolean;
  order: number;
}
interface FormDefinition {
  id?: string;
  stageId: string;
  title: string;
  fields: FormField[];
}

interface ForwardConfig {
  mode: ForwardMode;
  fieldNames: string[];
  includeFiles: boolean;
}

interface Stage {
  id: string;
  workflowId: string;
  name: string;
  description?: string;
  order: number;
  responsibleRole?: string;
  responsibleDepartmentId?: string;
  responsibleDepartmentName?: string;
  requiresForm: boolean;
  slaHours: number;
  nodeType?: NodeVisualType | string;
  isConditional?: boolean;
  condition?: string;
  trueLabel?: string;
  falseLabel?: string;
  posX?: number;
  posY?: number;
  responsibleJobRoleId?: string;
  formDefinition?: FormDefinition;
}

interface Transition {
  id: string;
  workflowId: string;
  fromStageId: string;
  toStageId: string;
  name: string;
  condition?: string;
  forwardConfig?: ForwardConfig;
}

interface Workflow {
  id: string;
  name: string;
  description?: string;
  companyId?: string;
  companyName?: string;
  stages: Stage[];
  transitions: Transition[];
}

interface Department {
  id: string;
  companyId: string;
  name: string;
}

interface JobRole {
  id: string;
  departmentId: string;
  name: string;
}

interface StageEditForm {
  name: string;
  description: string;
  nodeType: string;
  responsibleDepartmentId: string;
  responsibleJobRoleId: string;
  slaHours: number;
  requiresForm: boolean;
  isConditional: boolean;
  condition: string;
  trueLabel: string;
  falseLabel: string;
  formTitle: string;
  formFields: FormField[];
}

interface SvgConnection {
  transitionId: string;
  path: string;
  label: string;
  labelX: number;
  labelY: number;
  selected: boolean;
  color: string;
}

interface WorkySuggestion {
  id: string;
  message: string;
  reason: string;
  priority: 'high' | 'medium' | 'low';
  actions: any[];
}

interface WorkyAssistantResponse {
  assistantName: string;
  summary: string;
  suggestions: WorkySuggestion[];
}

// ─────────────────────────── component ───────────────────────────────────────

@Component({
  selector: 'app-workflow-editor',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatButtonModule, MatFormFieldModule,
    MatIconModule, MatInputModule, MatProgressSpinnerModule,
    MatSelectModule, MatSlideToggleModule, MatSnackBarModule,
    MatTooltipModule, MatCheckboxModule
  ],
  template: `
<div class="min-h-full bg-[#eef2ff]" [class.connecting-mode]="connectingFromId()">
  <div class="editor-header flex items-center gap-4 px-6 py-[18px] bg-slate-800 text-white">
    <button mat-icon-button (click)="goBack()"><mat-icon>arrow_back</mat-icon></button>
    <div>
      <p class="m-0 text-[10px] tracking-[.12em] uppercase text-slate-400">Workflow</p>
      <h2 class="my-0.5 text-[21px] font-bold">{{ workflow()?.name || 'Cargando...' }}</h2>
      <span class="text-white/60 text-xs">Editor visual por carriles</span>
    </div>
    <div class="header-actions ml-auto flex gap-[10px] items-center">
      @if (connectingFromId()) {
        <div class="connect-hint flex items-center gap-2 border border-indigo-400/50 rounded-xl px-[14px] py-2 text-[13px] font-semibold text-indigo-200">
          <mat-icon>cable</mat-icon>
          <span>
            @if (connectingLabel()) {
              Rama <strong style="color:#a5b4fc">{{ connectingLabel() }}</strong> ?
            }
            Haz clic en la etapa destino
          </span>
          <button mat-button (click)="cancelConnect()">Cancelar</button>
        </div>
      }
    </div>
  </div>

  @if (loading()) {
    <div class="flex justify-center p-20"><mat-spinner /></div>
  } @else if (workflow()) {
    <div class="editor-layout">
      <section class="bg-white rounded-[20px] border border-slate-200 flex flex-col overflow-hidden">
        <div class="flex flex-wrap items-center justify-between gap-2 px-[18px] pt-[14px] pb-3 border-b border-slate-100 flex-shrink-0">
          <h3 class="text-[15px] font-bold text-slate-900 m-0">Diagrama por carriles</h3>
          <div class="flex flex-wrap items-center gap-1.5">
            <button mat-icon-button matTooltip="Reorganizar carriles" (click)="autoLayout()">
              <mat-icon>auto_fix_high</mat-icon>
            </button>
            @for (dept of availableLanesToAdd(); track dept.id) {
              <button mat-stroked-button class="!text-xs !h-7 !px-2 !min-w-0" (click)="addLane(dept.id)">
                <mat-icon class="!text-sm !h-4 !w-4 mr-0.5">add</mat-icon>{{ dept.name }}
              </button>
            }
          </div>
        </div>

        <div class="board-wrap" #boardWrap
             (mousemove)="onMouseMove($event)"
             (mouseup)="onMouseUp($event)"
             (mouseleave)="onMouseUp($event)"
             (click)="onBoardClick($event)"
             (dragover)="onPaletteDragOver($event)"
             (drop)="onPaletteDrop($event)">

          <svg class="absolute top-0 left-0 z-[2]"
               [attr.width]="svgW() || 2000"
               [attr.height]="svgH() || 2000"
               style="pointer-events:none; overflow:visible">
            <defs>
              <marker id="arr-default" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
                <polygon points="0 0,10 4,0 8" fill="#1e293b"/>
              </marker>
              <marker id="arr-selected" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
                <polygon points="0 0,10 4,0 8" fill="#4f46e5"/>
              </marker>
              <marker id="arr-true" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
                <polygon points="0 0,10 4,0 8" fill="#16a34a"/>
              </marker>
              <marker id="arr-false" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
                <polygon points="0 0,10 4,0 8" fill="#ea580c"/>
              </marker>
              <marker id="arr-draft" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
                <polygon points="0 0,10 4,0 8" fill="#4f46e5"/>
              </marker>
              <marker id="arr-iterative" markerWidth="10" markerHeight="8" refX="9" refY="4" orient="auto">
                <polygon points="0 0,10 4,0 8" fill="#7c3aed"/>
              </marker>
            </defs>

            @for (conn of svgConnections(); track conn.transitionId) {
              <path [attr.d]="conn.path"
                    stroke="transparent" stroke-width="16" fill="none"
                    style="pointer-events:stroke; cursor:pointer"
                    (click)="$event.stopPropagation(); selectTransitionById(conn.transitionId)" />
              <path [attr.d]="conn.path"
                    [attr.stroke]="conn.selected ? '#4f46e5' : conn.color"
                    [attr.stroke-width]="conn.selected ? 2.5 : 1.8"
                    fill="none"
                    [attr.marker-end]="'url(#arr-' + (conn.selected ? 'selected' : markerSuffix(conn.color)) + ')'"
                    style="pointer-events:none" />
              @if (conn.label) {
                <g style="pointer-events:stroke; cursor:pointer"
                   (click)="$event.stopPropagation(); selectTransitionById(conn.transitionId)">
                  <rect [attr.x]="conn.labelX - 30" [attr.y]="conn.labelY - 10"
                        width="60" height="20" rx="10"
                        [attr.fill]="conn.selected ? '#eef2ff' : '#fff'"
                        [attr.stroke]="conn.selected ? '#4f46e5' : conn.color"
                        stroke-width="1.2" />
                  <text [attr.x]="conn.labelX" [attr.y]="conn.labelY + 4"
                        text-anchor="middle" font-size="10" font-family="system-ui,sans-serif"
                        [attr.fill]="conn.selected ? '#4f46e5' : '#475569'">
                    {{ conn.label | slice:0:10 }}
                  </text>
                </g>
              }
            }

            @if (inProgressPath()) {
              <path [attr.d]="inProgressPath()"
                    stroke="#4f46e5" stroke-width="2"
                    stroke-dasharray="6 4"
                    fill="none"
                    marker-end="url(#arr-draft)"
                    style="pointer-events:none; opacity:.75" />
            }
          </svg>

          <div class="relative" #lanesGrid
               [style.width.px]="canvasW()"
               [style.height.px]="canvasH()">
            @if (lanes().length === 0) {
              <div class="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400">
                <mat-icon class="!h-12 !w-12 !text-[48px] text-slate-300">view_column</mat-icon>
                <p class="text-sm">Agrega un carril (departamento) para comenzar</p>
              </div>
            }
            @for (lane of lanes(); track lane; let li = $index) {
              <div class="lane-stripe"
                   [style.left.px]="li * (LANE_W + LANE_GAP)"
                   [style.width.px]="LANE_W"
                   [style.--lane-color]="laneColor(lane)">
                <div class="lane-stripe-header">
                  <span>{{ departmentLabel(lane) }}</span>
                  <div class="flex items-center gap-1">
                    <strong>{{ laneStages(lane).length }}</strong>
                    @if (laneStages(lane).length === 0) {
                      <button class="ml-1 flex h-4 w-4 items-center justify-center rounded-full text-slate-400 hover:bg-red-100 hover:text-red-500"
                              (click)="removeLane(lane); $event.stopPropagation()" title="Quitar carril">
                        <mat-icon class="!text-xs !h-3 !w-3">close</mat-icon>
                      </button>
                    }
                  </div>
                </div>
              </div>
            }

            @for (stage of allStages(); track stage.id) {
              @if (nodeType(stage) === 'start' || nodeType(stage) === 'end') {
                <div class="stage-node free-node node-circle"
                     [class.selected]="selectedStage()?.id === stage.id"
                     [class.locked-by-other]="isStageLockedByOther(stage.id)"
                     [class.connecting-source]="connectingFromId() === stage.id"
                     [class.connecting-target]="!!connectingFromId() && connectingFromId() !== stage.id"
                     [attr.data-stage-id]="stage.id"
                     [style.left.px]="stagePos(stage.id).x"
                     [style.top.px]="stagePos(stage.id).y"
                     [attr.title]="stageLockTitle(stage.id) || null"
                     (mousedown)="onNodeMouseDown(stage, $event)"
                     (click)="$event.stopPropagation(); onStageClick(stage)">
                  <div class="uml-shape circle-body" [class.start-body]="nodeType(stage) === 'start'" [class.end-body]="nodeType(stage) === 'end'">
                    @if (nodeType(stage) === 'end') {
                      <div class="end-inner"></div>
                    }
                  </div>
                  <span class="circle-label">{{ stage.name }}</span>
                  @if (!connectingFromId() && canAddOutgoing(stage)) {
                    <button class="connect-handle" (click)="$event.stopPropagation(); startConnect(stage)" matTooltip="Conectar">
                      <mat-icon>add_link</mat-icon>
                    </button>
                  }
                </div>
              } @else if (nodeType(stage) === 'decision') {
                <div class="stage-node free-node node-diamond-wrap"
                     [class.selected]="selectedStage()?.id === stage.id"
                     [class.locked-by-other]="isStageLockedByOther(stage.id)"
                     [class.connecting-source]="connectingFromId() === stage.id"
                     [class.connecting-target]="!!connectingFromId() && connectingFromId() !== stage.id"
                     [attr.data-stage-id]="stage.id"
                     [style.left.px]="stagePos(stage.id).x"
                     [style.top.px]="stagePos(stage.id).y"
                     [attr.title]="stageLockTitle(stage.id) || null"
                     (mousedown)="onNodeMouseDown(stage, $event)"
                     (click)="$event.stopPropagation(); onStageClick(stage)">
                  <div class="uml-shape diamond-shape">
                    <div class="diamond-content">
                      <span class="diamond-name">{{ stage.name }}</span>
                    </div>
                  </div>
                  <div class="decision-branches">
                    <span class="branch-label branch-yes">{{ stage.trueLabel || 'Si' }}</span>
                    <span class="branch-label branch-no">{{ stage.falseLabel || 'No' }}</span>
                  </div>
                </div>
              } @else if (nodeType(stage) === 'fork' || nodeType(stage) === 'join') {
                <div class="stage-node free-node node-fork-wrap"
                     [class.selected]="selectedStage()?.id === stage.id"
                     [class.locked-by-other]="isStageLockedByOther(stage.id)"
                     [class.connecting-source]="connectingFromId() === stage.id"
                     [class.connecting-target]="!!connectingFromId() && connectingFromId() !== stage.id"
                     [attr.data-stage-id]="stage.id"
                     [style.left.px]="stagePos(stage.id).x"
                     [style.top.px]="stagePos(stage.id).y"
                     [attr.title]="stageLockTitle(stage.id) || null"
                     (mousedown)="onNodeMouseDown(stage, $event)"
                     (click)="$event.stopPropagation(); onStageClick(stage)">
                  <div class="uml-shape fork-bar"></div>
                  <span class="fork-type-label">{{ nodeType(stage) === 'fork' ? 'Bifurcacion' : 'Union' }}</span>
                  <span class="fork-name">{{ stage.name }}</span>
                  @if (!connectingFromId() && canAddOutgoing(stage)) {
                    <button class="connect-handle" (click)="$event.stopPropagation(); startConnect(stage)" matTooltip="Conectar">
                      <mat-icon>add_link</mat-icon>
                    </button>
                  }
                </div>
              } @else {
                <div class="stage-node free-node nt-process"
                     [class.selected]="selectedStage()?.id === stage.id"
                     [class.locked-by-other]="isStageLockedByOther(stage.id)"
                     [class.connecting-source]="connectingFromId() === stage.id"
                     [class.connecting-target]="!!connectingFromId() && connectingFromId() !== stage.id"
                     [attr.data-stage-id]="stage.id"
                     [style.left.px]="stagePos(stage.id).x"
                     [style.top.px]="stagePos(stage.id).y"
                     [attr.title]="stageLockTitle(stage.id) || null"
                     (mousedown)="onNodeMouseDown(stage, $event)"
                     (click)="$event.stopPropagation(); onStageClick(stage)">
                  <div class="node-top-row">
                    <span class="node-order">#{{ stage.order }}</span>
                    <span class="stage-pill">{{ nodeType(stage) }}</span>
                  </div>
                  <div class="node-title">{{ stage.name }}</div>
                  @if (stage.description) {
                    <div class="node-desc">{{ stage.description }}</div>
                  }
                  @if (stage.responsibleDepartmentName || departmentLabel(stage.responsibleDepartmentId)) {
                    <div class="node-meta">{{ stage.responsibleDepartmentName || departmentLabel(stage.responsibleDepartmentId) }}</div>
                  }
                  <div class="node-bottom-row">
                    <span class="sla-pill">{{ stage.slaHours || 24 }}h SLA</span>
                    @if (!connectingFromId() && canAddOutgoing(stage)) {
                      <button mat-icon-button (click)="$event.stopPropagation(); startConnect(stage)" matTooltip="Conectar">
                        <mat-icon>add_link</mat-icon>
                      </button>
                    }
                  </div>
                </div>
              }
            }
          </div>
        </div>
      </section>

      <aside class="bg-white rounded-[20px] border border-slate-200 p-[18px] overflow-y-auto h-full box-border">
        <div class="flex gap-1 mb-[14px] flex-wrap bg-slate-100 rounded-xl p-1">
          <button class="panel-tab flex-1 flex items-center justify-center gap-1 px-1 py-[6px] border-0 rounded-[9px] bg-transparent text-[11px] font-semibold text-slate-500 cursor-pointer transition-all" [class.active]="aiTab() === 'inspector'" (click)="aiTab.set('inspector')">
            <mat-icon style="font-size:15px;width:15px;height:15px">tune</mat-icon> Inspector
          </button>
          @if (auth.isAdmin()) {
            <button class="panel-tab flex-1 flex items-center justify-center gap-1 px-1 py-[6px] border-0 rounded-[9px] bg-transparent text-[11px] font-semibold text-slate-500 cursor-pointer transition-all" [class.active]="aiTab() === 'worky'" (click)="openWorkyTab()">
              <mat-icon style="font-size:15px;width:15px;height:15px">smart_toy</mat-icon> Worky
            </button>
            <button class="panel-tab flex-1 flex items-center justify-center gap-1 px-1 py-[6px] border-0 rounded-[9px] bg-transparent text-[11px] font-semibold text-slate-500 cursor-pointer transition-all" [class.active]="aiTab() === 'create'" (click)="openAiCreateTab()">
              <mat-icon style="font-size:15px;width:15px;height:15px">auto_fix_high</mat-icon> IA
            </button>
            <button class="panel-tab flex-1 flex items-center justify-center gap-1 px-1 py-[6px] border-0 rounded-[9px] bg-transparent text-[11px] font-semibold text-slate-500 cursor-pointer transition-all" [class.active]="aiTab() === 'analyze'" (click)="openAiAnalyzeTab()">
              <mat-icon style="font-size:15px;width:15px;height:15px">insights</mat-icon> Analisis
            </button>
          }
        </div>

        @if (aiTab() === 'inspector') {
          @if (selectedStage()) {
            <div class="flex justify-between items-start mb-[14px]">
              <div>
                <h3 class="text-[14px] font-bold text-slate-900 mt-0.5 mb-0 flex items-center gap-[6px] flex-wrap"><mat-icon>account_tree</mat-icon> {{ selectedStage()!.name }}</h3>
              </div>
              <button mat-icon-button color="warn" (click)="deleteStage(selectedStage()!)"><mat-icon>delete</mat-icon></button>
            </div>

            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Nombre</mat-label>
              <input matInput [(ngModel)]="editForm.name">
            </mat-form-field>

            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Tipo de nodo</mat-label>
              <mat-select [(ngModel)]="editForm.nodeType" (ngModelChange)="onNodeTypeChange($event)">
                <mat-option value="start">Inicio (nodo inicial)</mat-option>
                <mat-option value="process">Proceso (actividad)</mat-option>
                <mat-option value="decision">Decision (condicional)</mat-option>
                <mat-option value="fork">Bifurcacion (inicio paralelo)</mat-option>
                <mat-option value="join">Union (fin paralelo)</mat-option>
                <mat-option value="loop">Iteracion (loop)</mat-option>
                <mat-option value="end">Fin (nodo final)</mat-option>
              </mat-select>
            </mat-form-field>

            @if (isProcessNodeType(editForm.nodeType)) {
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Departamento responsable</mat-label>
                <mat-select [(ngModel)]="editForm.responsibleDepartmentId" (ngModelChange)="onDepartmentChange($event)">
                  @for (department of availableDepartments(); track department.id) {
                    <mat-option [value]="department.id">{{ department.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Rol responsable</mat-label>
                <mat-select [(ngModel)]="editForm.responsibleJobRoleId" [disabled]="!editForm.responsibleDepartmentId">
                  <mat-option value="">Sin rol especifico</mat-option>
                  @for (role of jobRoles(); track role.id) {
                    <mat-option [value]="role.id">{{ role.name }}</mat-option>
                  }
                </mat-select>
              </mat-form-field>

              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Horas</mat-label>
                <input matInput type="number" [(ngModel)]="editForm.slaHours">
              </mat-form-field>

              <div class="flex flex-col gap-3 mb-3">
                <mat-slide-toggle [(ngModel)]="editForm.requiresForm">Requiere formulario</mat-slide-toggle>
              </div>

              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Descripcion</mat-label>
                <textarea matInput rows="2" [(ngModel)]="editForm.description"></textarea>
              </mat-form-field>
            }

            @if (editForm.nodeType === 'loop') {
              <div class="grid grid-cols-2 gap-[10px]">
                <mat-form-field appearance="outline" class="w-full"><mat-label>Etiqueta Repetir</mat-label><input matInput [(ngModel)]="editForm.trueLabel"></mat-form-field>
                <mat-form-field appearance="outline" class="w-full"><mat-label>Etiqueta Salir</mat-label><input matInput [(ngModel)]="editForm.falseLabel"></mat-form-field>
              </div>
              <mat-form-field appearance="outline" class="w-full"><mat-label>Condicion</mat-label><input matInput [(ngModel)]="editForm.condition"></mat-form-field>
            } @else if (editForm.nodeType === 'decision') {
              <div class="grid grid-cols-2 gap-[10px]">
                <mat-form-field appearance="outline" class="w-full"><mat-label>Etiqueta Si</mat-label><input matInput [(ngModel)]="editForm.trueLabel"></mat-form-field>
                <mat-form-field appearance="outline" class="w-full"><mat-label>Etiqueta No</mat-label><input matInput [(ngModel)]="editForm.falseLabel"></mat-form-field>
              </div>
              <mat-form-field appearance="outline" class="w-full"><mat-label>Condicion</mat-label><input matInput [(ngModel)]="editForm.condition"></mat-form-field>
            }

            @if (incomingDataForSelected().length > 0) {
              <div class="mt-4 mb-2 text-[11px] font-bold tracking-[.08em] uppercase text-slate-500">Datos que recibe esta etapa</div>
              @for (inc of incomingDataForSelected(); track inc.transitionId) {
                <div class="border-[1.5px] border-indigo-200 rounded-[14px] bg-gradient-to-br from-indigo-50 to-sky-50 px-3 py-[10px] mb-2">
                  <div class="flex items-center gap-[6px] flex-wrap mb-2">
                    <span class="bg-indigo-600 text-white text-[11px] font-bold px-[10px] py-0.5 rounded-full">{{ inc.fromStageName }}</span>
                    <mat-icon class="text-[16px] text-slate-500">arrow_right_alt</mat-icon>
                    <span class="bg-cyan-600 text-white text-[11px] font-bold px-[10px] py-0.5 rounded-full">Esta etapa</span>
                  </div>
                  @if (inc.fields.length > 0) {
                    <div class="flex flex-col gap-1.5">
                      @for (field of inc.fields; track field.name) {
                        <div class="flex items-center justify-between gap-2 rounded-[10px] border border-white/80 bg-white/75 px-2.5 py-1.5 text-[11px]">
                          <div class="min-w-0 flex-1">
                            <strong class="block text-slate-800 truncate">{{ field.label }}</strong>
                            <span class="text-slate-400">{{ field.name }}</span>
                          </div>
                          <span class="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">{{ field.type }}</span>
                        </div>
                      }
                    </div>
                  } @else if (inc.includeFiles) {
                    <div class="rounded-[10px] border border-white/80 bg-white/75 px-2.5 py-2 text-[11px] text-slate-600">
                      Esta conexión reenvía archivos adjuntos.
                    </div>
                  } @else {
                    <div class="rounded-[10px] border border-white/80 bg-white/75 px-2.5 py-2 text-[11px] text-slate-600">
                      Esta conexión no expone campos específicos para mostrar.
                    </div>
                  }
                </div>
              }
            }

            <div class="mt-4 mb-2 text-[11px] font-bold tracking-[.08em] uppercase text-slate-500">Conexiones salientes</div>
            <div class="flex flex-col gap-[6px]">
              @for (t of transitionsFromSelected(); track t.id) {
                <div class="flex items-center gap-2 px-[10px] py-2 rounded-xl border"
                     [class.border-indigo-500]="selectedTransition()?.id === t.id"
                     [class.bg-indigo-50]="selectedTransition()?.id === t.id"
                     [class.border-slate-200]="selectedTransition()?.id !== t.id"
                     [class.bg-slate-50]="selectedTransition()?.id !== t.id">
                  <mat-icon class="text-[18px] text-slate-400 flex-shrink-0">arrow_right_alt</mat-icon>
                  <div class="flex-1 min-w-0">
                    <strong class="text-[13px] text-slate-900">{{ getStageName(t.toStageId) }}</strong>
                    @if (t.name) { <span class="block text-[11px] text-slate-500">{{ t.name }}</span> }
                  </div>
                  <div class="flex gap-0.5">
                    <button mat-icon-button (click)="selectTransitionById(t.id)"><mat-icon>tune</mat-icon></button>
                    <button mat-icon-button color="warn" (click)="deleteTransition(t.id)"><mat-icon>close</mat-icon></button>
                  </div>
                </div>
              } @empty {
                <div class="text-center py-[14px] text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl flex items-center justify-center gap-1">Sin conexiones</div>
              }
            </div>

            @if (isProcessNodeType(editForm.nodeType) && editForm.requiresForm) {
              <div class="mt-4 mb-2 text-[11px] font-bold tracking-[.08em] uppercase text-slate-500">Formulario de etapa</div>
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Titulo formulario</mat-label>
                <input matInput [(ngModel)]="editForm.formTitle">
              </mat-form-field>
              <div class="flex flex-col gap-[10px]">
                @for (field of editForm.formFields; track field.id; let i = $index) {
                  <div class="border border-slate-200 rounded-[14px] p-3 bg-slate-50">
                    <div class="grid grid-cols-2 gap-[10px]">
                      <mat-form-field appearance="outline" class="w-full"><mat-label>Etiqueta</mat-label><input matInput [(ngModel)]="field.label"></mat-form-field>
                      <mat-form-field appearance="outline" class="w-full">
                        <mat-label>Tipo</mat-label>
                        <mat-select [(ngModel)]="field.type">
                          @for (ft of fieldTypes; track ft) {
                            <mat-option [value]="ft">{{ ft }}</mat-option>
                          }
                        </mat-select>
                      </mat-form-field>
                    </div>
                    <div class="grid grid-cols-2 gap-[10px]">
                      <mat-form-field appearance="outline" class="w-full"><mat-label>Nombre interno</mat-label><input matInput [(ngModel)]="field.name"></mat-form-field>
                      <mat-form-field appearance="outline" class="w-full"><mat-label>Placeholder</mat-label><input matInput [(ngModel)]="field.placeholder"></mat-form-field>
                    </div>
                    <div class="flex justify-between items-center mt-[6px]">
                      <mat-slide-toggle [(ngModel)]="field.isRequired">Obligatorio</mat-slide-toggle>
                      <div class="flex gap-0.5">
                        <button mat-icon-button (click)="moveField(i, -1)" [disabled]="i === 0"><mat-icon>arrow_upward</mat-icon></button>
                        <button mat-icon-button (click)="moveField(i, 1)" [disabled]="i === editForm.formFields.length - 1"><mat-icon>arrow_downward</mat-icon></button>
                        <button mat-icon-button color="warn" (click)="removeField(i)"><mat-icon>delete_outline</mat-icon></button>
                      </div>
                    </div>
                  </div>
                }
              </div>
              <button mat-stroked-button class="w-full" (click)="addField()"><mat-icon>add</mat-icon> Agregar campo</button>
            }

            <div class="flex justify-end gap-2 mt-4">
              <button mat-button (click)="clearSelection()">Cerrar</button>
              <button mat-flat-button color="primary" (click)="saveStage()"><mat-icon>save</mat-icon> Guardar</button>
            </div>
          } @else if (selectedTransition()) {
            <div class="flex justify-between items-start mb-[14px]">
              <div>
                <h3 class="text-[14px] font-bold text-slate-900 mt-0.5 mb-0 flex items-center gap-[6px]"><mat-icon>arrow_right_alt</mat-icon> Conexion</h3>
              </div>
              <button mat-icon-button color="warn" (click)="deleteSelectedTransition()"><mat-icon>delete</mat-icon></button>
            </div>

            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Etiqueta</mat-label>
              <input matInput [(ngModel)]="transEditName">
            </mat-form-field>

            <div class="mt-4 mb-2 text-[11px] font-bold tracking-[.08em] uppercase text-slate-500">Flujo de datos</div>
            <div class="flex flex-col gap-2">
              <label class="flex items-center gap-2 px-3 py-2 rounded-[10px] border cursor-pointer text-[13px] transition-all"
                     [class.border-indigo-500]="transEditMode === 'all'" [class.bg-indigo-50]="transEditMode === 'all'"
                     [class.text-indigo-600]="transEditMode === 'all'" [class.font-semibold]="transEditMode === 'all'"
                     [class.border-slate-200]="transEditMode !== 'all'" [class.text-slate-700]="transEditMode !== 'all'">
                <input type="radio" name="transMode" value="all" [(ngModel)]="transEditMode" class="hidden"> Todos los campos
              </label>
              <label class="flex items-center gap-2 px-3 py-2 rounded-[10px] border cursor-pointer text-[13px] transition-all"
                     [class.border-indigo-500]="transEditMode === 'selected'" [class.bg-indigo-50]="transEditMode === 'selected'"
                     [class.text-indigo-600]="transEditMode === 'selected'" [class.font-semibold]="transEditMode === 'selected'"
                     [class.border-slate-200]="transEditMode !== 'selected'" [class.text-slate-700]="transEditMode !== 'selected'">
                <input type="radio" name="transMode" value="selected" [(ngModel)]="transEditMode" class="hidden"> Campos seleccionados
              </label>
              <label class="flex items-center gap-2 px-3 py-2 rounded-[10px] border cursor-pointer text-[13px] transition-all"
                     [class.border-indigo-500]="transEditMode === 'files-only'" [class.bg-indigo-50]="transEditMode === 'files-only'"
                     [class.text-indigo-600]="transEditMode === 'files-only'" [class.font-semibold]="transEditMode === 'files-only'"
                     [class.border-slate-200]="transEditMode !== 'files-only'" [class.text-slate-700]="transEditMode !== 'files-only'">
                <input type="radio" name="transMode" value="files-only" [(ngModel)]="transEditMode" class="hidden"> Solo archivos
              </label>
              <label class="flex items-center gap-2 px-3 py-2 rounded-[10px] border cursor-pointer text-[13px] transition-all"
                     [class.border-indigo-500]="transEditMode === 'none'" [class.bg-indigo-50]="transEditMode === 'none'"
                     [class.text-indigo-600]="transEditMode === 'none'" [class.font-semibold]="transEditMode === 'none'"
                     [class.border-slate-200]="transEditMode !== 'none'" [class.text-slate-700]="transEditMode !== 'none'">
                <input type="radio" name="transMode" value="none" [(ngModel)]="transEditMode" class="hidden"> Nada
              </label>
            </div>

            @if (transEditMode === 'selected') {
              <div class="flex flex-col gap-[10px] mt-2">
                @for (field of sourceStageFields(); track field.name) {
                  <mat-checkbox [ngModel]="transEditFields.includes(field.name)" (ngModelChange)="toggleFieldForward(field.name, $event)">
                    {{ field.label }} <span style="font-size:10px;opacity:.55;margin-left:4px;">{{ field.type }}</span>
                  </mat-checkbox>
                }
              </div>
            }

            <div class="flex justify-end gap-2 mt-4">
              <button mat-button (click)="clearSelection()">Cerrar</button>
              <button mat-flat-button color="primary" (click)="saveTransition()"><mat-icon>save</mat-icon> Guardar</button>
            </div>
          } @else {
            <div class="flex flex-col gap-[14px] py-1">
              <p class="text-[10px] font-bold tracking-[.09em] uppercase text-slate-500 m-0">Tipos de nodo</p>
              <div class="grid grid-cols-2 gap-2">
                <div class="flex flex-col items-center gap-[6px] p-[10px] rounded-xl border-[1.5px] border-dashed border-slate-200 bg-slate-50 cursor-grab transition-all select-none hover:border-indigo-300 hover:bg-indigo-50 hover:-translate-y-px active:cursor-grabbing active:opacity-75"
                     [attr.draggable]="auth.isAdmin() ? 'true' : null" (dragstart)="auth.isAdmin() && onPaletteDragStart($event,'start')">
                  <div class="w-[52px] h-[46px] flex items-center justify-center">
                    <div class="w-9 h-9 rounded-full bg-slate-800 shadow-md"></div>
                  </div>
                  <span class="text-[10px] font-semibold text-slate-500">Inicio</span>
                </div>
                <div class="flex flex-col items-center gap-[6px] p-[10px] rounded-xl border-[1.5px] border-dashed border-slate-200 bg-slate-50 cursor-grab transition-all select-none hover:border-indigo-300 hover:bg-indigo-50 hover:-translate-y-px active:cursor-grabbing active:opacity-75"
                     [attr.draggable]="auth.isAdmin() ? 'true' : null" (dragstart)="auth.isAdmin() && onPaletteDragStart($event,'end')">
                  <div class="w-[52px] h-[46px] flex items-center justify-center">
                    <div class="w-9 h-9 rounded-full border-[3.5px] border-slate-800 flex items-center justify-center shadow-md">
                      <div class="w-5 h-5 rounded-full bg-slate-800"></div>
                    </div>
                  </div>
                  <span class="text-[10px] font-semibold text-slate-500">Fin</span>
                </div>
                <div class="flex flex-col items-center gap-[6px] p-[10px] rounded-xl border-[1.5px] border-dashed border-slate-200 bg-slate-50 cursor-grab transition-all select-none hover:border-indigo-300 hover:bg-indigo-50 hover:-translate-y-px active:cursor-grabbing active:opacity-75"
                     [attr.draggable]="auth.isAdmin() ? 'true' : null" (dragstart)="auth.isAdmin() && onPaletteDragStart($event,'process')">
                  <div class="w-[52px] h-[46px] flex items-center justify-center">
                    <div class="w-[46px] h-[30px] rounded-md bg-blue-100 border-2 border-blue-600 flex items-center justify-center">
                      <mat-icon style="font-size:14px;width:14px;height:14px;color:#2563eb">settings</mat-icon>
                    </div>
                  </div>
                  <span class="text-[10px] font-semibold text-slate-500">Proceso</span>
                </div>
                <div class="flex flex-col items-center gap-[6px] p-[10px] rounded-xl border-[1.5px] border-dashed border-slate-200 bg-slate-50 cursor-grab transition-all select-none hover:border-indigo-300 hover:bg-indigo-50 hover:-translate-y-px active:cursor-grabbing active:opacity-75"
                     [attr.draggable]="auth.isAdmin() ? 'true' : null" (dragstart)="auth.isAdmin() && onPaletteDragStart($event,'decision')">
                  <div class="w-[52px] h-[46px] flex items-center justify-center">
                    <div class="w-[34px] h-[34px] bg-amber-100 border-[2.5px] border-amber-600 rotate-45 rounded-md shadow-sm"></div>
                  </div>
                  <span class="text-[10px] font-semibold text-slate-500">Decision</span>
                </div>
                <div class="flex flex-col items-center gap-[6px] p-[10px] rounded-xl border-[1.5px] border-dashed border-slate-200 bg-slate-50 cursor-grab transition-all select-none hover:border-indigo-300 hover:bg-indigo-50 hover:-translate-y-px active:cursor-grabbing active:opacity-75"
                     [attr.draggable]="auth.isAdmin() ? 'true' : null" (dragstart)="auth.isAdmin() && onPaletteDragStart($event,'loop')">
                  <div class="w-[52px] h-[46px] flex items-center justify-center">
                    <div class="w-[46px] h-[30px] rounded-md bg-orange-50 border-2 border-orange-500 flex items-center justify-center text-orange-500 text-[17px] leading-none">I</div>
                  </div>
                  <span class="text-[10px] font-semibold text-slate-500">Iteracion</span>
                </div>
                <div class="flex flex-col items-center gap-[6px] p-[10px] rounded-xl border-[1.5px] border-dashed border-slate-200 bg-slate-50 cursor-grab transition-all select-none hover:border-indigo-300 hover:bg-indigo-50 hover:-translate-y-px active:cursor-grabbing active:opacity-75"
                     [attr.draggable]="auth.isAdmin() ? 'true' : null" (dragstart)="auth.isAdmin() && onPaletteDragStart($event,'fork')">
                  <div class="w-[52px] h-[46px] flex items-center justify-center">
                    <div class="w-[46px] h-[7px] rounded bg-slate-800 shadow-sm"></div>
                  </div>
                  <span class="text-[10px] font-semibold text-slate-500">Bifurcacion</span>
                </div>
                <div class="flex flex-col items-center gap-[6px] p-[10px] rounded-xl border-[1.5px] border-dashed border-slate-200 bg-slate-50 cursor-grab transition-all select-none hover:border-indigo-300 hover:bg-indigo-50 hover:-translate-y-px active:cursor-grabbing active:opacity-75"
                     [attr.draggable]="auth.isAdmin() ? 'true' : null" (dragstart)="auth.isAdmin() && onPaletteDragStart($event,'join')">
                  <div class="w-[52px] h-[46px] flex items-center justify-center">
                    <div class="w-[46px] h-[7px] rounded bg-slate-800 shadow-sm"></div>
                  </div>
                  <span class="text-[10px] font-semibold text-slate-500">Union</span>
                </div>
              </div>
            </div>
          }
        } @else if (aiTab() === 'create') {
          <div class="flex flex-col gap-3">
            <div class="flex gap-[10px] items-start p-3 bg-gradient-to-br from-indigo-50 to-sky-50 rounded-xl border border-indigo-200">
              <mat-icon class="text-indigo-600 flex-shrink-0 mt-0.5">auto_fix_high</mat-icon>
              <div>
                <strong class="text-[13px] text-slate-800 block mb-0.5">Generar workflow con IA</strong>
                <p class="text-[11px] text-slate-500 m-0 leading-[1.4]">Describe el proceso que quieres modelar.</p>
              </div>
            </div>
            <mat-form-field appearance="outline" class="w-full" style="margin-top:8px">
              <mat-label>Describe el workflow</mat-label>
              <textarea matInput rows="4" [(ngModel)]="aiCommand" (keydown.control.enter)="sendAiCommand()"></textarea>
            </mat-form-field>
            <button mat-flat-button color="primary" class="w-full" [disabled]="!aiCommand.trim() || aiLoading()" (click)="sendAiCommand()">
              @if (aiLoading()) {
                <mat-spinner diameter="18" style="display:inline-block;margin-right:6px"></mat-spinner> Procesando...
              } @else {
                <mat-icon>send</mat-icon> Enviar
              }
            </button>
          </div>
        } @else if (aiTab() === 'worky') {
          <div class="flex flex-col gap-3">
            <div class="flex gap-[10px] items-start p-3 bg-gradient-to-br from-cyan-50 to-indigo-50 rounded-xl border border-cyan-200">
              <mat-icon class="text-indigo-600 flex-shrink-0 mt-0.5">smart_toy</mat-icon>
              <div>
                <strong class="text-[13px] text-slate-800 block mb-0.5">Worky</strong>
                <p class="text-[11px] text-slate-500 m-0 leading-[1.4]">Asistente contextual del workflow.</p>
              </div>
            </div>
            <button mat-flat-button color="primary" class="w-full" [disabled]="workyLoading()" (click)="loadWorkySuggestions()">
              @if (workyLoading()) {
                <mat-spinner diameter="18" style="display:inline-block;margin-right:6px"></mat-spinner> Revisando workflow...
              } @else {
                <mat-icon>psychology_alt</mat-icon> Revisar con Worky
              }
            </button>
            @if (workyAssistant()) {
              <div class="rounded-xl border border-blue-100 bg-gradient-to-b from-blue-50 to-slate-50 p-3">
                <div class="flex items-start gap-2 mb-1">
                  <mat-icon class="text-cyan-600 flex-shrink-0">tips_and_updates</mat-icon>
                  <strong class="text-[12px] text-slate-900 leading-[1.4] flex-1">{{ workyAssistant()!.assistantName }}</strong>
                </div>
                <p class="mt-2 text-[11px] text-slate-500 leading-relaxed m-0">{{ workyAssistant()!.summary }}</p>
              </div>
              @if (workyAssistant()!.suggestions.length > 0) {
                <div class="flex flex-col gap-[10px]">
                  @for (suggestion of workyAssistant()!.suggestions; track suggestion.id) {
                    <div class="rounded-xl border border-blue-100 bg-gradient-to-b from-blue-50 to-slate-50 p-3">
                      <div class="flex items-start gap-2 justify-between mb-1">
                        <strong class="text-[12px] text-slate-900 leading-[1.4] flex-1">{{ suggestion.message }}</strong>
                        <span class="text-[9px] font-bold px-[7px] py-0.5 rounded-full uppercase flex-shrink-0"
                              [class.bg-red-100]="suggestion.priority === 'high'" [class.text-red-600]="suggestion.priority === 'high'"
                              [class.bg-amber-100]="suggestion.priority === 'medium'" [class.text-amber-600]="suggestion.priority === 'medium'"
                              [class.bg-green-100]="suggestion.priority === 'low'" [class.text-green-600]="suggestion.priority === 'low'">{{ suggestion.priority }}</span>
                      </div>
                      <p class="mt-2 text-[11px] text-slate-500 leading-relaxed m-0 mb-2">{{ suggestion.reason }}</p>
                      @if (suggestion.actions.length > 0) {
                        <div class="flex flex-col gap-1 mb-[10px]">
                          @for (action of suggestion.actions; track $index) {
                            <div class="flex items-center gap-[6px] text-[11px] text-slate-600 px-2 py-1 bg-white/70 rounded-lg">
                              <mat-icon style="font-size:14px;width:14px;height:14px;color:#4f46e5">{{ aiActionIcon(action.type) }}</mat-icon>
                              <span>{{ aiActionLabel(action) }}</span>
                            </div>
                          }
                        </div>
                      }
                      <button mat-stroked-button class="w-full" [disabled]="workyLoading() || aiLoading() || !suggestion.actions.length" (click)="applyWorkySuggestion(suggestion)"><mat-icon>auto_fix_high</mat-icon> Aplicar sugerencia</button>
                    </div>
                  }
                </div>
              }
            }
          </div>
        } @else if (aiTab() === 'analyze') {
          <div class="flex flex-col gap-3">
            <div class="flex gap-[10px] items-start p-3 bg-gradient-to-br from-indigo-50 to-sky-50 rounded-xl border border-indigo-200">
              <mat-icon class="text-indigo-600 flex-shrink-0 mt-0.5">insights</mat-icon>
              <div>
                <strong class="text-[13px] text-slate-800 block mb-0.5">Analisis de cuellos de botella</strong>
                <p class="text-[11px] text-slate-500 m-0 leading-[1.4]">Revisa el flujo y propone mejoras.</p>
              </div>
            </div>
            <button mat-flat-button color="primary" class="w-full" [disabled]="bottleneckLoading()" (click)="analyzeBottlenecks()">
              @if (bottleneckLoading()) {
                <mat-spinner diameter="18" style="display:inline-block;margin-right:6px"></mat-spinner> Analizando...
              } @else {
                <mat-icon>psychology</mat-icon> Analizar workflow
              }
            </button>
            @if (bottleneckResult()) {
              <div class="flex gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <mat-icon class="text-cyan-600 flex-shrink-0">summarize</mat-icon>
                <div><p class="text-[12px] text-slate-600 m-0 leading-relaxed">{{ bottleneckResult().summary }}</p></div>
              </div>
              @if (bottleneckResult().bottlenecks?.length > 0) {
                <div class="mt-4 mb-2 text-[11px] font-bold tracking-[.08em] uppercase text-slate-500">Cuellos de botella detectados</div>
                @for (bn of bottleneckResult().bottlenecks; track bn.stageId) {
                  <div class="rounded-xl p-[10px_12px] border-[1.5px] mb-2"
                       [class.border-red-300]="bn.severity === 'high'" [class.bg-red-50]="bn.severity === 'high'"
                       [class.border-yellow-300]="bn.severity === 'medium'" [class.bg-yellow-50]="bn.severity === 'medium'"
                       [class.border-green-300]="bn.severity === 'low'" [class.bg-green-50]="bn.severity === 'low'">
                    <div class="flex items-center gap-[6px] mb-[5px]">
                      <mat-icon style="font-size:16px"
                                [class.text-red-600]="bn.severity === 'high'"
                                [class.text-amber-600]="bn.severity === 'medium'"
                                [class.text-green-600]="bn.severity === 'low'">{{ bnIcon(bn.type) }}</mat-icon>
                      <strong class="text-[12px] text-slate-900 flex-1">{{ bn.stageName }}</strong>
                      <span class="text-[9px] font-bold px-[7px] py-0.5 rounded-full uppercase"
                            [class.bg-red-100]="bn.severity === 'high'" [class.text-red-600]="bn.severity === 'high'"
                            [class.bg-amber-100]="bn.severity === 'medium'" [class.text-amber-600]="bn.severity === 'medium'"
                            [class.bg-green-100]="bn.severity === 'low'" [class.text-green-600]="bn.severity === 'low'">{{ bn.severity }}</span>
                    </div>
                    <p class="text-[11px] text-slate-500 m-0 mb-[6px] leading-[1.4]">{{ bn.description }}</p>
                    <div class="flex gap-[5px] items-start text-[11px] text-slate-900 font-semibold">
                      <mat-icon style="font-size:13px;width:13px;height:13px;color:#d97706;flex-shrink:0;margin-top:1px">lightbulb</mat-icon>
                      <span>{{ bn.recommendation }}</span>
                    </div>
                  </div>
                }
              }
            }
          </div>
        }
      </aside>
    </div>
  }
</div>
  `,
  styles: [`
    @keyframes pulse-bg {
      0%, 100% { background: rgba(79,70,229,.25); }
      50%       { background: rgba(79,70,229,.4); }
    }
    .connect-hint { animation: pulse-bg 1.4s ease-in-out infinite; }

    .editor-layout {
      display: grid; grid-template-columns: minmax(0,1fr) 390px;
      gap: 14px; padding: 14px; height: calc(100vh - 80px); box-sizing: border-box;
    }
    @media (max-width: 1100px) { .editor-layout { grid-template-columns: 1fr; height: auto; } }
    @media (max-width: 680px)  { .editor-header { flex-wrap: wrap; } .header-actions { margin-left: 0; width: 100%; } }

    .board-wrap { position: relative; flex: 1; overflow: auto; padding: 16px; }
    .connecting-mode .board-wrap { cursor: crosshair; }

    .stage-node.free-node { position: absolute; width: 210px; z-index: 3; box-sizing: border-box; }
    .node-circle.free-node, .node-diamond-wrap.free-node { width: auto; min-width: 90px; }
    .free-node.is-dragging { cursor: grabbing; opacity: .85; box-shadow: 0 8px 28px rgba(0,0,0,.18); z-index: 10; }

    .lane-stripe {
      position: absolute; top: 0; height: 100%; border-radius: 16px; z-index: 1; box-sizing: border-box; overflow: hidden;
      background: color-mix(in srgb, var(--lane-color, #818cf8) 5%, white);
      border: 1.5px solid color-mix(in srgb, var(--lane-color, #818cf8) 22%, transparent);
    }
    .lane-stripe-header {
      display: flex; justify-content: space-between; align-items: center; padding: 10px 12px 8px;
      border-bottom: 1.5px solid color-mix(in srgb, var(--lane-color, #818cf8) 22%, transparent);
      background: color-mix(in srgb, var(--lane-color, #818cf8) 12%, white);
      font-size: 10px; font-weight: 700; letter-spacing: .07em; text-transform: uppercase;
      color: var(--lane-color, #4338ca); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .lane-stripe-header span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; }
    .lane-stripe-header strong {
      flex-shrink: 0; margin-left: 6px; min-width: 20px; height: 20px;
      display: grid; place-items: center; border-radius: 50%; background: #fff;
      color: var(--lane-color, #4338ca); font-size: 10px;
      border: 1.5px solid color-mix(in srgb, var(--lane-color, #818cf8) 30%, transparent);
    }

    .stage-node {
      background: #fff; border: 1.5px solid #e2e8f0; border-radius: 16px; padding: 12px 14px;
      cursor: pointer; transition: box-shadow .15s, border-color .15s, transform .1s; position: relative;
    }
    .stage-node:hover { transform: translateY(-1px); box-shadow: 0 4px 14px rgba(0,0,0,.06); }
    .stage-node.selected { border-color: #4f46e5; box-shadow: 0 0 0 3px rgba(79,70,229,.13); }
    .stage-node.locked-by-other { opacity: .68; cursor: not-allowed; box-shadow: inset 0 0 0 2px rgba(239,68,68,.18); }
    .stage-node.locked-by-other:hover { transform: none; box-shadow: inset 0 0 0 2px rgba(239,68,68,.18); }
    .stage-node.connecting-target { border-color: #4f46e5; border-style: dashed; box-shadow: 0 0 0 3px rgba(79,70,229,.1); cursor: crosshair; }
    .stage-node.connecting-source { border-color: #4f46e5; box-shadow: 0 0 0 4px rgba(79,70,229,.2); opacity: .8; }
    .stage-node.nt-process { border-left: 4px solid #2563eb; }
    .node-top-row { display: flex; align-items: center; gap: 6px; margin-bottom: 8px; }
    .node-order   { font-size: 10px; font-weight: 700; color: #94a3b8; }
    .node-title   { display: block; font-size: 14px; font-weight: 600; color: #0f172a; margin-bottom: 3px; }
    .node-desc    { font-size: 11px; color: #94a3b8; margin: 0 0 8px; }
    .stage-pill   { background: #eef2ff; color: #4f46e5; padding: 2px 10px; border-radius: 99px; font-size: 13px; }
    .node-bottom-row { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; }
    .sla-pill { font-size: 10px; font-weight: 600; color: #4f46e5; background: #eef2ff; padding: 2px 8px; border-radius: 99px; }

    .node-circle {
      background: transparent !important; border: none !important; box-shadow: none !important;
      border-radius: 0 !important; padding: 8px 4px !important;
      display: flex; flex-direction: column; align-items: center; gap: 8px; position: relative;
    }
    .node-circle.selected .circle-body { outline: 3px solid #4f46e5; outline-offset: 4px; }
    .node-circle.connecting-target .circle-body { outline: 2px dashed #4f46e5; outline-offset: 4px; }
    .circle-body { width: 70px; height: 70px; border-radius: 50%; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
    .start-body  { background: #1e293b; box-shadow: 0 3px 12px rgba(30,41,59,.35); }
    .end-body    { background: transparent; border: 4px solid #1e293b; box-shadow: 0 3px 12px rgba(30,41,59,.25); }
    .end-inner   { width: 44px; height: 44px; border-radius: 50%; background: #1e293b; }
    .circle-label { font-size: 11px; font-weight: 700; color: #0f172a; text-align: center; max-width: 100px; word-break: break-word; line-height: 1.3; }

    .node-diamond-wrap {
      background: transparent !important; border: none !important; box-shadow: none !important;
      border-radius: 0 !important; padding: 8px 4px !important;
      display: flex; flex-direction: column; align-items: center; gap: 8px; position: relative;
    }
    .node-diamond-wrap.selected .diamond-shape { outline: 3px solid #4f46e5; outline-offset: 6px; }
    .node-diamond-wrap.connecting-target .diamond-shape { outline: 2px dashed #4f46e5; outline-offset: 6px; }
    .diamond-shape { width: 90px; height: 90px; background: #fef3c7; border: 2.5px solid #d97706; transform: rotate(45deg); border-radius: 10px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; box-shadow: 0 3px 12px rgba(217,119,6,.2); }
    .diamond-content { transform: rotate(-45deg); text-align: center; padding: 4px; width: 72px; }
    .diamond-name { font-size: 11px; font-weight: 700; color: #78350f; display: block; word-break: break-word; line-height: 1.25; }
    .decision-branches { display: flex; justify-content: space-between; width: 110px; margin-top: -2px; }
    .branch-label { display: flex; align-items: center; gap: 2px; font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 99px; }
    .branch-yes { background: #dcfce7; color: #15803d; }
    .branch-no  { background: #fee2e2; color: #dc2626; }

    .stage-node.node-fork-wrap, .stage-node.node-fork-wrap.free-node {
      background: transparent !important; border: none !important; box-shadow: none !important;
      border-radius: 0 !important; padding: 4px 0 !important; width: auto !important; min-width: 0 !important;
      display: flex; flex-direction: column; align-items: center; gap: 4px; cursor: pointer;
    }
    .stage-node.node-fork-wrap:hover { transform: none !important; box-shadow: none !important; }
    .stage-node.node-fork-wrap.selected .fork-bar { outline: 3px solid #4f46e5; outline-offset: 3px; }
    .stage-node.node-fork-wrap.connecting-target .fork-bar { outline: 2px dashed #4f46e5; outline-offset: 3px; }
    .stage-node.node-fork-wrap.connecting-source .fork-bar { outline: 3px solid #4f46e5; outline-offset: 3px; }
    .stage-node.node-fork-wrap:hover .connect-handle { opacity: 1; }
    .fork-bar { width: 150px; height: 10px; background: #1e293b; border-radius: 2px; flex-shrink: 0; }
    .fork-type-label { font-size: 10px; font-weight: 700; color: #1e293b; }
    .fork-name { font-size: 11px; font-weight: 500; color: #475569; text-align: center; max-width: 155px; word-break: break-word; line-height: 1.3; }

    .connect-handle {
      margin-left: auto; width: 24px; height: 24px; border-radius: 8px;
      border: none; background: transparent; cursor: pointer;
      display: grid; place-items: center; color: #94a3b8;
      opacity: 0; transition: opacity .15s, background .15s, color .15s; padding: 0;
    }
    .connect-handle mat-icon { font-size: 16px; width: 16px; height: 16px; }
    .stage-node:hover .connect-handle { opacity: 1; }
    .connect-handle:hover { background: #eef2ff; color: #4f46e5; }

    .panel-tab.active { background: #fff; color: #4f46e5; box-shadow: 0 1px 4px rgba(0,0,0,.08); }

  `]
})

export class WorkflowEditorComponent implements OnInit, OnDestroy {

  @Input() id!: string;
  @ViewChild('boardWrap') boardWrapRef?: ElementRef<HTMLDivElement>;
  @ViewChild('lanesGrid') lanesGridRef?: ElementRef<HTMLDivElement>;

  private api    = inject(ApiService);
  readonly auth  = inject(AuthService);
  private snack  = inject(MatSnackBar);
  private router = inject(Router);
  private collab = inject(WorkflowCollaborationService);

  // ── State ────────────────────────────────────────────────────────────────
  workflow             = signal<Workflow | null>(null);
  departments          = signal<Department[]>([]);
  jobRoles             = signal<JobRole[]>([]);
  allJobRoles          = signal<JobRole[]>([]);
  loading              = signal(true);
  selectedStage        = signal<Stage | null>(null);
  selectedTransitionId = signal<string | null>(null);
  connectingFromId     = signal<string | null>(null);
  connectingLabel      = signal<string>('');
  draggingId           = signal<string | null>(null);
  stagePositions       = signal<Map<string, {x: number; y: number}>>(new Map());
  stageLocks           = signal<Map<string, WorkflowStageLock>>(new Map());
  pendingLockStageId   = signal<string | null>(null);
  paletteDragType      = signal<string | null>(null);
  canvasLaneIds        = signal<Set<string>>(new Set());
  private justDragged  = false;

  readonly LANE_W   = 300;
  readonly LANE_GAP = 20;
  readonly ROW_H    = 260;
  svgConnections       = signal<SvgConnection[]>([]);
  svgW                 = signal(0);
  svgH                 = signal(0);
  cursorX              = signal(0);
  cursorY              = signal(0);

  // ── AI panel ──────────────────────────────────────────────────────────────
  aiTab             = signal<'inspector' | 'worky' | 'create' | 'analyze'>('inspector');
  aiCommand         = '';
  aiLoading         = signal(false);
  aiResponse        = signal<any>(null);
  aiHistory         = signal<Array<{role: string; content: string}>>([]);
  workyLoading      = signal(false);
  workyAssistant    = signal<WorkyAssistantResponse | null>(null);
  bottleneckLoading = signal(false);
  bottleneckResult  = signal<any>(null);
  private workyAutoRefreshTimer: ReturnType<typeof setTimeout> | null = null;

  // Stage edit form
  editForm: StageEditForm = this.emptyEditForm();

  // Transition edit form
  transEditName         = '';
  transEditMode: ForwardMode = 'all';
  transEditFields: string[]  = [];
  transEditIncludeFiles = false;

  readonly fieldTypes: FieldType[] = ['TEXT', 'NUMBER', 'DATE', 'FILE'];

  // ── Computed ──────────────────────────────────────────────────────────────
  selectedTransition = computed(() => {
    const id = this.selectedTransitionId();
    if (!id) return null;
    return this.workflow()?.transitions.find(t => t.id === id) ?? null;
  });

  availableDepartments = computed(() => {
    const workflow = this.workflow();
    const companyId = workflow?.companyId;
    if (!companyId) return [];
    return this.departments()
      .filter(department => department.companyId === companyId)
      .sort((a, b) => a.name.localeCompare(b.name));
  });

  availableLanesToAdd = computed(() => {
    const current = this.canvasLaneIds();
    return this.availableDepartments().filter(d => !current.has(d.id));
  });

  sourceStageFields = computed(() => {
    const trans = this.selectedTransition();
    if (!trans) return [];
    const wf = this.workflow();
    if (!wf) return [];
    return this.getStageForwardableFields(trans.fromStageId, wf);
    // Bifurcación / Unión actúan como pass-through:
    // muestran los campos que ENTRAN al nodo, no los suyos propios
  });

  // ── Helpers para controlar límites de conexiones en la UI ─────────────────

  /** true si ya existe una transición saliente con esa etiqueta */
  hasOutgoingLabel(stageId: string, label: string): boolean {
    return !!this.workflow()?.transitions?.find(t => t.fromStageId === stageId && t.name === label);
  }

  /** true si el nodo puede añadir más conexiones salientes */
  canAddOutgoing(stage: Stage): boolean {
    const wf = this.workflow();
    if (!wf) return false;
    const type     = this.nodeType(stage);
    const outgoing = wf.transitions.filter(t => t.fromStageId === stage.id).length;
    if (type === 'end')      return false;
    if (type === 'fork')     return true;          // ilimitado
    if (type === 'decision' || type === 'loop') return outgoing < 2;
    return outgoing < 1;  // start, process, join → máx 1
  }

  /** true si el nodo puede recibir más conexiones entrantes */
  canAddIncoming(stage: Stage): boolean {
    const wf = this.workflow();
    if (!wf) return false;
    const type     = this.nodeType(stage);
    const incoming = wf.transitions.filter(t => t.toStageId === stage.id).length;
    if (type === 'start')                return false;
    if (type === 'join' || type === 'end' || type === 'process') return true; // ilimitado
    return incoming < 1; // fork, decision, loop → máx 1
  }

  /** Etiqueta descriptiva del nodo fuente para el inspector de transición */
  transitionSourceLabel(trans: Transition): string {
    const wf = this.workflow();
    if (!wf) return '';
    const src  = wf.stages.find(s => s.id === trans.fromStageId);
    if (!src) return '';
    const type = this.nodeType(src);
    if (type === 'fork') return `(datos que pasan a través de la Bifurcación "${src.name}")`;
    if (type === 'join') return `(datos que pasan a través de la Unión "${src.name}")`;
    if (type === 'decision') return `(datos que pasan a través de la Decisión "${src.name}")`;
    if (type === 'loop') return `(datos que pasan a través de la Iteración "${src.name}")`;
    return src.name;
  }

  /** For a selected stage: what fields/data is arriving from upstream stages */
  incomingDataForSelected = computed(() => {
    const stage = this.selectedStage();
    const wf    = this.workflow();
    if (!stage || !wf) return [];

    return wf.transitions
      .filter(t => t.toStageId === stage.id && (t.forwardConfig?.mode ?? 'all') !== 'none')
      .map(t => {
        const srcStage  = wf.stages.find(s => s.id === t.fromStageId);
        const mode      = t.forwardConfig?.mode ?? 'all';
        const fields = this.getTransitionForwardedFields(t, wf)
          .map(f => ({ label: f.label, name: f.name, type: f.type }));

        return {
          transitionId:   t.id,
          transitionName: t.name ?? '',
          fromStageName:  srcStage?.name ?? t.fromStageId,
          mode,
          fields,
          includeFiles: t.forwardConfig?.includeFiles ?? false
        };
      });
  });

  private getTransitionForwardedFields(
    transition: Transition,
    wf: Workflow,
    visitedStages = new Set<string>()
  ): FormField[] {
    const sourceFields = this.getStageForwardableFields(transition.fromStageId, wf, visitedStages);
    const mode = transition.forwardConfig?.mode ?? 'all';
    const fieldNames = transition.forwardConfig?.fieldNames ?? [];

    if (mode === 'none' || mode === 'files-only') return [];
    if (mode === 'selected') {
      return sourceFields.filter(field => fieldNames.includes(field.name));
    }
    return sourceFields;
  }

  private getStageForwardableFields(
    stageId: string,
    wf: Workflow,
    visitedStages = new Set<string>()
  ): FormField[] {
    if (visitedStages.has(stageId)) return [];
    visitedStages.add(stageId);

    const stage = wf.stages.find(s => s.id === stageId);
    if (!stage) return [];

    const type = this.nodeType(stage);
    if (!this.isPassThroughNodeType(type)) {
      return this.dedupeFieldsByName(stage.formDefinition?.fields ?? []);
    }

    const incomingTransitions = wf.transitions.filter(t => t.toStageId === stage.id);
    const forwardedFields = incomingTransitions.flatMap(transition =>
      this.getTransitionForwardedFields(transition, wf, new Set(visitedStages))
    );

    return this.dedupeFieldsByName(forwardedFields);
  }

  private dedupeFieldsByName(fields: FormField[]): FormField[] {
    const seen = new Set<string>();
    const deduped: FormField[] = [];
    for (const field of fields) {
      if (seen.has(field.name)) continue;
      seen.add(field.name);
      deduped.push(field);
    }
    return deduped;
  }

  allStages = computed(() => this.workflow()?.stages ?? []);

  canvasW = computed(() => {
    const n = this.lanes().length;
    return Math.max(n * (this.LANE_W + this.LANE_GAP) + this.LANE_GAP, 800);
  });

  canvasH = computed(() => {
    const positions = this.stagePositions();
    let maxY = 700;
    positions.forEach(p => { if (p.y + 250 > maxY) maxY = p.y + 250; });
    return maxY;
  });

  /** Dashed orthogonal line from source stage bottom to cursor while drawing a connection */
  inProgressPath = computed((): string => {
    const fromId = this.connectingFromId();
    if (!fromId) return '';
    const wrap = this.boardWrapRef?.nativeElement;
    if (!wrap) return '';
    const fromEl = wrap.querySelector<HTMLElement>(`[data-stage-id="${fromId}"]`);
    if (!fromEl) return '';
    const fromShape = fromEl.querySelector<HTMLElement>('.uml-shape') ?? fromEl;
    const bRect     = wrap.getBoundingClientRect();
    const r         = fromShape.getBoundingClientRect();
    const sl = wrap.scrollLeft, st = wrap.scrollTop;
    const x1 = (r.left + r.right) / 2 - bRect.left + sl;
    const y1 = r.bottom - bRect.top + st;
    const x2 = this.cursorX();
    const y2 = this.cursorY();
    if (Math.abs(x1 - x2) < 4) return `M${x1},${y1} L${x2},${y2}`;
    const midY = (y1 + y2) / 2;
    return `M${x1},${y1} L${x1},${midY} L${x2},${midY} L${x2},${y2}`;
  });

  // ── Lifecycle ─────────────────────────────────────────────────────────────
  constructor() {
    afterRender(() => { this.computeConnections(); });
    effect(() => {
      if (!this.workflow() || this.aiTab() !== 'worky') return;
      this.scheduleWorkyRefresh();
    });
  }

  ngOnInit() {
    this.connectCollaboration();
    this.load();
  }

  ngOnDestroy() {
    if (this.collabConnectTimer) {
      clearTimeout(this.collabConnectTimer);
      this.collabConnectTimer = null;
    }
    if (this.workyAutoRefreshTimer) {
      clearTimeout(this.workyAutoRefreshTimer);
      this.workyAutoRefreshTimer = null;
    }
    const selected = this.selectedStage();
    if (selected && this.isStageLockedByMe(selected.id)) {
      this.collab.unlockStage(selected.id);
    }
    this.collab.disconnect();
  }

  @HostListener('document:keydown.escape')
  onEscape() { this.cancelConnect(); }

  // ── Data loading ──────────────────────────────────────────────────────────
  load(afterLoad?: () => void) {
    this.loading.set(true);
    this.api.get<Workflow>(`/workflows/${this.id}`).subscribe({
      next: wf => {
        this.workflow.set(wf);
        const seedIds = new Set(wf.stages.map((s: Stage) => s.responsibleDepartmentId).filter((v): v is string => Boolean(v)));
        this.canvasLaneIds.set(seedIds);
        const companyId = wf.companyId;
        const departmentsRequest = companyId
          ? this.api.get<Department[]>(`/departments?companyId=${companyId}`)
          : this.api.get<Department[]>('/departments');

        departmentsRequest.subscribe({
          next: departments => {
            this.departments.set(departments);
            this.loading.set(false);
            this.initPositions(wf);
            afterLoad?.();
            // Load all job roles for AI context
            const deptIds = departments.map((d: any) => d.id);
            Promise.all(deptIds.map((did: string) =>
              firstValueFrom(this.api.get<JobRole[]>(`/job-roles?departmentId=${did}`)).catch(() => [] as JobRole[])
            )).then(results => {
              const flat = (results as JobRole[][]).flat();
              this.allJobRoles.set(flat);
            });
            const sel = this.selectedStage();
            if (sel) {
              const refreshed = wf.stages.find(s => s.id === sel.id) ?? null;
              this.selectedStage.set(refreshed);
              if (refreshed) this.loadStageIntoForm(refreshed);
            }
          },
          error: () => {
            this.departments.set([]);
            this.loading.set(false);
            this.snack.open('No se pudieron cargar los departamentos', '', { duration: 2500 });
          }
        });
      },
      error: () => { this.loading.set(false); this.snack.open('Error al cargar workflow', '', { duration: 2500 }); }
    });
  }

  goBack() { this.router.navigate(['/workflows']); }

  // ── SVG connection drawing — orthogonal routing ──────────────────────────

  /** Extract canvas-relative rect of a node's visual shape */
  private nodeRect(el: HTMLElement, wrap: HTMLElement, bRect: DOMRect) {
    const shape = el.querySelector<HTMLElement>('.uml-shape') ?? el;
    const r  = shape.getBoundingClientRect();
    const sl = wrap.scrollLeft, st = wrap.scrollTop;
    return {
      cx:     (r.left + r.right)  / 2 - bRect.left + sl,
      cy:     (r.top  + r.bottom) / 2 - bRect.top  + st,
      top:    r.top    - bRect.top  + st,
      bottom: r.bottom - bRect.top  + st,
      left:   r.left   - bRect.left + sl,
      right:  r.right  - bRect.left + sl,
    };
  }

  /**
   * Exit anchor for a node.
   * All nodes exit from BOTTOM by default.
   * Decision false-branch and Loop exit-branch exit from RIGHT.
   */
  private exitAnchor(
    el: HTMLElement, type: NodeVisualType,
    wrap: HTMLElement, bRect: DOMRect,
    branchSide: 'true' | 'false' | 'none' = 'none'
  ): { x: number; y: number; dir: 'bottom' | 'right' } {
    const nr = this.nodeRect(el, wrap, bRect);
    if ((type === 'decision' || type === 'loop') && branchSide === 'false') {
      return { x: nr.right, y: nr.cy, dir: 'right' };
    }
    return { x: nr.cx, y: nr.bottom, dir: 'bottom' };
  }

  /**
   * Entry anchor for a node.
   * All nodes are entered from TOP.
   */
  private entryAnchor(
    el: HTMLElement, _type: NodeVisualType,
    wrap: HTMLElement, bRect: DOMRect
  ): { x: number; y: number; dir: 'top' } {
    const nr = this.nodeRect(el, wrap, bRect);
    return { x: nr.cx, y: nr.top, dir: 'top' };
  }

  /**
   * Build a clean orthogonal (right-angle) SVG path between two anchor points.
   *   bottom → top : vertical segments with horizontal bridge at midpoint Y
   *   right  → top : horizontal segment to target X, then vertical up/down
   */
  private orthogonalPath(
    p1: { x: number; y: number; dir: 'bottom' | 'right' },
    p2: { x: number; y: number; dir: 'top' },
    isBackEdge: boolean
  ): string {
    const { x: x1, y: y1 } = p1;
    const { x: x2, y: y2 } = p2;

    if (isBackEdge) {
      const swingX = Math.max(x1, x2) + 90;
      return `M${x1},${y1} L${swingX},${y1} L${swingX},${y2} L${x2},${y2}`;
    }

    if (p1.dir === 'right') {
      // Exit right → go horizontally to target column, then vertically
      if (Math.abs(y1 - y2) < 4) {
        // Nearly same height — straight horizontal
        return `M${x1},${y1} L${x2},${y2}`;
      }
      return `M${x1},${y1} L${Math.max(x1 + 20, x2)},${y1} L${Math.max(x1 + 20, x2)},${y2} L${x2},${y2}`;
    }

    // dir === 'bottom' → top
    if (Math.abs(x1 - x2) < 4) {
      // Same column — straight vertical line
      return `M${x1},${y1} L${x2},${y2}`;
    }
    const midY = (y1 + y2) / 2;
    return `M${x1},${y1} L${x1},${midY} L${x2},${midY} L${x2},${y2}`;
  }

  computeConnections() {
    const wrap = this.boardWrapRef?.nativeElement;
    const grid = this.lanesGridRef?.nativeElement;
    const wf   = this.workflow();
    if (!wrap || !grid || !wf) return;

    const bRect    = wrap.getBoundingClientRect();
    const gridRect = grid.getBoundingClientRect();

    // Only update SVG size signals when values actually change
    // (avoids triggering a re-render → afterRender loop)
    const newW = Math.max(gridRect.width  + 80, 400);
    const newH = Math.max(gridRect.height + 80, 300);
    if (newW !== this.svgW()) this.svgW.set(newW);
    if (newH !== this.svgH()) this.svgH.set(newH);

    const selectedId = this.selectedTransitionId();
    const connections: SvgConnection[] = [];

    for (const t of wf.transitions) {
      const fromEl = wrap.querySelector<HTMLElement>(`[data-stage-id="${t.fromStageId}"]`);
      const toEl   = wrap.querySelector<HTMLElement>(`[data-stage-id="${t.toStageId}"]`);
      if (!fromEl || !toEl) continue;

      const fromStage = wf.stages.find(s => s.id === t.fromStageId);
      const toStage   = wf.stages.find(s => s.id === t.toStageId);
      const fromType  = this.nodeType(fromStage!);
      const toType    = this.nodeType(toStage!);

      const isDecision    = fromType === 'decision';
      const isLoop        = fromType === 'loop';
      const isTrueBranch  = isDecision && t.name === (fromStage?.trueLabel  ?? 'Sí');
      const isFalseBranch = isDecision && t.name === (fromStage?.falseLabel ?? 'No');
      const isLoopRepeat  = isLoop     && t.name === (fromStage?.trueLabel  ?? 'Repetir');
      const isLoopExit    = isLoop     && t.name === (fromStage?.falseLabel ?? 'Salir');
      const isBackEdge    = !!fromStage && !!toStage && fromStage.order > toStage.order;

      const branchSide: 'true' | 'false' | 'none' =
        isTrueBranch || isLoopRepeat ? 'true' :
        isFalseBranch || isLoopExit  ? 'false' : 'none';

      const p1 = this.exitAnchor(fromEl, fromType, wrap, bRect, branchSide);
      const p2 = this.entryAnchor(toEl, toType, wrap, bRect);

      let color = '#1e293b';
      if (isTrueBranch)  color = '#16a34a';
      if (isFalseBranch) color = '#ea580c';
      if (isLoopExit)    color = '#ea580c';
      if (isBackEdge)    color = '#7c3aed';

      const path = this.orthogonalPath(p1, p2, isBackEdge);

      // Label at midpoint of the path
      const lx = p1.dir === 'right'
        ? (p1.x + Math.max(p1.x + 20, p2.x)) / 2
        : p1.x;
      const ly = p1.dir === 'right'
        ? p1.y - 10
        : (p1.y + p2.y) / 2 - 10;

      connections.push({
        transitionId: t.id,
        path,
        label:  t.name ?? '',
        labelX: lx,
        labelY: ly,
        selected: t.id === selectedId,
        color
      });
    }
    // Only update connections signal when content actually changed
    const prev = this.svgConnections();
    const changed = prev.length !== connections.length || connections.some((c, i) => {
      const p = prev[i];
      return !p || p.path !== c.path || p.selected !== c.selected
          || p.color !== c.color || p.label !== c.label;
    });
    if (changed) this.svgConnections.set(connections);
  }

  markerSuffix(color: string): string {
    if (color === '#16a34a') return 'true';
    if (color === '#ea580c') return 'false';
    if (color === '#7c3aed') return 'iterative';
    return 'default';
  }

  // ── Free drag (mouse-based) ────────────────────────────────────────────────
  private dragOffset   = { x: 0, y: 0 };
  private dragStartPos = { x: 0, y: 0 };
  private dragInitialNodePos = { x: 0, y: 0 };
  private didMove      = false;
  private lastMoveBroadcastAt = 0;
  private collabConnectTimer: ReturnType<typeof setTimeout> | null = null;

  /** Returns the canvas position for a stage, falling back to layout defaults */
  stagePos(stageId: string): { x: number; y: number } {
    return this.stagePositions().get(stageId) ?? { x: 0, y: 60 };
  }

  /** Called once after each load() to set/keep node positions */
  private initPositions(wf: Workflow) {
    // Always start fresh so stale in-memory positions don't override DB data.
    // Persisted posX/posY (saved on drag) are trusted; null values get a
    // lane-aware grid position so AI-generated stages land in their lane.
    const next = new Map<string, { x: number; y: number }>();

    const laneList = this.lanes();
    laneList.forEach((laneId, li) => {
      this.laneStages(laneId).forEach((stage, si) => {
        next.set(stage.id, {
          x: stage.posX ?? (li * (this.LANE_W + this.LANE_GAP) + this.LANE_GAP),
          y: stage.posY ?? (si * this.ROW_H + 60)
        });
      });
    });

    // Stages not belonging to any lane (no department assigned)
    for (const stage of wf.stages) {
      if (!next.has(stage.id)) {
        next.set(stage.id, { x: stage.posX ?? 16, y: stage.posY ?? 60 });
      }
    }

    this.stagePositions.set(next);
  }

  private normalizeStageForCanvas(stage: Stage): Stage {
    const defaultDepartmentId = stage.responsibleDepartmentId ?? this.availableDepartments()[0]?.id ?? '';
    const departmentName = stage.responsibleDepartmentName
      ?? this.departments().find(department => department.id === defaultDepartmentId)?.name
      ?? '';
    return {
      ...stage,
      responsibleDepartmentId: defaultDepartmentId,
      responsibleDepartmentName: departmentName,
      description: stage.description ?? '',
      requiresForm: !!stage.requiresForm,
      slaHours: stage.slaHours ?? 24,
      nodeType: stage.nodeType ?? 'process',
      isConditional: !!stage.isConditional,
      trueLabel: stage.trueLabel ?? (stage.nodeType === 'loop' ? 'Repetir' : 'Si'),
      falseLabel: stage.falseLabel ?? (stage.nodeType === 'loop' ? 'Salir' : 'No')
    };
  }

  private applyStageCreated(stageInput: CollaborativeWorkflowStage | Stage, options?: {
    select?: boolean;
    broadcast?: boolean;
  }) {
    const workflow = this.workflow();
    if (!workflow || !stageInput?.id) return;

    const stage = this.normalizeStageForCanvas(stageInput as Stage);
    const existingIndex = workflow.stages.findIndex(existing => existing.id === stage.id);
    const nextStages = [...workflow.stages];

    if (existingIndex >= 0) {
      nextStages[existingIndex] = { ...nextStages[existingIndex], ...stage };
    } else {
      nextStages.push(stage);
      nextStages.sort((a, b) => a.order - b.order);
    }

    this.workflow.set({
      ...workflow,
      stages: nextStages
    });

    // Auto-add the stage's department to the canvas lane set
    const stageDept = stage.responsibleDepartmentId;
    if (stageDept) {
      const laneSet = new Set(this.canvasLaneIds());
      laneSet.add(stageDept);
      this.canvasLaneIds.set(laneSet);
    }

    this.stagePositions.update(current => {
      const next = new Map(current);
      if (!next.has(stage.id) && stage.posX == null && stage.posY == null) {
        // No persisted position — calculate from lane grid so the node lands in its lane
        const currentLanes = this.lanes();
        let laneIdx = stageDept ? currentLanes.indexOf(stageDept) : -1;
        if (laneIdx === -1 && stageDept) laneIdx = currentLanes.length; // new lane, will be appended
        const x = laneIdx >= 0
          ? laneIdx * (this.LANE_W + this.LANE_GAP) + this.LANE_GAP
          : 16;
        const sibling = (this.workflow()?.stages ?? []).filter(s => s.responsibleDepartmentId === stageDept && s.id !== stage.id);
        const y = sibling.length * 190 + 60;
        next.set(stage.id, { x: Math.round(x), y: Math.round(y) });
      } else {
        next.set(stage.id, {
          x: Math.round(stage.posX ?? next.get(stage.id)?.x ?? 16),
          y: Math.round(stage.posY ?? next.get(stage.id)?.y ?? 60)
        });
      }
      return next;
    });

    if (options?.select) {
      this.selectStage(stage);
    }

    setTimeout(() => this.computeConnections(), 0);
  }

  private applyStageDeleted(stageId: string) {
    const workflow = this.workflow();
    if (!workflow) return;

    const nextStages = workflow.stages.filter(stage => stage.id !== stageId);
    const nextTransitions = workflow.transitions.filter(transition =>
      transition.fromStageId !== stageId && transition.toStageId !== stageId
    );

    this.workflow.set({
      ...workflow,
      stages: nextStages,
      transitions: nextTransitions
    });

    this.stagePositions.update(current => {
      const next = new Map(current);
      next.delete(stageId);
      return next;
    });

    this.stageLocks.update(current => {
      const next = new Map(current);
      next.delete(stageId);
      return next;
    });

    if (this.selectedStage()?.id === stageId) {
      this.clearSelection();
    }

    setTimeout(() => this.computeConnections(), 0);
  }

  private normalizeTransitionForCanvas(transition: Transition | CollaborativeWorkflowTransition): Transition {
    return {
      id: transition.id,
      workflowId: transition.workflowId,
      fromStageId: transition.fromStageId,
      toStageId: transition.toStageId,
      name: transition.name ?? '',
      condition: transition.condition,
      forwardConfig: transition.forwardConfig as ForwardConfig | undefined
    };
  }

  private applyTransitionCreated(transitionInput: Transition | CollaborativeWorkflowTransition, options?: {
    select?: boolean;
  }) {
    const workflow = this.workflow();
    if (!workflow || !transitionInput?.id) return;

    const transition = this.normalizeTransitionForCanvas(transitionInput);
    const existingIndex = workflow.transitions.findIndex(existing => existing.id === transition.id);
    const nextTransitions = [...workflow.transitions];

    if (existingIndex >= 0) {
      nextTransitions[existingIndex] = { ...nextTransitions[existingIndex], ...transition };
    } else {
      nextTransitions.push(transition);
    }

    this.workflow.set({
      ...workflow,
      transitions: nextTransitions
    });

    if (options?.select) {
      this.selectTransitionById(transition.id);
    } else {
      this.computeConnections();
    }
  }

  private applyTransitionDeleted(transitionId: string) {
    const workflow = this.workflow();
    if (!workflow) return;

    this.workflow.set({
      ...workflow,
      transitions: workflow.transitions.filter(transition => transition.id !== transitionId)
    });

    if (this.selectedTransitionId() === transitionId) {
      this.selectedTransitionId.set(null);
    }

    setTimeout(() => this.computeConnections(), 0);
  }

  onNodeMouseDown(stage: Stage, evt: MouseEvent) {
    if (evt.button !== 0) return;
    evt.stopPropagation();
    evt.preventDefault();
    if (this.isStageLockedByOther(stage.id)) {
      this.snack.open(this.stageLockTitle(stage.id), '', { duration: 2500 });
      return;
    }
    // selectStage handles the lock — no duplicate lock here
    if (this.selectedStage()?.id !== stage.id) {
      const prev = this.selectedStage();
      if (prev && this.collab.isConnected() && this.isStageLockedByMe(prev.id)) {
        this.collab.unlockStage(prev.id);
      }
      this.selectStage(stage);
    }
    this.startDragInteraction(stage, evt);
  }

  onMouseUp(evt: MouseEvent) {
    const id = this.draggingId();
    if (!id) return;

    if (this.didMove) {
      const pos = this.stagePos(id);
      this.collab.moveStage(id, pos.x, pos.y);
      this.api.patch(`/workflow-stages/${id}`, { posX: pos.x, posY: pos.y })
        .subscribe({ error: () => {} });
      evt.stopPropagation();
      // After drag, unlock immediately — lock is only for inspector editing
      if (this.isStageLockedByMe(id)) {
        this.collab.unlockStage(id);
      }
      this.justDragged = true;
      setTimeout(() => { this.justDragged = false; }, 300);
    }

    this.draggingId.set(null);
    this.didMove = false;
    this.lastMoveBroadcastAt = 0;
  }

  // ── Mouse tracking ─────────────────────────────────────────────────────────
  onMouseMove(evt: MouseEvent) {
    const wrap = this.boardWrapRef?.nativeElement;
    if (!wrap) return;
    const bRect = wrap.getBoundingClientRect();

    // Free drag
    const draggingId = this.draggingId();
    if (draggingId) {
      const dx = Math.abs(evt.clientX - this.dragStartPos.x);
      const dy = Math.abs(evt.clientY - this.dragStartPos.y);
      if (dx > 3 || dy > 3) this.didMove = true;

      if (this.didMove) {
        const rawX = evt.clientX - bRect.left + wrap.scrollLeft - this.dragOffset.x;
        const rawY = evt.clientY - bRect.top  + wrap.scrollTop  - this.dragOffset.y;
        const next = new Map(this.stagePositions());
        const x = Math.max(0, rawX);
        const y = Math.max(0, rawY);
        next.set(draggingId, { x, y });
        this.stagePositions.set(next);
        this.computeConnections();
        const now = Date.now();
        if (now - this.lastMoveBroadcastAt > 40) {
          this.collab.moveStage(draggingId, x, y);
          this.lastMoveBroadcastAt = now;
        }
      }
      return; // don't update connection cursor while dragging a node
    }

    // Connection-mode cursor tracking
    if (this.connectingFromId()) {
      this.cursorX.set(evt.clientX - bRect.left + wrap.scrollLeft);
      this.cursorY.set(evt.clientY - bRect.top  + wrap.scrollTop);
    }
  }

  // ── Connection mode ────────────────────────────────────────────────────────
  startConnect(stage: Stage, label = '') {
    if (this.isStageLockedByOther(stage.id)) {
      this.snack.open(this.stageLockTitle(stage.id), '', { duration: 2500 });
      return;
    }
    this.clearSelection();
    this.connectingFromId.set(stage.id);
    this.connectingLabel.set(label);
  }

  cancelConnect() {
    this.connectingFromId.set(null);
    this.connectingLabel.set('');
  }

  // ── Stage click (handles both select and connect-target) ──────────────────
  onStageClick(stage: Stage) {
    if (this.justDragged) { this.justDragged = false; return; }
    if (this.isStageLockedByOther(stage.id)) {
      this.snack.open(this.stageLockTitle(stage.id), '', { duration: 2500 });
      return;
    }
    const fromId = this.connectingFromId();
    if (fromId && fromId !== stage.id) {
      // Complete the connection
      this.createTransitionDirect(fromId, stage.id);
    } else if (!fromId) {
      this.requestStageLock(stage);
    }
  }

  private createTransitionDirect(fromId: string, toId: string) {
    const wf = this.workflow();
    if (!wf) return;

    const fromStage = wf.stages.find(s => s.id === fromId);
    const toStage   = wf.stages.find(s => s.id === toId);
    if (!fromStage || !toStage) return;

    const fromType = this.nodeType(fromStage);
    const toType   = this.nodeType(toStage);

    // Conexión duplicada
    if (wf.transitions.some(t => t.fromStageId === fromId && t.toStageId === toId)) {
      this.snack.open('Ya existe una conexión entre estas etapas', '', { duration: 2500 });
      this.connectingFromId.set(null); return;
    }

    // ── Límites de conexiones salientes ──
    const outgoing = wf.transitions.filter(t => t.fromStageId === fromId);

    if (fromType === 'end') {
      this.snack.open('El nodo Fin no puede tener conexiones salientes', '', { duration: 2800 });
      this.connectingFromId.set(null); return;
    }
    if ((fromType === 'start' || fromType === 'process' || fromType === 'join') && outgoing.length >= 1) {
      this.snack.open(`Este nodo ya tiene su única conexión saliente permitida`, '', { duration: 2800 });
      this.connectingFromId.set(null); return;
    }
    if ((fromType === 'decision' || fromType === 'loop') && outgoing.length >= 2) {
      this.snack.open('Este nodo solo admite 2 ramas', '', { duration: 2800 });
      this.connectingFromId.set(null); return;
    }

    // ── Límites de conexiones entrantes ──
    const incoming = wf.transitions.filter(t => t.toStageId === toId);

    if (toType === 'start') {
      this.snack.open('El nodo Inicio no puede recibir conexiones', '', { duration: 2800 });
      this.connectingFromId.set(null); return;
    }
    if ((toType === 'fork' || toType === 'loop') && incoming.length >= 1) {
      this.snack.open(`Este nodo solo admite 1 conexión entrante`, '', { duration: 2800 });
      this.connectingFromId.set(null); return;
    }

    const label = this.connectingLabel() || (fromStage?.isConditional ? (fromStage.trueLabel ?? 'Sí') : '');
    this.api.post<Transition>('/workflow-transitions', {
      workflowId: this.id, fromStageId: fromId, toStageId: toId, name: label
    }).subscribe({
      next: (trans) => {
        this.connectingFromId.set(null);
        this.connectingLabel.set('');
        this.snack.open('Conexión creada · configura qué datos pasan por esta flecha', '', { duration: 3500 });
        this.applyTransitionCreated(trans, { select: true });
      },
      error: () => {
        this.connectingFromId.set(null);
        this.connectingLabel.set('');
        this.snack.open('No se pudo crear la conexión', '', { duration: 2500 });
      }
    });
  }

  // ── Selection ──────────────────────────────────────────────────────────────
  selectStage(stage: Stage) {
    this.selectedStage.set(stage);
    this.selectedTransitionId.set(null);
    this.loadStageIntoForm(stage);
  }

  selectTransitionById(id: string) {
    const t = this.workflow()?.transitions.find(tr => tr.id === id);
    if (!t) return;
    const selected = this.selectedStage();
    if (selected && this.isStageLockedByMe(selected.id)) {
      this.collab.unlockStage(selected.id);
    }
    this.selectedTransitionId.set(id);
    this.selectedStage.set(null);
    this.transEditName         = t.name ?? '';
    this.transEditMode         = (t.forwardConfig?.mode ?? 'all') as ForwardMode;
    this.transEditFields       = [...(t.forwardConfig?.fieldNames ?? [])];
    this.transEditIncludeFiles = t.forwardConfig?.includeFiles ?? false;
  }

  clearSelection() {
    const selected = this.selectedStage();
    if (selected && this.collab.isConnected() && this.isStageLockedByMe(selected.id)) {
      this.collab.unlockStage(selected.id);
    }
    this.pendingLockStageId.set(null);
    this.selectedStage.set(null);
    this.selectedTransitionId.set(null);
  }

  onBoardClick(_: MouseEvent) {
    if (this.connectingFromId()) { this.cancelConnect(); return; }
    this.clearSelection();
  }

  // ── Lane helpers ───────────────────────────────────────────────────────────
  lanes(): string[] {
    const stages = this.workflow()?.stages ?? [];
    const presentIds = stages
      .map(s => s.responsibleDepartmentId)
      .filter((v): v is string => Boolean(v));
    const ids = new Set([...this.canvasLaneIds(), ...presentIds]);
    return Array.from(ids);
  }

  addLane(deptId: string) {
    const s = new Set(this.canvasLaneIds());
    s.add(deptId);
    this.canvasLaneIds.set(s);
  }

  removeLane(deptId: string) {
    if (this.laneStages(deptId).length > 0) return;
    const s = new Set(this.canvasLaneIds());
    s.delete(deptId);
    this.canvasLaneIds.set(s);
  }

  autoLayout() {
    const wf = this.workflow();
    if (!wf) return;

    const stages      = wf.stages;
    const transitions = wf.transitions;
    const laneList    = this.lanes();

    // Build graphs
    const succs   = new Map<string, string[]>();
    const preds   = new Map<string, string[]>();
    const inDeg   = new Map<string, number>();
    for (const s of stages) { succs.set(s.id, []); preds.set(s.id, []); inDeg.set(s.id, 0); }
    for (const t of transitions) {
      succs.get(t.fromStageId)?.push(t.toStageId);
      preds.get(t.toStageId)?.push(t.fromStageId);
      inDeg.set(t.toStageId, (inDeg.get(t.toStageId) ?? 0) + 1);
    }

    // Kahn's topological sort — handles cycles by leaving them unvisited then appending
    const tempDeg   = new Map(inDeg);
    const topoOrder: string[] = [];
    const visited   = new Set<string>();
    const queue: string[] = [];
    for (const s of stages) { if ((tempDeg.get(s.id) ?? 0) === 0) queue.push(s.id); }
    while (queue.length) {
      const id = queue.shift()!;
      if (visited.has(id)) continue;
      visited.add(id);
      topoOrder.push(id);
      for (const nxt of (succs.get(id) ?? [])) {
        const d = (tempDeg.get(nxt) ?? 1) - 1;
        tempDeg.set(nxt, d);
        if (d <= 0 && !visited.has(nxt)) queue.push(nxt);
      }
    }
    // Append any stages in cycles (loop nodes etc.)
    for (const s of stages) { if (!visited.has(s.id)) topoOrder.push(s.id); }

    // Assign y: each node's y = max(y of predecessors + ROW_H)
    // Also enforce same-lane anti-overlap: y >= lastUsedY_in_lane + ROW_H
    const yPos       = new Map<string, number>();
    const laneLastY  = new Map<string, number>(); // last placed y per lane

    for (const id of topoOrder) {
      const stage  = stages.find(s => s.id === id);
      if (!stage) continue;
      const laneId = stage.responsibleDepartmentId ?? '__none__';

      // y must be below all predecessors
      let yMin = 60;
      for (const predId of (preds.get(id) ?? [])) {
        const py = yPos.get(predId);
        if (py !== undefined) yMin = Math.max(yMin, py + this.ROW_H);
      }

      // y must also be below the last node placed in this lane (avoid overlap)
      const lastY = laneLastY.get(laneId);
      if (lastY !== undefined) yMin = Math.max(yMin, lastY + this.ROW_H);

      yPos.set(id, yMin);
      laneLastY.set(laneId, yMin);
    }

    // Build final positions and persist
    const next = new Map<string, { x: number; y: number }>();
    for (const stage of stages) {
      const li = laneList.indexOf(stage.responsibleDepartmentId ?? '');
      const x  = li >= 0 ? li * (this.LANE_W + this.LANE_GAP) + this.LANE_GAP : 16;
      const y  = yPos.get(stage.id) ?? 60;
      next.set(stage.id, { x: Math.round(x), y: Math.round(y) });
      this.api.patch(`/workflow-stages/${stage.id}`, { posX: Math.round(x), posY: Math.round(y) }).subscribe();
    }

    this.stagePositions.set(next);
    setTimeout(() => this.computeConnections(), 0);
  }

  laneStages(departmentId: string): Stage[] {
    return (this.workflow()?.stages ?? [])
      .filter(stage => stage.responsibleDepartmentId === departmentId)
      .sort((a, b) => a.order - b.order);
  }

  laneColor(departmentId: string): string {
    const palette = ['#4f46e5', '#0891b2', '#059669', '#7c3aed', '#d97706', '#db2777', '#0284c7', '#475569'];
    const seed = departmentId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0);
    return palette[seed % palette.length];
  }

  departmentLabel(departmentId?: string): string {
    if (!departmentId) return 'Sin departamento';
    return this.departments().find(department => department.id === departmentId)?.name
      ?? this.workflow()?.stages.find(stage => stage.responsibleDepartmentId === departmentId)?.responsibleDepartmentName
      ?? 'Departamento';
  }

  nodeType(stage: Stage): NodeVisualType {
    const t = (stage.nodeType ?? 'process').toLowerCase();
    return (['start','process','decision','end','fork','join','loop'].includes(t) ? t : 'process') as NodeVisualType;
  }

  isProcessNodeType(nodeType: string | null | undefined): boolean {
    return (nodeType ?? 'process').toLowerCase() === 'process';
  }

  isPassThroughNodeType(nodeType: string | null | undefined): boolean {
    return ['decision', 'fork', 'join', 'loop'].includes((nodeType ?? '').toLowerCase());
  }

  getStageName(id: string): string {
    return this.workflow()?.stages.find(s => s.id === id)?.name ?? id;
  }

  transitionsFrom(stageId: string): Transition[] {
    return (this.workflow()?.transitions ?? []).filter(t => t.fromStageId === stageId);
  }

  transitionsFromSelected(): Transition[] {
    const s = this.selectedStage();
    return s ? this.transitionsFrom(s.id) : [];
  }

  // ── Stage CRUD ─────────────────────────────────────────────────────────────
  emptyEditForm(): StageEditForm {
    return {
      name: '', description: '', nodeType: 'process',
      responsibleDepartmentId: '', responsibleJobRoleId: '',
      slaHours: 24, requiresForm: false, isConditional: false,
      condition: '', trueLabel: 'Sí', falseLabel: 'No',
      formTitle: 'Formulario', formFields: []
    };
  }

  loadStageIntoForm(stage: Stage) {
    const type = this.nodeType(stage);
    const deptId = stage.responsibleDepartmentId ?? this.availableDepartments()[0]?.id ?? '';
    const savedJobRoleId = (stage as any).responsibleJobRoleId ?? '';
    const isLoop = type === 'loop';
    const isDecision = type === 'decision';
    const isProcess = this.isProcessNodeType(type);
    this.editForm = {
      name: stage.name, description: isProcess ? (stage.description ?? '') : '',
      nodeType: type,
      responsibleDepartmentId: isProcess ? deptId : '',
      responsibleJobRoleId: '',
      slaHours: isProcess ? (stage.slaHours ?? 24) : 24,
      requiresForm: isProcess ? stage.requiresForm : false,
      isConditional: isLoop || isDecision,
      condition: isLoop || isDecision ? (stage.condition ?? '') : '',
      trueLabel: stage.trueLabel ?? (isLoop ? 'Repetir' : 'Sí'),
      falseLabel: stage.falseLabel ?? (isLoop ? 'Salir' : 'No'),
      formTitle: isProcess ? (stage.formDefinition?.title ?? 'Formulario') : 'Formulario',
      formFields: isProcess
        ? (stage.formDefinition?.fields ?? []).map(f => ({
            ...f,
            isRequired: Boolean((f as any).isRequired ?? (f as any).required),
            type: this.normalizeFieldType(String(f.type ?? 'TEXT')),
            options: f.options ?? []
          }))
        : []
    };
    if (isProcess && deptId) {
      this.loadJobRoles(deptId, savedJobRoleId);
    } else {
      this.jobRoles.set([]);
    }
  }

  loadJobRoles(departmentId: string, preselectId = '') {
    if (!departmentId) { this.jobRoles.set([]); return; }
    this.api.get<JobRole[]>(`/job-roles?departmentId=${departmentId}`).subscribe({
      next: roles => {
        this.jobRoles.set(roles);
        // Set value AFTER options exist so mat-select can match correctly
        if (preselectId) {
          setTimeout(() => { this.editForm.responsibleJobRoleId = preselectId; }, 0);
        }
      },
      error: () => this.jobRoles.set([])
    });
  }

  onDepartmentChange(departmentId: string) {
    this.editForm.responsibleJobRoleId = '';
    this.loadJobRoles(departmentId);
  }

  onNodeTypeChange(nodeType: string) {
    if (this.isProcessNodeType(nodeType)) {
      if (!this.editForm.responsibleDepartmentId) {
        this.editForm.responsibleDepartmentId = this.availableDepartments()[0]?.id ?? '';
      }
      if (this.editForm.responsibleDepartmentId) {
        this.loadJobRoles(this.editForm.responsibleDepartmentId);
      }
      this.editForm.isConditional = false;
      return;
    }

    this.jobRoles.set([]);
    this.editForm.description = '';
    this.editForm.responsibleDepartmentId = '';
    this.editForm.responsibleJobRoleId = '';
    this.editForm.slaHours = 24;
    this.editForm.requiresForm = false;
    this.editForm.formTitle = 'Formulario';
    this.editForm.formFields = [];

    if (nodeType === 'loop') {
      this.editForm.isConditional = true;
      this.editForm.trueLabel = this.editForm.trueLabel || 'Repetir';
      this.editForm.falseLabel = this.editForm.falseLabel || 'Salir';
      return;
    }

    if (nodeType === 'decision') {
      this.editForm.isConditional = true;
      this.editForm.trueLabel = this.editForm.trueLabel || 'Sí';
      this.editForm.falseLabel = this.editForm.falseLabel || 'No';
      return;
    }

    this.editForm.isConditional = false;
    this.editForm.condition = '';
    this.editForm.trueLabel = '';
    this.editForm.falseLabel = '';
  }

  // ── Palette drag-and-drop ─────────────────────────────────────────────────

  onPaletteDragStart(event: DragEvent, nodeType: string) {
    this.paletteDragType.set(nodeType);
    event.dataTransfer?.setData('text/plain', nodeType);
    event.dataTransfer?.setData('application/node-type', nodeType);
  }

  onPaletteDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
  }

  onPaletteDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();

    const nodeType = event.dataTransfer?.getData('text/plain')
      || event.dataTransfer?.getData('application/node-type')
      || this.paletteDragType();
    this.paletteDragType.set(null);
    if (!nodeType) return;

    const wrap = this.boardWrapRef?.nativeElement;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const posX = Math.round(Math.max(0, event.clientX - rect.left + wrap.scrollLeft - 16));
    const posY = Math.round(Math.max(0, event.clientY - rect.top  + wrap.scrollTop  - 16));

    this.createStageAtPosition(nodeType, posX, posY);
  }

  createStageAtPosition(nodeType: string, posX: number, posY: number) {
    const wf = this.workflow();
    if (!wf) return;

    const defaultDepartmentId = this.availableDepartments()[0]?.id ?? null;
    if (!defaultDepartmentId) {
      this.snack.open('Primero crea un departamento para la empresa de este workflow', '', { duration: 3500 });
      return;
    }

    // Safe order: filter out non-numeric values before computing max
    const orders = wf.stages
      .map(s => s.order)
      .filter(o => typeof o === 'number' && !isNaN(o));
    const order = (orders.length ? Math.max(...orders) : 0) + 1;

    const nameMap: Record<string, string> = {
      start: 'Inicio', end: 'Fin', decision: 'Decision',
      loop: 'Iteracion', fork: 'Bifurcacion', join: 'Union'
    };
    const name = nameMap[nodeType] ?? `Etapa ${order}`;

    this.api.post<Stage>('/workflow-stages', {
      workflowId: this.id,
      name,
      description: '',
      order,
      responsibleDepartmentId: defaultDepartmentId,
      slaHours: 24,
      requiresForm: false,
      nodeType,
      isConditional: nodeType === 'decision' || nodeType === 'loop',
      trueLabel:  nodeType === 'loop' ? 'Repetir' : 'Si',
      falseLabel: nodeType === 'loop' ? 'Salir'   : 'No',
      posX,
      posY
    }).subscribe({
      next: stage => {
        this.snack.open('Nodo creado', '', { duration: 2000 });
        this.applyStageCreated(stage, { select: true });
      },
      error: (err) => {
        const status = err?.status;
        if (status === 401) {
          this.snack.open('Sesión expirada — recarga la página (F5)', 'Recargar', { duration: 8000 })
            .onAction().subscribe(() => location.reload());
        } else if (status === 403) {
          const msg403 = err?.error?.message ?? 'Sin permisos para realizar esta acción';
          this.snack.open(msg403, '', { duration: 5000 });
        } else {
          const msg = err?.error?.message ?? err?.message ?? 'No se pudo crear el nodo';
          this.snack.open(msg, '', { duration: 4000 });
        }
      }
    });
  }

  saveStage() {
    const stage = this.selectedStage();
    if (!stage) return;
    const isProcess = this.isProcessNodeType(this.editForm.nodeType);
    if (isProcess && !this.editForm.responsibleDepartmentId) {
      this.snack.open('Selecciona un departamento responsable', '', { duration: 2500 });
      return;
    }
    const normalizedFormFields = isProcess && this.editForm.requiresForm
      ? this.normalizeFormFields(this.editForm.formFields)
      : [];
    if (isProcess && this.editForm.requiresForm) {
      this.editForm.formFields = normalizedFormFields;
    }
    const payload = {
      name: this.editForm.name,
      description: isProcess ? this.editForm.description : '',
      nodeType: this.editForm.nodeType,
      responsibleDepartmentId: isProcess ? this.editForm.responsibleDepartmentId : null,
      responsibleJobRoleId: isProcess ? (this.editForm.responsibleJobRoleId || null) : null,
      slaHours: isProcess ? Number(this.editForm.slaHours) : 24,
      requiresForm: isProcess ? this.editForm.requiresForm : false,
      isConditional: this.editForm.nodeType === 'loop' || this.editForm.nodeType === 'decision',
      condition: this.editForm.nodeType === 'loop' || this.editForm.nodeType === 'decision' ? this.editForm.condition : '',
      trueLabel: this.editForm.nodeType === 'loop' || this.editForm.nodeType === 'decision' ? this.editForm.trueLabel : '',
      falseLabel: this.editForm.nodeType === 'loop' || this.editForm.nodeType === 'decision' ? this.editForm.falseLabel : '',
      formDefinition: isProcess && this.editForm.requiresForm
        ? {
            stageId: stage.id,
            title: this.editForm.formTitle,
            fields: normalizedFormFields.map((f, i) => ({
              id: f.id,
              label: f.label,
              name: f.name,
              type: f.type,
              required: f.isRequired,
              placeholder: f.placeholder ?? '',
              options: f.options ?? [],
              order: i + 1
            }))
          }
        : null
    };
    this.api.patch<Stage>(`/workflow-stages/${stage.id}`, payload).subscribe({
      next: () => {
        this.snack.open('Etapa actualizada', '', { duration: 2000 });
        this.load();
      },
      error: () => this.snack.open('No se pudo guardar la etapa', '', { duration: 2500 })
    });
  }

  deleteStage(stage: Stage) {
    if (!confirm(`¿Eliminar la etapa "${stage.name}"?`)) return;
    this.api.delete(`/workflow-stages/${stage.id}`).subscribe({
      next: () => {
        this.applyStageDeleted(stage.id);
        this.clearSelection();
        this.snack.open('Etapa eliminada', '', { duration: 2000 });
      },
      error: () => this.snack.open('No se pudo eliminar la etapa', '', { duration: 2500 })
    });
  }

  // ── Transition CRUD ────────────────────────────────────────────────────────
  saveTransition() {
    const t = this.selectedTransition();
    if (!t) return;
    this.api.patch(`/workflow-transitions/${t.id}`, {
      name: this.transEditName,
      forwardConfig: {
        mode: this.transEditMode,
        fieldNames: this.transEditMode === 'selected' ? this.transEditFields : [],
        includeFiles: this.transEditIncludeFiles
      }
    }).subscribe({
      next: () => { this.snack.open('Conexión guardada', '', { duration: 2000 }); this.load(); },
      error: () => this.snack.open('No se pudo guardar', '', { duration: 2500 })
    });
  }

  deleteTransition(id: string) {
    this.api.delete(`/workflow-transitions/${id}`).subscribe({
      next: () => {
        if (this.selectedTransitionId() === id) this.selectedTransitionId.set(null);
        this.snack.open('Conexión eliminada', '', { duration: 2000 }); this.load();
      },
      error: () => this.snack.open('No se pudo eliminar', '', { duration: 2500 })
    });
  }

  deleteSelectedTransition() {
    const t = this.selectedTransition();
    if (!t || !confirm('¿Eliminar esta conexión?')) return;
    this.deleteTransition(t.id);
  }

  toggleFieldForward(name: string, checked: boolean) {
    this.transEditFields = checked
      ? [...this.transEditFields, name]
      : this.transEditFields.filter(f => f !== name);
  }

  // ── Form field helpers ─────────────────────────────────────────────────────
  addField() {
    const nextName = this.buildUniqueFieldName('campo_nuevo', this.editForm.formFields);
    this.editForm.formFields = [
      ...this.editForm.formFields,
      {
        id: crypto.randomUUID(), label: 'Campo nuevo', name: nextName,
        type: 'TEXT', placeholder: '', options: [], isRequired: false,
        order: this.editForm.formFields.length + 1
      }
    ];
  }

  removeField(i: number) {
    this.editForm.formFields = this.editForm.formFields.filter((_, idx) => idx !== i);
  }

  fieldTypeIcon(type: string): string {
    const map: Record<string, string> = {
      TEXT: 'short_text',
      NUMBER: 'tag',
      DATE: 'calendar_today',
      FILE: 'upload_file'
    };
    return map[type] ?? 'text_fields';
  }

  moveField(i: number, dir: -1 | 1) {
    const arr = [...this.editForm.formFields];
    const j = i + dir;
    if (j < 0 || j >= arr.length) return;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    this.editForm.formFields = arr;
  }

  private normalizeFormFields(fields: FormField[]): FormField[] {
    const usedNames = new Set<string>();
    return fields.map((field, index) => {
      const baseName = this.slugifyFieldName(field.name || field.label || `campo_${index + 1}`);
      const uniqueName = this.buildUniqueFieldName(baseName, [], usedNames);
      return {
        ...field,
        type: this.normalizeFieldType(String(field.type ?? 'TEXT')),
        name: uniqueName,
        order: index + 1
      };
    });
  }

  private normalizeFieldType(type: string): FieldType {
    const normalized = String(type ?? 'TEXT').toUpperCase();
    return ['TEXT', 'NUMBER', 'DATE', 'FILE'].includes(normalized)
      ? (normalized as FieldType)
      : 'TEXT';
  }

  private buildUniqueFieldName(baseName: string, fields: FormField[], usedNames = new Set<string>()): string {
    const existingNames = new Set(
      fields
        .map(field => this.slugifyFieldName(field.name))
        .filter(Boolean)
    );

    const normalizedBase = this.slugifyFieldName(baseName);
    let candidate = normalizedBase || 'campo';
    let suffix = 2;

    while (existingNames.has(candidate) || usedNames.has(candidate)) {
      candidate = `${normalizedBase || 'campo'}_${suffix}`;
      suffix += 1;
    }

    usedNames.add(candidate);
    return candidate;
  }

  private slugifyFieldName(value: string | null | undefined): string {
    return (value ?? '')
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  private normalizeAiFormDefinition(raw: any): { title: string; fields: FormField[] } | null {
    if (!raw || typeof raw !== 'object') return null;

    const rawFields = Array.isArray(raw.fields) ? raw.fields : [];
    const mappedFields: FormField[] = rawFields.map((field: any, index: number) => ({
      id: String(field?.id ?? crypto.randomUUID()),
      label: String(field?.label ?? `Campo ${index + 1}`),
      name: String(field?.name ?? field?.label ?? `campo_${index + 1}`),
      type: this.normalizeFieldType(String(field?.type ?? 'TEXT')),
      placeholder: String(field?.placeholder ?? ''),
      options: Array.isArray(field?.options) ? field.options.map((option: any) => String(option)) : [],
      isRequired: Boolean(field?.isRequired ?? field?.required),
      order: Number(field?.order ?? index + 1)
    }));

    return {
      title: String(raw.title ?? 'Formulario'),
      fields: this.normalizeFormFields(mappedFields)
    };
  }

  private normalizeAiForwardConfig(raw: any): ForwardConfig | undefined {
    if (!raw || typeof raw !== 'object') return undefined;

    const mode = ['all', 'selected', 'files-only', 'none'].includes(String(raw.mode))
      ? String(raw.mode) as ForwardMode
      : 'all';
    const fieldNames = Array.isArray(raw.fieldNames)
      ? raw.fieldNames.map((name: any) => String(name).trim()).filter(Boolean)
      : [];

    return {
      mode,
      fieldNames,
      includeFiles: Boolean(raw.includeFiles)
    };
  }

  // ── AI: Texto → Diagrama ───────────────────────────────────────────────────
  private buildAiContextPayload(extra: Record<string, unknown> = {}) {
    const wf = this.workflow();
    if (!wf) return null;

    return this.sanitizeAiPayloadValue({
      workflowName: wf.name,
      departments: this.availableDepartments().map(d => ({ id: d.id, name: d.name })),
      jobRoles: this.allJobRoles().map(r => ({ id: r.id, name: r.name, departmentId: r.departmentId })),
      stages: wf.stages.map(s => ({
        id: s.id,
        name: s.name,
        nodeType: s.nodeType,
        order: s.order,
        slaHours: s.slaHours,
        description: s.description,
        responsibleDepartmentId: s.responsibleDepartmentId,
        responsibleDepartmentName: s.responsibleDepartmentName,
        responsibleJobRoleId: s.responsibleJobRoleId,
        responsibleRole: s.responsibleRole,
        trueLabel: s.trueLabel,
        falseLabel: s.falseLabel,
        requiresForm: s.requiresForm,
        formDefinition: s.formDefinition
      })),
      transitions: wf.transitions.map(t => ({
        ...t,
        forwardConfig: t.forwardConfig
      })),
      ...extra
    });
  }

  sendAiCommand() {
    const cmd = this.aiCommand.trim();
    if (!cmd || this.aiLoading()) return;
    if (!this.workflow()) return;

    this.aiLoading.set(true);
    this.aiResponse.set(null);

    const safeCommand = this.sanitizeAiPayloadValue(cmd);
    const body = this.buildAiContextPayload({
      command: safeCommand,
      history: this.aiHistory()
    });
    if (!body) {
      this.aiLoading.set(false);
      return;
    }

    this.api.post<any>('/workflow-ai/diagram-command', body).subscribe({
      next: res => {
        const hasActions = Array.isArray(res.actions) && res.actions.length > 0;
        const interpretation = hasActions ? '' : (res.interpretation ?? '');
        this.aiHistory.update(h => [...h,
          { role: 'user', content: safeCommand },
          { role: 'assistant', content: interpretation }
        ]);
        this.aiResponse.set(hasActions ? null : res);
        this.aiCommand = '';
        // Auto-execute if there are actions, no click needed
        if (hasActions) {
          this.executeAssistantActions(res.actions, {
            clearAiResponse: true,
            successMessage: 'Cambios aplicados'
          });
        } else {
          this.aiLoading.set(false);
          this.snack.open(interpretation || 'Sin acciones', '', { duration: 3000 });
        }
      },
      error: (err) => {
        this.aiLoading.set(false);
        this.snack.open(err?.error?.message ?? 'Error al conectar con la IA', '', { duration: 4000 });
      }
    });
  }

  openAiCreateTab() {
    this.aiTab.set('create');
  }

  openWorkyTab() {
    this.aiTab.set('worky');
    this.scheduleWorkyRefresh(150);
  }

  openAiAnalyzeTab() {
    this.aiTab.set('analyze');
  }

  private normalizeAiStageRef(value: string | null | undefined): string {
    return (value ?? '')
      .toString()
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, '_');
  }

  private resolveAiStageRef(ref: string | null | undefined, idMap: Map<string, string>): string | null {
    if (!ref) return null;
    if (idMap.has(ref)) return idMap.get(ref)!;
    return idMap.get(this.normalizeAiStageRef(ref)) ?? null;
  }

  private sanitizeAiRequestText(value: string | null | undefined): string {
    return (value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private sanitizeAiPayloadValue<T>(value: T): T {
    if (typeof value === 'string') {
      return this.sanitizeAiRequestText(value) as T;
    }
    if (Array.isArray(value)) {
      return value.map(item => this.sanitizeAiPayloadValue(item)) as T;
    }
    if (value && typeof value === 'object') {
      return Object.fromEntries(
        Object.entries(value as Record<string, unknown>).map(([key, nested]) => [key, this.sanitizeAiPayloadValue(nested)])
      ) as T;
    }
    return value;
  }

  private resolveAiDepartmentId(name: string | null | undefined): string {
    if (!name) return this.availableDepartments()[0]?.id ?? '';
    const normalized = this.normalizeAiStageRef(name);
    const match = this.availableDepartments().find(d => this.normalizeAiStageRef(d.name) === normalized);
    return match?.id ?? this.availableDepartments()[0]?.id ?? '';
  }

  private resolveAiJobRoleId(name: string | null | undefined, departmentId?: string): string | null {
    if (!name) return null;
    const normalized = this.normalizeAiStageRef(name);
    const candidates = departmentId
      ? this.allJobRoles().filter(r => r.departmentId === departmentId)
      : this.allJobRoles();
    return candidates.find(r => this.normalizeAiStageRef(r.name) === normalized)?.id ?? null;
  }

  private currentUserId(): string {
    return this.collab.getClientId();
  }

  private connectCollaboration() {
    if (!this.auth.user()) {
      this.collabConnectTimer = setTimeout(() => this.connectCollaboration(), 400);
      return;
    }
    if (this.collab.isConnected()) return;

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

        if (this.pendingLockStageId() === lock.stageId && lock.userId === this.currentUserId()) {
          this.pendingLockStageId.set(null);
          const stage = this.workflow()?.stages.find(s => s.id === lock.stageId);
          if (stage) this.selectStage(stage);
        }
      },
      onStageUnlocked: stageId => {
        const next = new Map(this.stageLocks());
        next.delete(stageId);
        this.stageLocks.set(next);
      },
      onStageMoved: event => {
        if (event.userId === this.currentUserId() && this.draggingId() === event.stageId) return;
        const next = new Map(this.stagePositions());
        next.set(event.stageId, { x: event.x, y: event.y });
        this.stagePositions.set(next);
        this.computeConnections();
      },
      onStageCreated: event => {
        if (!event.stage) return;
        this.applyStageCreated(event.stage);
      },
      onStageUpdated: event => {
        if (!event.stage) return;
        this.applyStageCreated(event.stage, { select: this.selectedStage()?.id === event.stage.id });
      },
      onStageDeleted: event => {
        if (!event.stageId) return;
        this.applyStageDeleted(event.stageId);
      },
      onTransitionCreated: event => {
        if (!event.transition) return;
        this.applyTransitionCreated(event.transition);
      },
      onTransitionUpdated: event => {
        if (!event.transition) return;
        this.applyTransitionCreated(event.transition, { select: this.selectedTransitionId() === event.transition.id });
      },
      onTransitionDeleted: event => {
        if (!event.transitionId) return;
        this.applyTransitionDeleted(event.transitionId);
      },
      onLockDenied: event => {
        if (this.draggingId() === event.stageId) {
          const next = new Map(this.stagePositions());
          next.set(event.stageId, { ...this.dragInitialNodePos });
          this.stagePositions.set(next);
          this.draggingId.set(null);
          this.didMove = false;
          this.computeConnections();
        }
        this.pendingLockStageId.set(null);
        const owner = event.lock?.userName ? ` por ${event.lock.userName}` : '';
        this.snack.open(`Ese nodo ya esta siendo editado${owner}`, '', { duration: 2500 });
      }
    });
  }

  private stageLock(stageId: string): WorkflowStageLock | null {
    return this.stageLocks().get(stageId) ?? null;
  }

  isStageLockedByOther(stageId: string): boolean {
    const lock = this.stageLock(stageId);
    return !!lock && lock.userId !== this.currentUserId();
  }

  isStageLockedByMe(stageId: string): boolean {
    const lock = this.stageLock(stageId);
    return !!lock && lock.userId === this.currentUserId();
  }

  stageLockTitle(stageId: string): string {
    const lock = this.stageLock(stageId);
    if (!lock) return '';
    return lock.userId === this.currentUserId()
      ? 'Lo estas editando tu'
      : `En edicion por ${lock.userName}`;
  }

  private startDragInteraction(stage: Stage, evt: MouseEvent) {
    const wrap = this.boardWrapRef?.nativeElement;
    if (!wrap) return;

    const bRect = wrap.getBoundingClientRect();
    const pos = this.stagePos(stage.id);

    this.draggingId.set(stage.id);
    this.didMove = false;
    this.dragStartPos = { x: evt.clientX, y: evt.clientY };
    this.dragInitialNodePos = { ...pos };
    this.dragOffset = {
      x: (evt.clientX - bRect.left + wrap.scrollLeft) - pos.x,
      y: (evt.clientY - bRect.top + wrap.scrollTop) - pos.y
    };
  }

  private requestStageLock(stage: Stage) {
    if (!this.collab.isConnected()) {
      this.selectStage(stage);
      return;
    }
    if (this.isStageLockedByMe(stage.id)) {
      this.selectStage(stage);
      return;
    }
    if (this.isStageLockedByOther(stage.id)) {
      const owner = this.stageLock(stage.id)?.userName;
      this.snack.open(owner ? `Ese nodo esta siendo editado por ${owner}` : 'Ese nodo esta bloqueado', '', { duration: 2500 });
      return;
    }

    const selected = this.selectedStage();
    if (selected && selected.id !== stage.id && this.isStageLockedByMe(selected.id)) {
      this.collab.unlockStage(selected.id);
    }

    this.pendingLockStageId.set(stage.id);
    this.collab.lockStage(stage.id);
  }

  loadWorkySuggestions(silent = false) {
    const body = this.buildAiContextPayload();
    if (!body) return;

    this.workyLoading.set(true);
    this.api.post<WorkyAssistantResponse>('/workflow-ai/worky-suggestions', body).subscribe({
      next: (res) => {
        this.workyLoading.set(false);
        this.workyAssistant.set(res);
      },
      error: (err) => {
        this.workyLoading.set(false);
        if (silent) return;
        this.snack.open(err?.error?.message ?? 'Error al consultar a Worky', '', { duration: 4000 });
      }
    });
  }

  applyWorkySuggestion(suggestion: WorkySuggestion) {
    if (!suggestion.actions?.length) {
      this.snack.open('Esta sugerencia no tiene una acción automática todavía', '', { duration: 3000 });
      return;
    }

    this.executeAssistantActions(suggestion.actions, {
      successMessage: 'Sugerencia aplicada',
      afterApply: () => setTimeout(() => this.loadWorkySuggestions(), 700)
    });
  }

  private executeAssistantActions(actions: any[], options?: {
    clearAiResponse?: boolean;
    successMessage?: string;
    afterApply?: () => void;
  }) {
    if (!actions.length) {
      this.aiLoading.set(false);
      this.snack.open('No hay acciones ejecutables', '', { duration: 2500 });
      return;
    }
    const wf = this.workflow();
    if (!wf) return;

    this.aiLoading.set(true);
    const deptId = this.availableDepartments()[0]?.id ?? '';
    let nextOrder = Math.max(0, ...wf.stages.map(s => s.order));
    // Map from Claude placeholder IDs → real MongoDB IDs created during execution
    const idMap = new Map<string, string>();
    const failures: string[] = [];

    for (const stage of wf.stages) {
      idMap.set(stage.id, stage.id);
      idMap.set(this.normalizeAiStageRef(stage.id), stage.id);
      idMap.set(this.normalizeAiStageRef(stage.name), stage.id);
    }

    const runActions = async () => {
      for (const action of actions) {
        if (action.type === 'create_stage') {
          await new Promise<void>(resolve => {
            const stageName = this.sanitizeAiRequestText((action.name ?? 'Nueva etapa').trim() || 'Nueva etapa');
            nextOrder += 1;
            const nodeType = action.nodeType ?? 'process';
            const isProcess = this.isProcessNodeType(nodeType);
            const departmentId = isProcess ? this.resolveAiDepartmentId(action.responsibleDepartmentName) : '';
            const jobRoleId = isProcess ? this.resolveAiJobRoleId(action.responsibleJobRoleName, departmentId || deptId) : null;
            const formDefinition = this.normalizeAiFormDefinition(action.formDefinition);
            const requiresForm = isProcess && (Boolean(action.requiresForm) || !!formDefinition?.fields.length);
            this.api.post<Stage>('/workflow-stages', {
              workflowId: this.id,
              name: stageName,
              description: this.sanitizeAiRequestText(action.description ?? ''),
              nodeType,
              order: typeof action.order === 'number' ? action.order : nextOrder,
              responsibleDepartmentId: isProcess ? (departmentId || deptId) : null,
              responsibleJobRoleId: jobRoleId ?? undefined,
              slaHours: action.slaHours ?? 24,
              requiresForm,
              formDefinition: requiresForm && formDefinition
                ? {
                    title: formDefinition.title,
                    fields: formDefinition.fields.map((field, index) => ({
                      id: field.id,
                      label: field.label,
                      name: field.name,
                      type: field.type,
                      required: field.isRequired,
                      placeholder: field.placeholder ?? '',
                      options: field.options ?? [],
                      order: index + 1
                    }))
                  }
                : null,
              isConditional: nodeType === 'decision' || nodeType === 'loop',
              trueLabel: this.sanitizeAiRequestText(action.trueLabel ?? 'Si'),
              falseLabel: this.sanitizeAiRequestText(action.falseLabel ?? 'No'),
              posX: typeof action.posX === 'number' ? action.posX : undefined,
              posY: typeof action.posY === 'number' ? action.posY : undefined,
            }).subscribe({
              next: (created: Stage) => {
                if (!created?.id) {
                  failures.push(`La API no devolvió ID al crear "${stageName}"`);
                  resolve();
                  return;
                }
                if (action.placeholderId) {
                  idMap.set(action.placeholderId, created.id);
                  idMap.set(this.normalizeAiStageRef(action.placeholderId), created.id);
                }
                idMap.set(created.id, created.id);
                idMap.set(this.normalizeAiStageRef(stageName), created.id);
                resolve();
              },
              error: (err) => {
                failures.push(err?.error?.message ?? `No se pudo crear "${stageName}"`);
                resolve();
              }
            });
          });
        } else if (action.type === 'update_stage' && action.stageId) {
          const stageId = this.resolveAiStageRef(action.stageId, idMap);
          if (!stageId) {
            failures.push(`No se encontró el nodo a actualizar: ${action.stageId}`);
            continue;
          }
          const currentStage = this.workflow()?.stages.find(stage => stage.id === stageId) ?? null;
          const targetNodeType = action.nodeType ?? currentStage?.nodeType ?? 'process';
          const isProcess = this.isProcessNodeType(targetNodeType);
          const formDefinition = this.normalizeAiFormDefinition(action.formDefinition);
          const requiresForm = isProcess && (
            action.requiresForm === true
            || !!formDefinition?.fields.length
            || (action.requiresForm !== false && !!currentStage?.requiresForm)
          );
          const payload = {
            ...action,
            ...(action.nodeType ? { nodeType: targetNodeType } : {}),
            ...(action.responsibleDepartmentName
              ? { responsibleDepartmentId: this.resolveAiDepartmentId(action.responsibleDepartmentName) }
              : {}),
            ...(action.responsibleJobRoleName
              ? {
                  responsibleJobRoleId: this.resolveAiJobRoleId(
                    action.responsibleJobRoleName,
                    action.responsibleDepartmentName
                      ? this.resolveAiDepartmentId(action.responsibleDepartmentName)
                      : (currentStage?.responsibleDepartmentId ?? '')
                  )
                }
              : {}),
            ...(isProcess ? { requiresForm } : { requiresForm: false, formDefinition: null }),
            ...(formDefinition
              ? {
                  formDefinition: {
                    title: formDefinition.title,
                    fields: formDefinition.fields.map((field, index) => ({
                      id: field.id,
                      label: field.label,
                      name: field.name,
                      type: field.type,
                      required: field.isRequired,
                      placeholder: field.placeholder ?? '',
                      options: field.options ?? [],
                      order: index + 1
                    }))
                  }
                }
              : {})
          };
          await new Promise<void>(resolve => {
            this.api.patch(`/workflow-stages/${stageId}`, payload).subscribe({
              next: () => resolve(),
              error: (err) => {
                failures.push(err?.error?.message ?? `No se pudo actualizar ${action.stageId}`);
                resolve();
              }
            });
          });
        } else if (action.type === 'delete_stage' && action.stageId) {
          const stageId = this.resolveAiStageRef(action.stageId, idMap);
          const transitionId = this.workflow()?.transitions.find(transition => transition.id === action.stageId)?.id ?? null;
          if (!stageId && transitionId) {
            await new Promise<void>(resolve => {
              this.api.delete(`/workflow-transitions/${transitionId}`).subscribe({
                next: () => resolve(),
                error: (err) => {
                  failures.push(err?.error?.message ?? `No se pudo eliminar la transición ${transitionId}`);
                  resolve();
                }
              });
            });
            continue;
          }
          if (!stageId) {
            failures.push(`No se encontró el nodo a eliminar: ${action.stageId}`);
            continue;
          }
          await new Promise<void>(resolve => {
            this.api.delete(`/workflow-stages/${stageId}`).subscribe({
              next: () => resolve(),
              error: (err) => {
                failures.push(err?.error?.message ?? `No se pudo eliminar ${action.stageId}`);
                resolve();
              }
            });
          });
        } else if (action.type === 'connect_stages' && action.fromStageId && action.toStageId) {
          const fromId = this.resolveAiStageRef(action.fromStageId, idMap);
          const toId = this.resolveAiStageRef(action.toStageId, idMap);
          if (!fromId || !toId) {
            failures.push(`No se pudo conectar ${action.fromStageId} → ${action.toStageId}`);
            continue;
          }
          await new Promise<void>(resolve => {
            this.api.post('/workflow-transitions', {
              workflowId: this.id,
              fromStageId: fromId,
              toStageId: toId,
              name: action.name ?? '',
              forwardConfig: this.normalizeAiForwardConfig(action.forwardConfig)
            })
              .subscribe({
                next: () => resolve(),
                error: (err) => {
                  failures.push(err?.error?.message ?? `No se pudo conectar ${action.fromStageId} → ${action.toStageId}`);
                  resolve();
                }
              });
          });
        } else if (action.type === 'disconnect_stages' && action.transitionId) {
          await new Promise<void>(resolve => {
            this.api.delete(`/workflow-transitions/${action.transitionId}`).subscribe({
              next: () => resolve(),
              error: (err) => {
                failures.push(err?.error?.message ?? `No se pudo eliminar la transición ${action.transitionId}`);
                resolve();
              }
            });
          });
        }
      }
      this.aiLoading.set(false);
      if (options?.clearAiResponse) {
        this.aiResponse.set(null);
        this.aiCommand = '';
      }
      this.load(() => this.autoLayout());
      options?.afterApply?.();
      this.snack.open(
        failures.length ? `Aplicado con errores: ${failures[0]}` : (options?.successMessage ?? 'Cambios aplicados'),
        '',
        { duration: failures.length ? 5000 : 2000 }
      );
    };

    runActions();
  }

  private scheduleWorkyRefresh(delayMs = 900) {
    if (this.workyAutoRefreshTimer) {
      clearTimeout(this.workyAutoRefreshTimer);
    }
    this.workyAutoRefreshTimer = setTimeout(() => {
      if (this.aiTab() !== 'worky') return;
      this.loadWorkySuggestions(true);
    }, delayMs);
  }

  aiActionIcon(type: string): string {
    const map: Record<string, string> = {
      create_stage: 'add_circle', update_stage: 'edit', delete_stage: 'delete',
      connect_stages: 'add_link', disconnect_stages: 'link_off', show_diagram: 'account_tree'
    };
    return map[type] ?? 'bolt';
  }

  aiActionLabel(action: any): string {
    switch (action.type) {
      case 'create_stage':    return `Crear nodo: "${action.name}" (${action.nodeType ?? 'proceso'})`;
      case 'update_stage':    return `Actualizar nodo ID: ${action.stageId}`;
      case 'delete_stage':    return `Eliminar nodo ID: ${action.stageId}`;
      case 'connect_stages':  return `Conectar ${action.fromStageId} → ${action.toStageId}${action.name ? ' ("' + action.name + '")' : ''}`;
      case 'disconnect_stages': return `Desconectar transición: ${action.transitionId}`;
      default:                return action.type;
    }
  }

  // ── AI: Análisis de cuellos de botella ─────────────────────────────────────
  analyzeBottlenecks() {
    const wf = this.workflow();
    if (!wf) return;
    this.bottleneckLoading.set(true);
    this.bottleneckResult.set(null);

    const body = {
      workflowId: wf.id,
      workflowName: wf.name,
      stages: wf.stages.map(s => ({
        id: s.id, workflowId: s.workflowId, name: s.name, nodeType: s.nodeType, slaHours: s.slaHours,
        description: s.description, responsibleDepartmentId: s.responsibleDepartmentId,
        responsibleDepartmentName: s.responsibleDepartmentName,
        requiresForm: s.requiresForm
      })),
      transitions: wf.transitions
    };

    this.api.post<any>('/workflow-ai/bottleneck-analysis', body).subscribe({
      next: res => { this.bottleneckLoading.set(false); this.bottleneckResult.set(res); },
      error: (err) => {
        this.bottleneckLoading.set(false);
        this.snack.open(err?.error?.message ?? 'Error al analizar', '', { duration: 4000 });
      }
    });
  }

  bnIcon(type: string): string {
    const map: Record<string, string> = {
      sla_violation: 'timer_off', fan_in: 'merge', role_overload: 'person_alert',
      single_path: 'linear_scale', parallelization: 'account_tree', critical_path: 'warning'
    };
    return map[type] ?? 'warning';
  }
}
