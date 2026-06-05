import { CommonModule } from '@angular/common';
import { Component, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { finalize } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { isStoredFileArray, isStoredFileValue, openStoredFileDownload, storedFileLabel } from '../../core/utils/file-value.utils';

interface WorkflowTransition { id: string; fromNodoId: string; toNodoId: string; name?: string; }
interface GridColumn { id: string; name: string; type: string; order?: number }
interface FormField { id: string; name: string; type: string; columns?: GridColumn[]; required?: boolean; isRequired?: boolean; order?: number }
interface FormDefinition { id: string; title: string; fields: FormField[] }
interface WorkflowNodo { id: string; name: string; order: number; nodeType: string; formDefinition?: FormDefinition }
interface WorkflowDetail { id: string; name: string; nodo: WorkflowNodo[]; transitions: WorkflowTransition[] }
interface StoredFileValue { fileName?: string; storedName: string; downloadPath?: string }
interface RouterSuggestion {
  workflowId: string | null;
  workflowName: string | null;
  confidence?: number;
  reasoning?: string;
  detectedIntent?: string;
  prefillData?: Record<string, unknown>;
  missingRequiredFields?: string[];
  suggestedQuestions?: string[];
  alternatives?: Array<{ workflowId: string; workflowName: string; reason?: string }>;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => any;
    webkitSpeechRecognition?: new () => any;
  }
}

