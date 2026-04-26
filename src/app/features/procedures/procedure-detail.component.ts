import { Component, computed, inject, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { MatStepperModule } from '@angular/material/stepper';
import { ApiService } from '../../core/services/api.service';
import { environment } from '../../../environments/environment';

interface ProcedureDetail {
  id: string;
  code: string;
  title: string;
  description?: string;
  status: string;
  workflowId: string;
  currentStageId: string;
  formData?: Record<string, unknown>;
  availableTransitions: TransitionOption[];
  history: Array<{
    id: string;
    action: string;
    fromStageId?: string;
    toStageId?: string;
    comment?: string;
    changedAt: string;
    stageName?: string;
    nodeType?: string;
    departmentName?: string;
    jobRoleName?: string;
    isCurrent?: boolean;
  }>;
}

interface TransitionOption {
  id: string;
  fromStageId: string;
  toStageId: string;
  name: string;
  label?: string;
  targetStageName?: string;
  kind?: string;
  decisionNodeType?: string;
  branchOutcome?: string;
}

interface FormField {
  id: string;
  name: string;
  type: string;
  options?: string[];
  required?: boolean;
  isRequired?: boolean;
  order?: number;
}

interface FormDefinition {
  id: string;
  title: string;
  fields: FormField[];
}

interface FileValue {
  fileName: string;
  storedName: string;
  contentType?: string;
  size?: number;
  downloadPath?: string;
}

@Component({
  selector: 'app-procedure-detail',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatButtonModule, MatIconModule, MatCardModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatProgressSpinnerModule,
    MatSnackBarModule, MatStepperModule
  ],
  template: `
    <div class="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-6 py-6">
      <div class="flex items-center gap-3">
        <button mat-icon-button (click)="goBack()"><mat-icon>arrow_back</mat-icon></button>
        <div>
          <h2 class="text-2xl font-bold text-slate-900">{{ procedure()?.title }}</h2>
          <code class="rounded bg-slate-100 px-2 py-1 text-xs">{{ procedure()?.code }}</code>
        </div>
        <span class="ml-auto rounded-full px-3 py-1 text-xs font-semibold" [ngClass]="statusBadgeClass(procedure()?.status || '')">{{ procedure()?.status }}</span>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16"><mat-spinner /></div>
      } @else if (procedure()) {
        <div class="grid gap-4 xl:grid-cols-2">
          <mat-card class="rounded-3xl p-5 shadow-sm">
            <h3 class="mb-3 text-base font-semibold text-slate-900">Informacion</h3>
            <p class="mb-2 text-sm text-slate-600"><strong class="text-slate-900">Descripcion:</strong> {{ procedure()!.description || 'Sin Descripcion' }}</p>
            <p class="text-sm text-slate-600"><strong class="text-slate-900">Estado:</strong> <span class="ml-1 rounded-full px-3 py-1 text-xs font-semibold" [ngClass]="statusBadgeClass(procedure()!.status)">{{ procedure()!.status }}</span></p>
          </mat-card>

          @if (availableTransitions().length > 0 && procedure()!.status !== 'COMPLETED' && procedure()!.status !== 'REJECTED') {
            <mat-card class="rounded-3xl p-5 shadow-sm">
              <h3 class="mb-3 text-base font-semibold text-slate-900">Avanzar Tramite</h3>

              @if (currentFormFields().length > 0) {
                <div class="mb-3">
                  <h4 class="mb-3 text-sm font-semibold text-slate-900">{{ currentFormTitle() }}</h4>
                  @for (field of currentFormFields(); track field.id) {
                    @if (field.type === 'FILE') {
                      <div class="mb-4 flex flex-col gap-2">
                        <label class="text-sm font-medium text-slate-700">{{ field.name }}</label>
                        <input class="text-sm text-slate-700" type="file" (change)="onFileSelected(field, $event)">
                        @if (fieldValue(field)) {
                          <div class="text-xs text-indigo-600">
                            @if (isFileValue(fieldValue(field))) {
                              <button type="button" class="bg-transparent p-0 text-indigo-600 underline" (click)="downloadFileAny(fieldValue(field))">
                                {{ fileLabelAny(fieldValue(field)) }}
                              </button>
                            } @else {
                              {{ fieldValue(field) }}
                            }
                          </div>
                        }
                      </div>
                    } @else {
                      <mat-form-field appearance="outline" class="w-full">
                        <mat-label>{{ field.name }}</mat-label>
                        @switch (field.type) {
                          @case ('TEXTAREA') {
                            <textarea matInput rows="3"
                                      [ngModel]="fieldValue(field)"
                                      (ngModelChange)="setFieldValue(field, $event)"
                                      [required]="isRequired(field)"></textarea>
                          }
                          @case ('SELECT') {
                            <mat-select [ngModel]="fieldValue(field)"
                                        (ngModelChange)="setFieldValue(field, $event)"
                                        [required]="isRequired(field)">
                              @for (option of field.options || []; track option) {
                                <mat-option [value]="option">{{ option }}</mat-option>
                              }
                            </mat-select>
                          }
                          @case ('DATE') {
                            <input matInput type="date"
                                   [ngModel]="fieldValue(field)"
                                   (ngModelChange)="setFieldValue(field, $event)"
                                   [required]="isRequired(field)">
                          }
                          @case ('NUMBER') {
                            <input matInput type="number"
                                   [ngModel]="fieldValue(field)"
                                   (ngModelChange)="setFieldValue(field, $event)"
                                   [required]="isRequired(field)">
                          }
                          @case ('CHECKBOX') {
                            <mat-select [ngModel]="fieldValue(field) ? 'Si' : 'No'"
                                        (ngModelChange)="setFieldValue(field, $event === 'Si')">
                              <mat-option value="Si">Sí</mat-option>
                              <mat-option value="No">No</mat-option>
                            </mat-select>
                          }
                          @case ('RADIO') {
                            <mat-select [ngModel]="fieldValue(field)"
                                        (ngModelChange)="setFieldValue(field, $event)"
                                        [required]="isRequired(field)">
                              @for (option of field.options || []; track option) {
                                <mat-option [value]="option">{{ option }}</mat-option>
                              }
                            </mat-select>
                          }
                          @default {
                            <input matInput
                                   [ngModel]="fieldValue(field)"
                                   (ngModelChange)="setFieldValue(field, $event)"
                                   [required]="isRequired(field)">
                          }
                        }
                      </mat-form-field>
                    }
                  }
                </div>
              }

              @if (decisionButtons().length > 0) {
                <div class="mb-4 flex flex-wrap gap-2">
                  @for (t of decisionButtons(); track t.id; let i = $index) {
                    <button mat-flat-button [color]="isRejectTransition(t, i) ? 'warn' : 'primary'" (click)="advanceByButton(t.id)">
                      {{ decisionButtonLabel(t, i) }}
                    </button>
                  }
                </div>
              }
              <mat-form-field appearance="outline" class="w-full">
                <mat-label>Comentario</mat-label>
                <input matInput [(ngModel)]="comment">
              </mat-form-field>
              <div class="mt-2 flex flex-wrap gap-2">
                @if (decisionButtons().length === 0) {
                  <button mat-flat-button color="primary" (click)="advance()" [disabled]="!primaryTransitionId()">
                    <mat-icon>arrow_forward</mat-icon> Enviar actividad
                  </button>
                }
                <button mat-stroked-button color="warn" (click)="reject()">
                  <mat-icon>close</mat-icon> Rechazar
                </button>
              </div>
            </mat-card>
          }

          <mat-card class="rounded-3xl p-5 shadow-sm xl:col-span-2">
            <h3 class="mb-3 text-base font-semibold text-slate-900">Historial</h3>
            <div class="relative pl-5">
              <!-- vertical timeline line -->
              <div class="absolute left-[15px] top-4 bottom-4 w-[2px] bg-slate-200"></div>

              @for (h of procedure()!.history; track h.id) {
                <div class="relative flex gap-3 py-3">
                  <!-- dot -->
                  <div class="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" [ngClass]="historyDotClass(h)">
                    <mat-icon class="!h-[18px] !w-[18px] !text-[18px]">{{ historyIcon(h.action) }}</mat-icon>
                  </div>
                  <div class="flex-1 pt-0.5">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-sm font-semibold" [ngClass]="historyLabelClass(h)">
                        {{ historyLabel(h) }}
                      </span>
                      @if (h.isCurrent) {
                        <span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">EN CURSO</span>
                      }
                    </div>
                    @if (h.stageName) {
                      <p class="mt-0.5 text-xs font-medium text-slate-700">{{ h.stageName }}</p>
                    }
                    @if (h.departmentName || h.jobRoleName) {
                      <p class="text-xs text-slate-500">
                        @if (h.departmentName) { <span>{{ h.departmentName }}</span> }
                        @if (h.departmentName && h.jobRoleName) { <span class="mx-1 text-slate-300">·</span> }
                        @if (h.jobRoleName) { <span>{{ h.jobRoleName }}</span> }
                      </p>
                    }
                    @if (h.comment) { <p class="mt-0.5 text-xs text-slate-500 italic">{{ h.comment }}</p> }
                    <p class="mt-1 text-xs text-slate-400">{{ h.changedAt | date:'dd/MM/yyyy HH:mm' }}</p>
                  </div>
                </div>
              }

              @if (procedure()!.status === 'COMPLETED') {
                <div class="relative flex gap-3 py-3">
                  <div class="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
                    <mat-icon class="!h-[18px] !w-[18px] !text-[18px]">flag</mat-icon>
                  </div>
                  <div class="flex-1 pt-0.5">
                    <span class="text-sm font-semibold text-blue-700">FIN</span>
                    <p class="text-xs text-slate-500">Trámite completado</p>
                  </div>
                </div>
              }

              @if (!procedure()!.history.length && procedure()!.status !== 'COMPLETED') {
                <p class="py-4 text-center text-sm text-slate-400">Sin historial</p>
              }
            </div>
          </mat-card>
        </div>
      }
    </div>
  `
})
export class ProcedureDetailComponent implements OnInit {
  @Input() id!: string;

  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  private router = inject(Router);

