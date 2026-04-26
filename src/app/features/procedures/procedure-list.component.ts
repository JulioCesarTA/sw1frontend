import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { finalize } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { environment } from '../../../environments/environment';

interface Procedure {
  id: string;
  code: string;
  title: string;
  description?: string;
  status: string;
  workflowId: string;
  createdAt: string;
}

interface Workflow {
  id: string;
  name: string;
}

interface WorkflowTransition {
  id: string;
  fromStageId: string;
  toStageId: string;
  name?: string;
}

interface FormField {
  id: string;
  label: string;
  name: string;
  type: string;
  placeholder?: string;
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

interface WorkflowStage {
  id: string;
  name: string;
  order: number;
  nodeType: string;
  responsibleDepartmentId?: string;
  responsibleJobRoleId?: string;
  requiresForm?: boolean;
  formDefinition?: FormDefinition;
}

interface WorkflowDetail extends Workflow {
  stages: WorkflowStage[];
  transitions: WorkflowTransition[];
}

@Component({
  selector: 'app-procedure-list',
  standalone: true,
  imports: [
    CommonModule, RouterLink, FormsModule,
    MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule,
    MatInputModule, MatSelectModule, MatProgressSpinnerModule, MatSnackBarModule
  ],
  template: `
    <div class="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-6 py-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-3xl font-bold text-slate-900">Tramites</h2>
        <button mat-flat-button color="primary" (click)="openCreate()">
          <mat-icon>add</mat-icon> Nuevo Tramite
        </button>
      </div>

      @if (loading()) {
        <div class="flex justify-center py-16"><mat-spinner /></div>
      } @else {
        <div class="overflow-hidden rounded-3xl bg-white shadow-sm">
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr>
                  <th class="px-4 py-3">Codigo</th><th class="px-4 py-3">Ti­tulo</th><th class="px-4 py-3">Estado</th><th class="px-4 py-3">Workflow</th><th class="px-4 py-3">Fecha</th><th class="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                @for (p of procedures(); track p.id) {
                  <tr class="border-t border-slate-100 hover:bg-slate-50">
                    <td class="px-4 py-3"><code class="rounded bg-slate-100 px-2 py-1 text-xs">{{ p.code }}</code></td>
                    <td class="px-4 py-3">{{ p.title }}</td>
                    <td class="px-4 py-3"><span class="rounded-full px-3 py-1 text-xs font-semibold" [ngClass]="statusBadgeClass(p.status)">{{ p.status }}</span></td>
                    <td class="px-4 py-3">{{ getWorkflowName(p.workflowId) }}</td>
                    <td class="px-4 py-3">{{ p.createdAt | date:'dd/MM/yyyy' }}</td>
                    <td class="px-4 py-3">
                      <button mat-icon-button [routerLink]="[p.id]"><mat-icon>visibility</mat-icon></button>
                    </td>
                  </tr>
                }
                @empty {
                  <tr><td colspan="6" class="px-4 py-10 text-center text-slate-400">No hay tramites</td></tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (showForm()) {
        <div class="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/40 px-4" (click)="showForm.set(false)">
          <mat-card class="max-h-[85vh] w-full max-w-[540px] overflow-auto rounded-3xl p-6 shadow-2xl" (click)="$event.stopPropagation()">
            <h3 class="mb-4 text-xl font-semibold text-slate-900">Nuevo Tramite</h3>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Workflow</mat-label>
              <mat-select [(ngModel)]="formWorkflowId" (ngModelChange)="onWorkflowChange($event)">
                @for (wf of workflows(); track wf.id) {
                  <mat-option [value]="wf.id">{{ wf.name }}</mat-option>
                }
              </mat-select>
            </mat-form-field>

            @if (loadingWorkflowDetail()) {
              <div class="flex justify-center pb-5 pt-2"><mat-spinner diameter="24" /></div>
            } @else if (entryStage()) {
              <div class="mb-4 flex flex-col gap-1 text-sm text-slate-600">
                <strong>Etapa que llena tu rol:</strong> {{ entryStage()!.name }}
           
              </div>

              @if (entryFormFields().length > 0) {
                <div class="mb-2">
                  <h4 class="mb-3 text-sm font-semibold text-slate-900">{{ entryStage()!.formDefinition?.title || 'Formulario' }}</h4>
                  @for (field of entryFormFields(); track field.id) {
                    @if (field.type === 'FILE') {
                      <div class="mb-4 flex flex-col gap-2">
                        <label class="text-sm font-medium text-slate-700">{{ field.label }}</label>
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
                        <mat-label>{{ field.label }}</mat-label>
                        @switch (field.type) {
                          @case ('TEXTAREA') {
                            <textarea matInput rows="3"
                                      [ngModel]="fieldValue(field)"
                                      (ngModelChange)="setFieldValue(field, $event)"
                                      [required]="isRequired(field)"
                                      [placeholder]="field.placeholder || ''"></textarea>
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
                                   [required]="isRequired(field)"
                                   [placeholder]="field.placeholder || ''">
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
                                   [required]="isRequired(field)"
                                   [placeholder]="field.placeholder || ''">
                          }
                        }
                      </mat-form-field>
                    }
                  }
                </div>
              } @else {
                <p class="mb-3 text-sm text-slate-500">Este workflow no tiene formulario inicial configurado para tu etapa.</p>
              }
            }

            <div class="mt-2 flex justify-end gap-2">
              <button mat-button (click)="showForm.set(false)">Cancelar</button>
              <button mat-flat-button color="primary"
                      (click)="save()"
                      [disabled]="loadingWorkflowDetail() || submitting()">
                {{ submitButtonLabel() }}
              </button>
            </div>
          </mat-card>
        </div>
      }
    </div>
  `
})
export class ProcedureListComponent implements OnInit {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  private auth = inject(AuthService);

