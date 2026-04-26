import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { environment } from '../../../environments/environment';

interface ActivitySummary {
  id: string;
  code: string;
  title: string;
  status: string;
  workflowName: string;
  currentStageName: string;
  createdAt: string;
}

interface Transition {
  id: string;
  fromStageId: string;
  toStageId: string;
  name?: string;
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

interface IncomingField {
  name: string;
  type: string;
  value: unknown;
}

interface FileValue {
  fileName: string;
  storedName: string;
  contentType?: string;
  size?: number;
  downloadPath?: string;
}

interface IncomingData {
  transitionId: string;
  transitionName?: string;
  fromStageName: string;
  fields: IncomingField[];
}

interface ActivityDetail {
  id: string;
  code: string;
  title: string;
  description?: string;
  status: string;
  workflowName: string;
  currentStageId: string;
  currentStageName: string;
  formData?: Record<string, unknown>;
  formDefinition?: FormDefinition;
  availableTransitions: Transition[];
  incomingData: IncomingData[];
}

@Component({
  selector: 'app-activities',
  standalone: true,
  imports: [
    CommonModule, FormsModule, MatCardModule, MatButtonModule, MatIconModule,
    MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressSpinnerModule, MatSnackBarModule
  ],
  template: `
    <div class="mx-auto max-w-[1400px] p-6">
      <div class="mb-5">
        <h2 class="m-0 text-2xl font-bold text-slate-800">Actividades</h2>
        <p class="mt-1.5 text-[13px] text-slate-500">Las tareas que tienes pendientes por rol, cargo o departamento.</p>
      </div>

      @if (loading()) {
        <div class="flex justify-center p-10"><mat-spinner /></div>
      } @else {
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <mat-card class="min-h-[560px] rounded-[14px] !p-4">
            <div class="mb-3 flex items-center justify-between">
              <h3 class="m-0 text-base font-bold text-slate-800">Pendientes</h3>
              <button mat-icon-button (click)="load()"><mat-icon>refresh</mat-icon></button>
            </div>
            @for (activity of activities(); track activity.id) {
              <button
                class="mb-2.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-left"
                [class.border-indigo-600]="selectedId() === activity.id"
                [class.bg-indigo-50]="selectedId() === activity.id"
                [class.shadow-[inset_0_0_0_1px_#4f46e5]]="selectedId() === activity.id"
                (click)="selectActivity(activity.id)">
                <div class="mb-1.5 flex justify-between gap-2 text-xs text-slate-600">
                  <strong>{{ activity.currentStageName }}</strong>
                  <span>{{ activity.code }}</span>
                </div>
                <div class="mb-1 text-sm font-semibold text-slate-900">{{ activity.title }}</div>
                <div class="text-xs text-slate-500">{{ activity.workflowName }}</div>
              </button>
            } @empty {
              <div class="flex min-h-[220px] flex-col items-center justify-center gap-2.5 text-center text-slate-400">
                <mat-icon class="!h-10 !w-10 !text-4xl">assignment_turned_in</mat-icon>
                <p>No tienes actividades pendientes.</p>
              </div>
            }
          </mat-card>

          <mat-card class="min-h-[560px] rounded-[14px] !p-4">
            @if (detailLoading()) {
              <div class="flex justify-center p-10"><mat-spinner /></div>
            } @else if (selectedActivity()) {
              <div class="mb-[18px] flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 class="m-0 text-[20px] font-semibold text-slate-900">{{ selectedActivity()!.currentStageName }}</h3>
                  <p class="mt-1.5 text-[13px] text-slate-500">{{ selectedActivity()!.workflowName }} · {{ selectedActivity()!.code }}</p>
                </div>
                <span class="self-start rounded-full bg-blue-100 px-3 py-1.5 text-xs font-bold text-blue-700">{{ selectedActivity()!.status }}</span>
              </div>

              @if (selectedActivity()!.incomingData.length > 0) {
                <section class="mb-[18px]">
                  <h4 class="mb-3 text-[15px] font-semibold text-slate-800">Datos compartidos</h4>
                  @for (incoming of selectedActivity()!.incomingData; track incoming.transitionId) {
                    <div class="mb-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div class="mb-2.5 flex justify-between gap-2 text-xs text-slate-600">
                        <strong>{{ incoming.fromStageName }}</strong>
                        <span>{{ incoming.transitionName || 'Datos recibidos' }}</span>
                      </div>
                      @for (field of incoming.fields; track field.name) {
                        <div class="mb-2">
                          <label class="mb-1 block text-xs text-slate-500">{{ field.name }}</label>
                          <div class="rounded-[10px] border border-slate-200 bg-white p-2.5 text-[13px] text-slate-900">
                            @if (isFileValue(field.value)) {
                              <button type="button" class="cursor-pointer border-none bg-transparent p-0 font-inherit text-indigo-600 underline" (click)="downloadFileAny(field.value)">
                                {{ fileLabelAny(field.value) }}
                              </button>
                            } @else {
                              {{ field.value }}
                            }
                          </div>
                        </div>
                      }
                    </div>
                  }
                </section>
              }

              @if (currentFormFields().length > 0) {
                <section class="mb-[18px]">
                  <h4 class="mb-3 text-[15px] font-semibold text-slate-800">{{ currentFormTitle() }}</h4>
                  @for (field of currentFormFields(); track field.id) {
                    @if (field.type === 'FILE') {
                      <div class="mb-4 flex flex-col gap-2">
                        <label class="text-[13px] font-medium text-slate-700">{{ field.name }}</label>
                        <input class="text-[13px] text-slate-700" type="file" (change)="onFileSelected(field, $event)">
                        @if (fieldValue(field)) {
                          <div class="text-xs text-indigo-500">
                            @if (isFileValue(fieldValue(field))) {
                              <button type="button" class="cursor-pointer border-none bg-transparent p-0 font-inherit text-indigo-600 underline" (click)="downloadFileAny(fieldValue(field))">
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
                                      (ngModelChange)="setFieldValue(field, $event)"></textarea>
                          }
                          @case ('SELECT') {
                            <mat-select [ngModel]="fieldValue(field)"
                                        (ngModelChange)="setFieldValue(field, $event)">
                              @for (option of field.options || []; track option) {
                                <mat-option [value]="option">{{ option }}</mat-option>
                              }
                            </mat-select>
                          }
                          @case ('DATE') {
                            <input matInput type="date"
                                   [ngModel]="fieldValue(field)"
                                   (ngModelChange)="setFieldValue(field, $event)">
                          }
                          @case ('NUMBER') {
                            <input matInput type="number"
                                   [ngModel]="fieldValue(field)"
                                   (ngModelChange)="setFieldValue(field, $event)">
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
                                        (ngModelChange)="setFieldValue(field, $event)">
                              @for (option of field.options || []; track option) {
                                <mat-option [value]="option">{{ option }}</mat-option>
                              }
                            </mat-select>
                          }
                          @default {
                            <input matInput
                                   [ngModel]="fieldValue(field)"
                                   (ngModelChange)="setFieldValue(field, $event)">
                          }
                        }
                      </mat-form-field>
                    }
                  }
                </section>
              }

              @if (selectedActivity()!.availableTransitions.length > 0) {
                <section>
                  @if (decisionButtons().length > 0) {
                    <div class="mt-2 flex gap-3 justify-end">
                      @for (transition of decisionButtons(); track transition.id; let i = $index) {
                        <button
                          mat-flat-button
                          [color]="isRejectTransition(transition, i) ? 'warn' : 'primary'"
                          (click)="advanceByButton(transition.id)"
                          [disabled]="submitting()">
                          <mat-icon>{{ isRejectTransition(transition, i) ? 'cancel' : 'check_circle' }}</mat-icon>
                          {{ submitting() ? 'Enviando...' : decisionButtonLabel(transition, i) }}
                        </button>
                      }
                    </div>
                  } @else {
                    <div class="mt-2 flex justify-end">
                      <button mat-flat-button color="primary" (click)="advance()" [disabled]="!primaryTransitionId() || submitting()">
                        <mat-icon>arrow_forward</mat-icon>
                        {{ submitting() ? 'Enviando...' : 'Enviar actividad' }}
                      </button>
                    </div>
                  }
                </section>
              }
            } @else {
              <div class="flex min-h-full flex-col items-center justify-center gap-2.5 text-center text-slate-400">
                <mat-icon class="!h-10 !w-10 !text-4xl">assignment</mat-icon>
                <p>Selecciona una actividad para verla.</p>
              </div>
            }
          </mat-card>
        </div>
      }
    </div>
  `
})
export class ActivitiesComponent implements OnInit {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);