  procedure = signal<ProcedureDetail | null>(null);
  currentForm = signal<FormDefinition | null>(null);
  formValues = signal<Record<string, unknown>>({});
  loading = signal(true);
  selectedTransition = '';
  comment = '';

  currentFormFields = computed(() =>
    [...(this.currentForm()?.fields ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  );
  currentFormTitle = computed(() => this.currentForm()?.title || 'Formulario de la etapa');
  availableTransitions = computed(() => this.procedure()?.availableTransitions ?? []);
  decisionButtons = computed(() => {
    const transitions = this.availableTransitions();
    return transitions.length > 0 && transitions.every(t => t.kind === 'decision-branch')
      ? this.dedupeDecisionButtons(transitions)
      : [];
  });
  primaryTransitionId = computed(() => this.decisionButtons().length > 0
    ? ''
    : (this.availableTransitions()[0]?.id ?? '')
  );

  ngOnInit() {
    this.load();
  }

  statusBadgeClass(status: string) {
    const classes: Record<string, string> = {
      PENDING: 'bg-amber-100 text-amber-800',
      IN_PROGRESS: 'bg-blue-100 text-blue-800',
      COMPLETED: 'bg-emerald-100 text-emerald-800',
      REJECTED: 'bg-rose-100 text-rose-800'
    };
    return classes[status] ?? 'bg-slate-100 text-slate-700';
  }

  historyDotClass(h: ProcedureDetail['history'][0]) {
    if (h.action === 'CREATED') return 'bg-blue-100 text-blue-700';
    if (h.action === 'REJECTED') return 'bg-rose-100 text-rose-700';
    if (h.action === 'DECISION_REJECTED' || h.action === 'LOOP_REJECTED') return 'bg-amber-100 text-amber-700';
    if (h.action === 'LOOP_APPROVED' || h.action === 'LOOP_EVALUATED') return 'bg-sky-100 text-sky-700';
    if (h.isCurrent) return 'bg-amber-100 text-amber-700';
    return 'bg-emerald-100 text-emerald-700';
  }

  historyLabelClass(h: ProcedureDetail['history'][0]) {
    if (h.action === 'CREATED') return 'text-blue-700';
    if (h.action === 'REJECTED') return 'text-rose-700';
    if (h.action === 'DECISION_REJECTED' || h.action === 'LOOP_REJECTED') return 'text-amber-700';
    if (h.action === 'LOOP_APPROVED' || h.action === 'LOOP_EVALUATED') return 'text-sky-700';
    if (h.isCurrent) return 'text-amber-700';
    return 'text-emerald-700';
  }

  historyLabel(h: ProcedureDetail['history'][0]) {
    if (h.action === 'CREATED') return 'CREADO';
    if (h.action === 'JOIN_ADVANCED') return 'UNION COMPLETADA';
    if (h.action === 'DECISION_REJECTED') return 'RECHAZADO';
    if (h.action === 'LOOP_REJECTED') return 'RECHAZADO';
    if (h.action === 'LOOP_APPROVED') return 'ITERACION APROBADA';
    if (h.action === 'LOOP_EVALUATED') return 'ITERACION EVALUADA';
    if (h.action === 'REJECTED') return 'RECHAZADO';
    return h.action;
  }

  historyIcon(action: string) {
    if (action === 'CREATED') return 'add_circle';
    if (action === 'REJECTED') return 'cancel';
    if (action === 'DECISION_REJECTED') return 'undo';
    if (action === 'JOIN_ADVANCED') return 'merge_type';
    if (action === 'LOOP_REJECTED' || action === 'LOOP_APPROVED' || action === 'LOOP_EVALUATED') return 'repeat';
    return 'arrow_forward';
  }

  load() {
    this.api.get<ProcedureDetail>(`/procedures/${this.id}`).subscribe({
      next: p => {
        this.procedure.set(p);
        this.formValues.set((p.formData as Record<string, unknown>) ?? {});
        this.loading.set(false);
        this.api.get<FormDefinition>(`/forms/stage/${p.currentStageId}`).subscribe({
          next: form => this.currentForm.set(form),
          error: () => this.currentForm.set(null)
        });
      },
      error: () => this.loading.set(false)
    });
  }

  goBack() {
    this.router.navigate(['/procedures']);
  }

  isRequired(field: FormField) {
    return !!(field.required || field.isRequired);
  }

  fieldValue(field: FormField) {
    return this.formValues()[field.name] ?? '';
  }

  setFieldValue(field: FormField, value: unknown) {
    this.formValues.update(values => ({ ...values, [field.name]: value }));
  }

  onFileSelected(field: FormField, event: Event) {
    const input = event.target as HTMLInputElement | null;
    const file = input?.files?.[0] ?? null;
    if (!file) return;

    const body = new FormData();
    body.append('file', file);
    this.api.post<FileValue>('/files/upload', body).subscribe({
      next: uploaded => this.setFieldValue(field, uploaded),
      error: () => this.snack.open('Error al subir archivo', '', { duration: 3000 })
    });
  }

  isFileValue(value: unknown): value is FileValue {
    return !!value && typeof value === 'object' && 'storedName' in (value as Record<string, unknown>);
  }

  fileLabel(file: FileValue) {
    return file.fileName || file.storedName;
  }

  fileLabelAny(value: unknown) {
    return this.isFileValue(value) ? this.fileLabel(value) : '';
  }

  downloadFile(file: FileValue) {
    const path = file.downloadPath || `/files/${file.storedName}/download`;
    const separator = path.includes('?') ? '&' : '?';
    const filename = encodeURIComponent(this.fileLabel(file));
    window.open(`${environment.apiUrl}${path}${separator}filename=${filename}`, '_blank');
  }

  downloadFileAny(value: unknown) {
    if (!this.isFileValue(value)) return;
    this.downloadFile(value);
  }

  advance() {
    const transitionId = this.primaryTransitionId();
    if (!transitionId) return;
    this.submitAdvance(transitionId);
  }

  advanceByButton(transitionId: string) {
    this.submitAdvance(transitionId);
  }

  decisionButtonLabel(option: TransitionOption, index: number): string {
    const raw = (option.label || option.name || '').trim();
    if (raw) return raw;
    return `Opcion ${index + 1}`;
  }

  isRejectTransition(option: TransitionOption, index: number): boolean {
    const normalized = this.decisionButtonLabel(option, index).toLowerCase();
    return option.branchOutcome === 'reject'
      || normalized === 'no'
      || normalized === 'rechazar'
      || normalized === 'rechazado'
      || normalized === 'devolver';
  }

  private dedupeDecisionButtons(transitions: TransitionOption[]) {
    const seen = new Set<string>();
    return transitions.filter((transition, index) => {
      const key = this.decisionButtonLabel(transition, index).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private submitAdvance(transitionId: string) {
    this.api.post(`/procedures/${this.id}/advance`, {
      transitionId,
      comment: this.comment,
      formData: this.formValues()
    }).subscribe({
      next: (p: any) => {
        this.procedure.set(p);
        this.formValues.set((p.formData as Record<string, unknown>) ?? {});
        this.selectedTransition = '';
        this.comment = '';
        this.api.get<FormDefinition>(`/forms/stage/${p.currentStageId}`).subscribe({
          next: form => this.currentForm.set(form),
          error: () => this.currentForm.set(null)
        });
        this.snack.open('Tramite avanzado', '', { duration: 2000 });
      },
      error: (err) => this.snack.open(err.error?.message || 'Error', '', { duration: 3000 })
    });
  }

  reject() {
    const reason = prompt('Motivo del rechazo:');
    if (reason === null) return;
    this.api.post(`/procedures/${this.id}/reject`, { reason }).subscribe({
      next: (p: any) => {
        this.procedure.update(prev => prev ? { ...prev, status: p.status } : prev);
        this.snack.open('Rechazado', '', { duration: 2000 });
      },
      error: () => this.snack.open('Error al rechazar', '', { duration: 3000 })
    });
  }
}