  procedures = signal<Procedure[]>([]);
  workflows = signal<Workflow[]>([]);
  loading = signal(true);
  showForm = signal(false);
  loadingWorkflowDetail = signal(false);
  submitting = signal(false);
  selectedWorkflow = signal<WorkflowDetail | null>(null);
  entryStage = signal<WorkflowStage | null>(null);
  autoStartTransition = signal<WorkflowTransition | null>(null);
  submitTransition = signal<WorkflowTransition | null>(null);
  formValues = signal<Record<string, unknown>>({});
  formWorkflowId = '';

  entryFormFields = computed(() =>
    [...(this.entryStage()?.formDefinition?.fields ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  );
  submitTransitionLabel = computed(() => this.submitTransition()?.name || 'Siguiente etapa');
  submitButtonLabel = computed(() => this.submitting() ? 'Enviando...' : 'Enviar');

  ngOnInit() {
    this.api.get<Procedure[]>('/procedures').subscribe({
      next: p => { this.procedures.set(p); this.loading.set(false); },
      error: () => this.loading.set(false)
    });
    this.api.get<Workflow[]>('/workflows').subscribe(w => this.workflows.set(w));
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

  getWorkflowName(id: string) {
    return this.workflows().find(w => w.id === id)?.name || id;
  }

  openCreate() {
    this.formWorkflowId = '';
    this.formValues.set({});
    this.selectedWorkflow.set(null);
    this.entryStage.set(null);
    this.autoStartTransition.set(null);
    this.submitTransition.set(null);
    this.showForm.set(true);
  }

  private resolveEntryStage(workflow: WorkflowDetail) {
    const stages = [...workflow.stages].sort((a, b) => a.order - b.order);
    const user = this.auth.user();
    const firstStage = stages[0] ?? null;
    if (!firstStage) {
      return { entry: null as WorkflowStage | null, startTransition: null as WorkflowTransition | null };
    }

    let startTransition: WorkflowTransition | null = null;
    if ((firstStage.nodeType || '').toLowerCase() === 'start') {
      startTransition = workflow.transitions.find(t => t.fromStageId === firstStage.id) ?? null;
    }

    const candidateStages = stages.filter(stage => (stage.nodeType || '').toLowerCase() !== 'start');
    const byDepartment = candidateStages.find(stage =>
      !!user?.departmentId && stage.responsibleDepartmentId === user.departmentId
    );

    if (byDepartment) {
      return { entry: byDepartment, startTransition };
    }

    if (startTransition) {
      const nextStageId = startTransition.toStageId;
      return {
        entry: stages.find(stage => stage.id === nextStageId) ?? firstStage,
        startTransition
      };
    }

    return { entry: firstStage, startTransition };
  }

  private loadStageForm(stage: WorkflowStage) {
    if (stage.formDefinition?.fields?.length) {
      this.entryStage.set(stage);
      return;
    }

    this.api.get<FormDefinition>(`/forms/stage/${stage.id}`).subscribe({
      next: form => this.entryStage.set({ ...stage, formDefinition: form }),
      error: () => this.entryStage.set(stage)
    });
  }

  onWorkflowChange(workflowId: string) {
    this.formValues.set({});
    this.selectedWorkflow.set(null);
    this.entryStage.set(null);
    this.autoStartTransition.set(null);
    this.submitTransition.set(null);
    if (!workflowId) return;

    this.loadingWorkflowDetail.set(true);
    this.api.get<WorkflowDetail>(`/workflows/${workflowId}`)
      .pipe(finalize(() => this.loadingWorkflowDetail.set(false)))
      .subscribe({
        next: workflow => {
          this.selectedWorkflow.set(workflow);
          const { entry, startTransition } = this.resolveEntryStage(workflow);
          if (!entry) return;

          this.autoStartTransition.set(startTransition);
          this.loadStageForm(entry);
          this.submitTransition.set(workflow.transitions.find(t => t.fromStageId === entry.id) ?? null);
        },
        error: (err) => {
          this.snack.open(err.error?.message || 'Error al cargar el workflow', '', { duration: 3000 });
        }
      });
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

  save() {
    if (!this.formWorkflowId) {
      this.snack.open('Selecciona un workflow', '', { duration: 2500 });
      return;
    }

    if (!this.entryStage()) {
      this.snack.open('Espera a que cargue la etapa inicial del workflow', '', { duration: 3000 });
      return;
    }

    const workflow = this.selectedWorkflow();
    const entryStage = this.entryStage();
    const generatedTitle = workflow && entryStage
      ? `${workflow.name} - ${entryStage.name}`
      : `Tramite ${new Date().toLocaleString()}`;

    const payload = {
      title: generatedTitle,
      description: '',
      workflowId: this.formWorkflowId,
      formData: this.formValues(),
      comment: `Enviado por ${this.auth.user()?.jobTitle || 'usuario'}`,
      autoTransitionIds: [
        this.autoStartTransition()?.id,
        this.submitTransition()?.id
      ].filter((id): id is string => !!id)
    };

    this.submitting.set(true);
    this.api.post<any>('/procedures/submit', payload).pipe(
      finalize(() => this.submitting.set(false))
    ).subscribe({
      next: (procedure: any) => {
        this.procedures.update(list => [procedure, ...list.filter(item => item.id !== procedure.id)]);
        this.showForm.set(false);
        this.snack.open('Tramite enviado al siguiente rol', '', { duration: 2500 });
      },
      error: (err) => this.snack.open(err.error?.message || 'Error al enviar el Tramite', '', { duration: 3500 })
    });
  }
}