@Component({
  selector: 'app-workflow-assistant',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatButtonModule,
    MatCardModule,
    MatCheckboxModule,
    MatFormFieldModule,
    MatIconModule,
    MatInputModule,
    MatProgressSpinnerModule,
    MatSelectModule,
    MatSnackBarModule
  ],
  template: `
    <div class="mx-auto max-w-[1500px] p-6">
      <div class="mb-5">
        <h2 class="m-0 text-2xl font-bold text-slate-800">Asistente de solicitudes</h2>
        <p class="mt-1.5 text-[13px] text-slate-500">Describe el problema por texto o voz, adjunta documentos y la IA te propone el workflow mas especifico.</p>
      </div>

      <div class="grid gap-4 xl:grid-cols-[460px_minmax(0,1fr)]">
        <mat-card class="rounded-[18px] !p-5">
          <div class="mb-4 flex items-center justify-between gap-3">
            <h3 class="m-0 text-lg font-semibold text-slate-900">Solicitud</h3>
            <button mat-stroked-button type="button" [disabled]="classifying()" (click)="toggleVoiceCapture()">
              <mat-icon>{{ voiceListening() ? 'mic_off' : 'mic' }}</mat-icon>
              {{ voiceListening() ? 'Detener voz' : 'Hablar' }}
            </button>
          </div>

          <mat-form-field appearance="outline" class="w-full">
            <mat-label>Que necesitas</mat-label>
            <textarea matInput rows="8" [(ngModel)]="prompt"></textarea>
          </mat-form-field>

          <div class="mb-4">
            <label class="mb-2 block text-sm font-medium text-slate-700">Documentacion de apoyo</label>
            <input type="file" multiple (change)="onSupportFilesSelected($event)">
            @if (supportFiles().length) {
              <div class="mt-3 flex flex-col gap-2 text-sm text-slate-600">
                @for (file of supportFiles(); track file.name + '-' + file.size) {
                  <div class="flex items-center justify-between gap-3 rounded-xl border border-slate-200 px-3 py-2">
                    <div class="min-w-0">
                      <div class="truncate font-medium text-slate-800">{{ file.name }}</div>
                      <div class="text-xs text-slate-500">{{ humanSize(file.size) }}</div>
                    </div>
                    <button mat-button color="warn" type="button" (click)="removeSupportFile(file)">Quitar</button>
                  </div>
                }
              </div>
            }
          </div>

          <div class="flex justify-end">
            <button mat-flat-button color="primary" type="button" [disabled]="classifying() || !prompt.trim()" (click)="classify()">
              @if (classifying()) {
                <mat-spinner diameter="18"></mat-spinner>
              } @else {
                <mat-icon>auto_awesome</mat-icon>
              }
              Analizar
            </button>
          </div>
        </mat-card>

        <mat-card class="rounded-[18px] !p-5">
          @if (classifying()) {
            <div class="flex min-h-[320px] items-center justify-center"><mat-spinner /></div>
          } @else if (!suggestion()) {
            <div class="flex min-h-[320px] flex-col items-center justify-center gap-3 text-center text-slate-400">
              <mat-icon class="!h-12 !w-12 !text-5xl">account_tree</mat-icon>
              <p>La sugerencia aparecera aqui cuando la IA termine de analizar.</p>
            </div>
          } @else {
            <div class="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div>
                <div class="text-xs font-semibold uppercase tracking-wide text-indigo-600">Workflow sugerido</div>
                <h3 class="m-0 text-xl font-semibold text-slate-900">{{ suggestion()!.workflowName || 'Sin coincidencia clara' }}</h3>
                <p class="mt-1 text-sm text-slate-500">{{ suggestion()!.detectedIntent || '' }}</p>
              </div>
              @if (suggestion()!.confidence !== undefined) {
                <span class="rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700">
                  Confianza {{ percent(suggestion()!.confidence ?? 0) }}
                </span>
              }
            </div>

            @if (suggestion()!.reasoning) {
              <div class="mb-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                {{ suggestion()!.reasoning }}
              </div>
            }

            @if (!selectedWorkflow()) {
              <div class="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
                La IA no encontro un workflow suficientemente especifico. Ajusta la descripcion o agrega mas evidencia.
              </div>
            }

            @if (suggestion()!.suggestedQuestions?.length) {
              <div class="mb-4 rounded-2xl border border-sky-200 bg-sky-50 p-3">
                <div class="mb-2 text-sm font-semibold text-slate-900">Preguntas sugeridas</div>
                <ul class="m-0 list-disc pl-5 text-sm text-slate-700">
                  @for (question of suggestion()!.suggestedQuestions || []; track question) {
                    <li>{{ question }}</li>
                  }
                </ul>
              </div>
            }

            @if (selectedWorkflow() && entryNodo()) {
              <div class="mb-3 flex items-center justify-between gap-3">
                <div>
                  <div class="text-sm font-semibold text-slate-900">{{ entryNodo()!.name }}</div>
                  <div class="text-xs text-slate-500">{{ entryNodo()!.formDefinition?.title || 'Formulario inicial' }}</div>
                </div>
              </div>

              @if (missingRequiredFields().length) {
                <div class="mb-4 rounded-2xl border border-rose-200 bg-rose-50 p-3">
                  <div class="mb-1 text-sm font-semibold text-rose-700">Faltan datos requeridos</div>
                  <div class="flex flex-wrap gap-2">
                    @for (field of missingRequiredFields(); track field) {
                      <span class="rounded-full bg-white px-3 py-1 text-xs font-semibold text-rose-700">{{ field }}</span>
                    }
                  </div>
                </div>
              }

              @for (field of entryFormFields(); track field.id) {
                @if (field.type === 'FILE') {
                  <div class="mb-4 flex flex-col gap-2">
                    <label class="text-sm font-medium text-slate-700">{{ field.name }}</label>
                    <input type="file" multiple (change)="onWorkflowFilesSelected(field, $event)">
                    @if (workflowFileItems(field).length) {
                      <div class="flex flex-col gap-1">
                        @for (file of workflowFileItems(field); track file.storedName) {
                          <button type="button" class="bg-transparent p-0 text-left text-xs text-indigo-600 underline" (click)="downloadFile(file)">{{ fileLabel(file) }}</button>
                        }
                      </div>
                    }
                  </div>
                } @else if (field.type === 'GRID') {
                  <div class="mb-4">
                    <div class="mb-2 flex items-center justify-between gap-3">
                      <label class="text-sm font-medium text-slate-700">{{ field.name }}</label>
                      <button mat-stroked-button type="button" (click)="addGridRow(field)">Agregar fila</button>
                    </div>
                    @if (gridColumns(field).length) {
                      <div class="overflow-x-auto rounded-xl border border-slate-200">
                        <table class="min-w-full text-sm">
                          <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                            <tr>
                              @for (column of gridColumns(field); track column.id) {
                                <th class="px-3 py-2">{{ column.name }}</th>
                              }
                              <th class="w-[90px] px-3 py-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            @for (row of gridRows(field); track rowIndex; let rowIndex = $index) {
                              <tr class="border-t border-slate-100">
                                @for (column of gridColumns(field); track column.id) {
                                  <td class="px-3 py-2">
                                    @if (column.type === 'CHECKBOX') {
                                      <mat-checkbox [ngModel]="toBoolean(row[column.name])" (ngModelChange)="setGridCellValue(field, rowIndex, column, $event)"></mat-checkbox>
                                    } @else {
                                      <input class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                                        [type]="inputType(column.type)"
                                        [ngModel]="row[column.name] ?? ''"
                                        (ngModelChange)="setGridCellValue(field, rowIndex, column, $event)">
                                    }
                                  </td>
                                }
                                <td class="px-3 py-2 text-right">
                                  <button mat-button color="warn" type="button" (click)="removeGridRow(field, rowIndex)">Quitar</button>
                                </td>
                              </tr>
                            } @empty {
                              <tr>
                                <td class="px-3 py-4 text-center text-sm text-slate-400" [attr.colspan]="gridColumns(field).length + 1">Sin filas</td>
                              </tr>
                            }
                          </tbody>
                        </table>
                      </div>
                    }
                  </div>
                } @else if (field.type === 'CHECKBOX') {
                  <div class="mb-4 rounded-xl border border-slate-200 px-3 py-2">
                    <mat-checkbox [ngModel]="toBoolean(fieldValue(field))" (ngModelChange)="setFieldValue(field, $event)">{{ field.name }}</mat-checkbox>
                  </div>
                } @else {
                  <mat-form-field appearance="outline" class="w-full">
                    <mat-label>{{ field.name }}</mat-label>
                    <input matInput [type]="inputType(field.type)" [ngModel]="fieldValue(field)" (ngModelChange)="setFieldValue(field, $event)">
                  </mat-form-field>
                }
              }

              <div class="mt-4 flex justify-end gap-3">
                <button mat-stroked-button type="button" (click)="resetSuggestion()">Nueva consulta</button>
                <button mat-flat-button color="primary" type="button" [disabled]="submitting()" (click)="submitWorkflow()">
                  {{ submitting() ? 'Enviando...' : 'Crear tramite' }}
                </button>
              </div>
            }
          }
        </mat-card>
      </div>
    </div>
  `
})
export class WorkflowAssistantComponent {
  private api = inject(ApiService);
  private auth = inject(AuthService);
  private snack = inject(MatSnackBar);