  activities = signal<ActivitySummary[]>([]);
  selectedActivity = signal<ActivityDetail | null>(null);
  selectedId = signal<string | null>(null);
  currentForm = signal<FormDefinition | null>(null);
  formValues = signal<Record<string, unknown>>({});
  loading = signal(true);
  detailLoading = signal(false);
  submitting = signal(false);
  selectedTransitionId = '';

  currentFormFields = computed(() =>
    [...(this.currentForm()?.fields ?? this.selectedActivity()?.formDefinition?.fields ?? [])]
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
  );
  currentFormTitle = computed(() =>
    this.currentForm()?.title || this.selectedActivity()?.formDefinition?.title || 'Formulario'
  );
  decisionButtons = computed(() => {
    const transitions = this.selectedActivity()?.availableTransitions ?? [];
    return transitions.length > 0 && transitions.every(t => t.kind === 'decision-branch')
      ? this.dedupeDecisionButtons(transitions)
      : [];
  });
  routingButtons = computed(() => {
    const transitions = this.selectedActivity()?.availableTransitions ?? [];
    return this.decisionButtons().length === 0 && transitions.length > 1
      ? transitions
      : [];
  });
  primaryTransitionId = computed(() =>
    this.selectedActivity()?.availableTransitions?.[0]?.id ?? ''
  );

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.api.get<ActivitySummary[]>('/activities').subscribe({
      next: activities => {
        this.activities.set(activities);
        this.loading.set(false);
        const currentId = this.selectedId();
        const nextId = currentId && activities.some(activity => activity.id === currentId)
          ? currentId
          : activities[0]?.id;
        if (nextId) {
          this.selectActivity(nextId);
        } else {
          this.selectedId.set(null);
          this.selectedActivity.set(null);
          this.currentForm.set(null);
        }
      },
      error: () => {
        this.loading.set(false);
        this.snack.open('Error al cargar actividades', '', { duration: 3000 });
      }
    });
  }

  selectActivity(id: string) {
    this.selectedId.set(id);
    this.detailLoading.set(true);
    this.currentForm.set(null);
    this.selectedTransitionId = '';
    this.api.get<ActivityDetail>(`/activities/${id}`).subscribe({
      next: activity => {
        this.selectedActivity.set(activity);
        this.formValues.set({ ...(activity.formData ?? {}) });
        this.api.get<FormDefinition>(`/forms/stage/${activity.currentStageId}`).subscribe({
          next: form => {
            this.currentForm.set(form);
            this.detailLoading.set(false);
          },
          error: () => {
            this.currentForm.set(activity.formDefinition ?? null);
            this.detailLoading.set(false);
          }
        });
      },
      error: (err) => {
        this.detailLoading.set(false);
        this.snack.open(err.error?.message || 'Error al cargar la actividad', '', { duration: 3000 });
      }
    });
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
    const activity = this.selectedActivity();
    const transitionId = this.primaryTransitionId();
    if (!activity || !transitionId) return;

    this.submitAdvance(activity.id, transitionId);
  }

  advanceByButton(transitionId: string) {
    const activity = this.selectedActivity();
    if (!activity) return;
    this.submitAdvance(activity.id, transitionId);
  }

  decisionButtonLabel(option: Transition, index: number): string {
    return (option.label || option.name || '').trim() || `Opcion ${index + 1}`;
  }

  isRejectTransition(option: Transition, index: number): boolean {
    const normalized = this.decisionButtonLabel(option, index).toLowerCase();
    return option.branchOutcome === 'reject'
      || normalized === 'no'
      || normalized === 'rechazar'
      || normalized === 'rechazado';
  }

  routingButtonLabel(option: Transition): string {
    return option.targetStageName || option.label || option.name || 'Continuar';
  }

  private dedupeDecisionButtons(transitions: Transition[]) {
    const seen = new Set<string>();
    return transitions.filter((transition, index) => {
      const key = this.decisionButtonLabel(transition, index).toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  private submitAdvance(activityId: string, transitionId: string) {
    this.submitting.set(true);
    this.api.post(`/procedures/${activityId}/advance`, {
      transitionId,
      formData: this.formValues()
    }).subscribe({
      next: () => {
        this.submitting.set(false);
        this.currentForm.set(null);
        this.snack.open('Actividad enviada', '', { duration: 2500 });
        this.load();
      },
      error: (err) => {
        this.submitting.set(false);
        this.snack.open(err.error?.message || 'Error al enviar actividad', '', { duration: 3000 });
      }
    });
  }
}