  prompt = '';
  suggestion = signal<RouterSuggestion | null>(null);
  selectedWorkflow = signal<WorkflowDetail | null>(null);
  entryNodo = signal<WorkflowNodo | null>(null);
  autoStartTransition = signal<WorkflowTransition | null>(null);
  submitTransition = signal<WorkflowTransition | null>(null);
  formValues = signal<Record<string, unknown>>({});
  supportFiles = signal<File[]>([]);
  classifying = signal(false);
  submitting = signal(false);
  voiceListening = signal(false);
  private speechRecognition: any = null;

  entryFormFields = computed(() => [...(this.entryNodo()?.formDefinition?.fields ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  missingRequiredFields = computed(() => {
    const suggestedMissing = new Set(this.suggestion()?.missingRequiredFields ?? []);
    return this.entryFormFields()
      .filter(field => this.isRequired(field) && !this.hasValue(this.formValues()[field.name]))
      .map(field => field.name)
      .sort((a, b) => Number(!suggestedMissing.has(a)) - Number(!suggestedMissing.has(b)));
  });

  classify() {
    const command = this.prompt.trim();
    if (!command) return;
    const body = new FormData();
    body.append('prompt', command);
    this.supportFiles().forEach(file => body.append('files', file, file.name));
    this.classifying.set(true);
    this.api.post<RouterSuggestion>('/workflow-ai/asistente-clasificacion', body)
      .pipe(finalize(() => this.classifying.set(false)))
      .subscribe({
        next: suggestion => {
          this.suggestion.set(suggestion);
          if (!suggestion.workflowId) {
            this.selectedWorkflow.set(null);
            this.entryNodo.set(null);
            this.formValues.set({});
            return;
          }
          this.loadWorkflow(suggestion);
        },
        error: err => this.snack.open(err.error?.message || 'No se pudo clasificar la solicitud', '', { duration: 3500 })
      });
  }

  private loadWorkflow(suggestion: RouterSuggestion) {
    this.api.get<WorkflowDetail>(`/workflows/${suggestion.workflowId}`).subscribe({
      next: workflow => {
        this.selectedWorkflow.set(workflow);
        const ordered = [...workflow.nodo].sort((a, b) => a.order - b.order);
        const startNodo = ordered.find(nodo => nodo.nodeType.toLowerCase() === 'inicio') ?? null;
        const firstWorkNodo = ordered.find(nodo => nodo.nodeType.toLowerCase() !== 'inicio') ?? null;
        const startTransition = startNodo ? (workflow.transitions.find(t => t.fromNodoId === startNodo.id) ?? null) : null;
        const entry = startTransition
          ? ordered.find(nodo => nodo.id === startTransition.toNodoId) ?? firstWorkNodo ?? startNodo
          : firstWorkNodo ?? startNodo;
        if (!entry) {
          this.snack.open('El workflow sugerido no tiene etapa inicial utilizable', '', { duration: 3500 });
          return;
        }
        this.autoStartTransition.set(startTransition);
        this.submitTransition.set(this.resolveSubmitTransition(workflow, entry));
        const hydrate = (resolvedEntry: WorkflowNodo) => {
          this.entryNodo.set(resolvedEntry);
          this.formValues.set({ ...(suggestion.prefillData ?? {}) });
        };
        if (entry.formDefinition?.fields?.length) {
          hydrate(entry);
          return;
        }
        this.api.get<FormDefinition>(`/forms/nodo/${entry.id}`).subscribe({
          next: form => hydrate({ ...entry, formDefinition: form }),
          error: () => hydrate(entry)
        });
      },
      error: err => this.snack.open(err.error?.message || 'No se pudo cargar el workflow sugerido', '', { duration: 3500 })
    });
  }

  private resolveSubmitTransition(workflow: WorkflowDetail, entry: WorkflowNodo) {
    const transition = workflow.transitions.find(t => t.fromNodoId === entry.id) ?? null;
    if (!transition) return null;
    const targetNodo = workflow.nodo.find(nodo => nodo.id === transition.toNodoId);
    const targetType = String(targetNodo?.nodeType || '').toLowerCase();
    if (targetType === 'decision' || targetType === 'iteracion') return null;
    return transition;
  }

  submitWorkflow() {
    const workflow = this.selectedWorkflow();
    const entry = this.entryNodo();
    if (!workflow || !entry) return;
    if (this.missingRequiredFields().length) {
      this.snack.open(`Faltan campos requeridos: ${this.missingRequiredFields().join(', ')}`, '', { duration: 4000 });
      return;
    }
    const payload = {
      title: `${workflow.name} - ${entry.name}`,
      description: this.prompt.trim(),
      workflowId: workflow.id,
      formData: this.formValues(),
      comment: `Creado por ${this.auth.user()?.name || 'usuario'} desde asistente IA`,
      autoTransitionIds: [this.autoStartTransition()?.id, this.submitTransition()?.id].filter((id): id is string => !!id)
    };
    this.submitting.set(true);
    this.api.post('/tramites/submit', payload)
      .pipe(finalize(() => this.submitting.set(false)))
      .subscribe({
        next: () => {
          this.snack.open('Tramite creado desde la sugerencia de IA', '', { duration: 3000 });
          this.resetSuggestion();
          this.prompt = '';
          this.supportFiles.set([]);
        },
        error: err => this.snack.open(err.error?.message || 'No se pudo crear el tramite', '', { duration: 3500 })
      });
  }

  resetSuggestion() {
    this.suggestion.set(null);
    this.selectedWorkflow.set(null);
    this.entryNodo.set(null);
    this.autoStartTransition.set(null);
    this.submitTransition.set(null);
    this.formValues.set({});
  }

  toggleVoiceCapture() {
    if (this.voiceListening()) {
      this.stopVoiceCapture();
      return;
    }
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      this.snack.open('Tu navegador no soporta reconocimiento de voz', '', { duration: 3500 });
      return;
    }
    this.speechRecognition = new SpeechRecognitionCtor();
    this.speechRecognition.lang = 'es-ES';
    this.speechRecognition.continuous = true;
    this.speechRecognition.interimResults = true;
    this.speechRecognition.onstart = () => this.voiceListening.set(true);
    this.speechRecognition.onerror = () => {
      this.voiceListening.set(false);
      this.snack.open('No se pudo capturar la voz', '', { duration: 3000 });
    };
    this.speechRecognition.onend = () => {
      this.voiceListening.set(false);
      this.speechRecognition = null;
    };
    this.speechRecognition.onresult = (event: any) => {
      const transcript = Array.from(event.results ?? [])
        .map((result: any) => result?.[0]?.transcript || '')
        .join(' ')
        .trim();
      if (transcript) {
        this.prompt = transcript;
      }
    };
    this.speechRecognition.start();
  }

  private stopVoiceCapture() {
    if (this.speechRecognition) {
      this.speechRecognition.stop();
    }
    this.voiceListening.set(false);
  }

  onSupportFilesSelected(event: Event) {
    const files = Array.from((event.target as HTMLInputElement | null)?.files ?? []);
    if (!files.length) return;
    this.supportFiles.set([...this.supportFiles(), ...files]);
  }

  removeSupportFile(file: File) {
    this.supportFiles.set(this.supportFiles().filter(current => current !== file));
  }

  onWorkflowFilesSelected(field: FormField, event: Event) {
    const files = Array.from((event.target as HTMLInputElement | null)?.files ?? []);
    if (!files.length) return;
    const uploaded: StoredFileValue[] = [];
    const existing = this.workflowFileItems(field);
    const uploadNext = (index: number) => {
      if (index >= files.length) {
        this.setFieldValue(field, [...existing, ...uploaded]);
        return;
      }
      const file = files[index];
      const body = new FormData();
      body.append('file', file);
      const wfId = this.selectedWorkflow()?.id;
      if (wfId) body.append('workflowId', wfId);
      this.api.post<StoredFileValue>('/files/upload', body).subscribe({
        next: value => {
          uploaded.push(value);
          uploadNext(index + 1);
        },
        error: () => this.snack.open(`Error al subir "${file.name}"`, '', { duration: 3000 })
      });
    };
    uploadNext(0);
  }

  workflowFileItems(field: FormField): StoredFileValue[] {
    const value = this.formValues()[field.name];
    if (isStoredFileValue(value)) return [value];
    if (isStoredFileArray(value)) return value;
    return [];
  }

  fieldValue(field: FormField) { return this.formValues()[field.name] ?? ''; }
  setFieldValue(field: FormField, value: unknown) { this.formValues.update(current => ({ ...current, [field.name]: value })); }
  inputType(type: string) { return type === 'DATE' ? 'date' : type === 'NUMBER' ? 'number' : type === 'EMAIL' ? 'email' : 'text'; }
  isRequired(field: FormField) { return !!(field.required || field.isRequired); }
  toBoolean(value: unknown) { return value === true; }
  fileLabel(value: unknown) { return storedFileLabel(value); }
  downloadFile(value: unknown) { openStoredFileDownload(value); }
  percent(value: number) { return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`; }
  humanSize(size: number) { return size < 1024 * 1024 ? `${Math.round(size / 1024)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`; }

  gridColumns(field: FormField) {
    return [...(field.columns ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  gridRows(field: FormField) {
    const value = this.formValues()[field.name];
    return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row)) : [];
  }

  addGridRow(field: FormField) {
    const columns = this.gridColumns(field);
    if (!columns.length) return;
    const nextRow = Object.fromEntries(columns.map(column => [column.name, '']));
    this.setFieldValue(field, [...this.gridRows(field), nextRow]);
  }

  removeGridRow(field: FormField, rowIndex: number) {
    this.setFieldValue(field, this.gridRows(field).filter((_, index) => index !== rowIndex));
  }

  setGridCellValue(field: FormField, rowIndex: number, column: GridColumn, value: unknown) {
    const rows = this.gridRows(field).map(row => ({ ...row }));
    if (!rows[rowIndex]) rows[rowIndex] = {};
    rows[rowIndex] = { ...rows[rowIndex], [column.name]: value };
    this.setFieldValue(field, rows);
  }

  private hasValue(value: unknown): boolean {
    if (value === null || value === undefined) return false;
    if (typeof value === 'string') return value.trim().length > 0;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length > 0;
    return true;
  }
}
