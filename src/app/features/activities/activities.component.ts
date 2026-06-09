import { CommonModule } from "@angular/common";
import { Component, computed, inject, OnInit, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { Router } from "@angular/router";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatCheckboxModule } from "@angular/material/checkbox";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { ApiService } from "../../core/services/api.service";
import { CollabDocService } from "../../core/services/collab-doc.service";
import { isStoredFileArray, isStoredFileValue, openStoredFileDownload, storedFileLabel, StoredFileValue } from "../../core/utils/file-value.utils";

interface ActivitySummary { id: string; code: string; title: string; status: string; workflowName: string; currentNodoName: string; }
interface ActivityTransition { id: string; name?: string; label?: string; resultadoRama?: string; }
interface GridColumn { id: string; name: string; type: string; order?: number; }
interface ActivityFormField { id: string; name: string; type: string; columns?: GridColumn[]; order?: number; }
interface ActivityForm { id: string; title: string; fields: ActivityFormField[]; }
interface UploadedFile { fileName: string; storedName: string; downloadPath?: string; }
interface IncomingField { name: string; type?: string; columns?: GridColumn[]; value: unknown; }
interface IncomingBlock { transitionId: string; transitionName?: string; fromNodoName: string; fields: IncomingField[]; }
interface DocumentAccess { canCreate: boolean; canRead: boolean; canEdit: boolean; }
interface ActivityDetail { id: string; code: string; workflowId?: string; workflowName: string; currentNodoId: string; currentNodoName: string; formData?: Record<string, unknown>; formDefinition?: ActivityForm; availableTransitions: ActivityTransition[]; incomingData: IncomingBlock[]; canAdvance?: boolean; documentAccess?: DocumentAccess; }
interface VoiceFillResponse { transcript: string; formData: Record<string, unknown>; appliedFields: Array<{ field: string; value: unknown }>; warnings: string[]; }

declare global {
  interface Window {
    SpeechRecognition?: new () => any;
    webkitSpeechRecognition?: new () => any;
  }
}

@Component({
  selector: "app-activities",
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatCardModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule, MatSnackBarModule],
  template: `
    <div class="mx-auto max-w-[1400px] p-6">
      <div class="mb-5">
        <h2 class="m-0 text-2xl font-bold text-slate-800">Actividades</h2>
        <p class="mt-1.5 text-[13px] text-slate-500">Las tareas que tienes pendientes por rol, cargo o departamento.</p>
      </div>

      @if (isLoading()) {
        <div class="flex justify-center p-10"><mat-spinner /></div>
      } @else {
        <div class="grid grid-cols-1 gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <mat-card class="min-h-[560px] rounded-[14px] !p-4">
            <div class="mb-3">
              <h3 class="m-0 text-base font-bold text-slate-800">Pendientes</h3>
            </div>

            @for (activity of activities(); track activity.id) {
              <button class="mb-2.5 w-full rounded-xl border border-slate-200 bg-white p-3 text-left"
                [class.border-indigo-600]="selectedActivityId() === activity.id"
                [class.bg-indigo-50]="selectedActivityId() === activity.id"
                [class.shadow-[inset_0_0_0_1px_#4f46e5]]="selectedActivityId() === activity.id"
                (click)="selectActivity(activity.id)">
                <div class="mb-1.5 flex justify-between gap-2 text-xs text-slate-600">
                  <strong>{{ activity.currentNodoName }}</strong>
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
            @if (isDetailLoading()) {
              <div class="flex justify-center p-10"><mat-spinner /></div>
            } @else if (selectedActivity()) {
              <div class="mb-[18px]">
                <h3 class="m-0 text-[20px] font-semibold text-slate-900">{{ selectedActivity()!.currentNodoName }}</h3>
                <p class="mt-1.5 text-[13px] text-slate-500">{{ selectedActivity()!.workflowName }} · {{ selectedActivity()!.code }}</p>
              </div>

              @if (selectedActivity()!.incomingData.length) {
                <section class="mb-[18px]">
                  <h4 class="mb-3 text-[15px] font-semibold text-slate-800">Datos compartidos</h4>
                  @for (block of selectedActivity()!.incomingData; track block.transitionId) {
                    <div class="mb-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div class="mb-2.5 flex justify-between gap-2 text-xs text-slate-600">
                        <strong>{{ block.fromNodoName }}</strong>
                        <span>{{ block.transitionName || "Datos recibidos" }}</span>
                      </div>
                      @for (field of block.fields; track field.name) {
                        <div class="mb-2">
                          <label class="mb-1 block text-xs text-slate-500">{{ field.name }}</label>
                          <div class="rounded-[10px] border border-slate-200 bg-white p-2.5 text-[13px] text-slate-900">
                            @if (field.type === 'GRID' && incomingGridColumns(field).length) {
                              <div class="overflow-x-auto">
                                <table class="min-w-full text-xs">
                                  <thead class="bg-slate-50 text-left uppercase tracking-wide text-slate-500">
                                    <tr>
                                      @for (column of incomingGridColumns(field); track column.id) {
                                        <th class="px-2 py-2">{{ column.name }}</th>
                                      }
                                    </tr>
                                  </thead>
                                  <tbody>
                                    @for (row of incomingGridRows(field); track rowIndex; let rowIndex = $index) {
                                      <tr class="border-t border-slate-100">
                                        @for (column of incomingGridColumns(field); track column.id) {
                                          <td class="px-2 py-2">{{ row[column.name] ?? '' }}</td>
                                        }
                                      </tr>
                                    } @empty {
                                      <tr>
                                        <td class="px-2 py-3 text-center text-slate-400" [attr.colspan]="incomingGridColumns(field).length">Sin filas</td>
                                      </tr>
                                    }
                                  </tbody>
                                </table>
                              </div>
                            } @else if (isUploadedFile(field.value)) {
                              <div class="flex items-center gap-2">
                                <mat-icon class="!h-4 !w-4 !text-base text-slate-400">description</mat-icon>
                                <span class="flex-1 truncate text-sm text-slate-800">{{ uploadedFileName(field.value) }}</span>
                                @if (documentAccess().canRead) {
                                  <button type="button" class="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100" (click)="downloadFile(field.name, field.value)">
                                    <mat-icon class="!h-3.5 !w-3.5 !text-sm">download</mat-icon> Descargar
                                  </button>
                                }
                                @if (documentAccess().canEdit) {
                                  <button type="button" class="flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-700" (click)="openInEditor(field.name, asStoredFile(field.value))">
                                    <mat-icon class="!h-3.5 !w-3.5 !text-sm">edit</mat-icon> Editar
                                  </button>
                                }
                              </div>
                            } @else if (isUploadedFileList(field.value)) {
                              <div class="flex flex-col gap-2">
                                @for (file of toUploadedFiles(field.value); track file.storedName) {
                                  <div class="flex items-center gap-2">
                                    <mat-icon class="!h-4 !w-4 !text-base text-slate-400">description</mat-icon>
                                    <span class="flex-1 truncate text-sm text-slate-800">{{ uploadedFileName(file) }}</span>
                                    @if (documentAccess().canRead) {
                                      <button type="button" class="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100" (click)="downloadFile(field.name, file)">
                                        <mat-icon class="!h-3.5 !w-3.5 !text-sm">download</mat-icon> Descargar
                                      </button>
                                    }
                                    @if (documentAccess().canEdit) {
                                      <button type="button" class="flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-700" (click)="openInEditor(field.name, asStoredFile(file))">
                                        <mat-icon class="!h-3.5 !w-3.5 !text-sm">edit</mat-icon> Editar
                                      </button>
                                    }
                                  </div>
                                }
                              </div>
                            } @else if (field.type === 'CHECKBOX') {
                              {{ toBoolean(field.value) ? 'Si' : 'No' }}
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

              @if (tramiteFiles().length) {
                <section class="mb-[18px]">
                  <h4 class="mb-3 text-[15px] font-semibold text-slate-800">Archivos del trámite</h4>
                  <div class="flex flex-col gap-2">
                    @for (file of tramiteFiles(); track file.name) {
                      <div class="rounded-xl border border-slate-200 bg-slate-50 p-3">
                        <p class="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">{{ file.name }}</p>
                        @for (f of tramiteFileItems(file.value); track f.storedName) {
                          <div class="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
                            <mat-icon class="!h-4 !w-4 !text-base text-slate-400">description</mat-icon>
                            <span class="flex-1 truncate text-sm text-slate-800">{{ f.fileName || f.storedName }}</span>
                            <button type="button" class="flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100" (click)="downloadFile(file.name, f)">
                              <mat-icon class="!h-3.5 !w-3.5 !text-sm">download</mat-icon> Descargar
                            </button>
                            <button type="button" class="flex items-center gap-1 rounded-lg bg-indigo-600 px-2 py-1 text-xs font-semibold text-white hover:bg-indigo-700" (click)="openInEditor(file.name, f)">
                              <mat-icon class="!h-3.5 !w-3.5 !text-sm">edit</mat-icon> Editar colaborativamente
                            </button>
                          </div>
                        }
                        @if (documentAccess().canEdit) {
                          <label class="mt-2 flex cursor-pointer items-center gap-1 text-xs text-indigo-500 hover:text-indigo-700">
                            <mat-icon class="!h-3.5 !w-3.5 !text-sm">upload</mat-icon> Reemplazar archivo
                            <input type="file" class="hidden" (change)="replaceFile(file.name, $event)" />
                          </label>
                        }
                      </div>
                    }
                  </div>
                </section>
              }

              @if (formFields().length) {
                <section class="mb-[18px]">
                  <div class="mb-3 flex items-center justify-between gap-3">
                    <h4 class="text-[15px] font-semibold text-slate-800">{{ formTitle() }}</h4>
                    <button mat-stroked-button type="button" [disabled]="voiceLoading() || !canAdvance()" (click)="toggleVoiceCapture()">
                      <mat-icon>{{ voiceListening() ? 'mic_off' : 'mic' }}</mat-icon>
                      {{ voiceListening() ? 'Detener voz' : 'Llenar por voz' }}
                    </button>
                  </div>
                  @for (field of formFields(); track field.id) {
                    @if (field.type === "FILE") {
                      <div class="mb-4 flex flex-col gap-2">
                        <label class="text-[13px] font-medium text-slate-700">{{ field.name }}</label>
                        @if (canUploadForField(field)) {
                          <input class="text-[13px] text-slate-700" type="file" multiple (change)="uploadFiles(field, $event)" />
                        }
                        @if (fileItemsForField(field).length) {
                          <div class="flex flex-col gap-1 text-xs text-indigo-500">
                            @for (file of fileItemsForField(field); track file.storedName) {
                              <button type="button" class="cursor-pointer border-none bg-transparent p-0 text-left font-inherit text-indigo-600 underline" (click)="downloadFile(field.name, file)">{{ uploadedFileName(file) }}</button>
                            }
                          </div>
                        }
                      </div>
                    } @else if (field.type === "GRID") {
                      <div class="mb-4">
                        <div class="mb-2 flex items-center justify-between gap-3">
                          <label class="text-[13px] font-medium text-slate-700">{{ field.name }}</label>
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
                                          <input
                                            class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
                                            [type]="inputType(column.type)"
                                            [ngModel]="row[column.name] ?? ''"
                                            (ngModelChange)="setGridCellValue(field, rowIndex, column, $event)" />
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
                        } @else {
                          <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                            Esta grilla no tiene columnas configuradas.
                          </div>
                        }
                      </div>
                    } @else if (field.type === "CHECKBOX") {
                      <div class="mb-4 rounded-xl border border-slate-200 px-3 py-2">
                        <mat-checkbox [ngModel]="toBoolean(fieldValue(field))" (ngModelChange)="setFieldValue(field, $event)">
                          {{ field.name }}
                        </mat-checkbox>
                      </div>
                    } @else {
                      <mat-form-field appearance="outline" class="w-full">
                        <mat-label>{{ field.name }}</mat-label>
                        <input matInput [type]="inputType(field.type)" [ngModel]="fieldValue(field)" (ngModelChange)="setFieldValue(field, $event)" />
                      </mat-form-field>
                    }
                  }
                </section>
              }

              @if (visibleTransitions().length) {
                <div class="mt-2 flex flex-wrap justify-end gap-3">
                  @for (transition of visibleTransitions(); track transition.id) {
                    <button mat-flat-button
                      [color]="transition.resultadoRama === 'rechazo' ? 'warn' : 'primary'"
                      [disabled]="isSubmitting()"
                      (click)="advance(transition.id)">
                      <mat-icon>{{ transition.resultadoRama === "rechazo" ? "cancel" : "arrow_forward" }}</mat-icon>
                      {{ isSubmitting() ? "Enviando..." : (transition.label || transition.name || "Continuar") }}
                    </button>
                  }
                </div>
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
  `,
})
export class ActivitiesComponent implements OnInit {
  private api = inject(ApiService);
  private snackBar = inject(MatSnackBar);
  private router = inject(Router);
  private collabDocService = inject(CollabDocService);

  activities = signal<ActivitySummary[]>([]);
  selectedActivity = signal<ActivityDetail | null>(null);
  selectedActivityId = signal<string | null>(null);
  formularioActual = signal<ActivityForm | null>(null);
  fieldValues = signal<Record<string, unknown>>({});
  isLoading = signal(true);
  isDetailLoading = signal(false);
  isSubmitting = signal(false);
  voiceListening = signal(false);
  voiceLoading = signal(false);
  voiceTranscript = signal("");
  private speechRecognition: any = null;
  private shouldApplyVoice = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  formFields = computed(() => [...(this.formularioActual()?.fields ?? this.selectedActivity()?.formDefinition?.fields ?? [])].sort((first, second) => (first.order ?? 0) - (second.order ?? 0)));
  formTitle = computed(() => this.formularioActual()?.title || this.selectedActivity()?.formDefinition?.title || "Formulario");
  visibleTransitions = computed(() => this.selectedActivity()?.availableTransitions ?? []);
  canAdvance = computed(() => Boolean(this.selectedActivity()?.canAdvance));
  documentAccess = computed(() => this.selectedActivity()?.documentAccess ?? { canCreate: false, canRead: false, canEdit: false });
  tramiteFiles = computed(() => {
    const formFieldNames = new Set(this.formFields().map(f => f.name));
    const incomingFieldNames = new Set(
      (this.selectedActivity()?.incomingData ?? [])
        .flatMap(block => block.fields.map(field => field.name))
    );
    return Object.entries(this.fieldValues())
      .filter(([name, value]) =>
        (isStoredFileValue(value) || isStoredFileArray(value))
        && !formFieldNames.has(name)
        && !incomingFieldNames.has(name)
      )
      .map(([name, value]) => ({ name, value }));
  });

  ngOnInit() { this.loadActivities(); }

  loadActivities() {
    this.isLoading.set(true);
    this.api.get<ActivitySummary[]>("/activities").subscribe({
      next: (activities) => {
        this.activities.set(activities);
        this.isLoading.set(false);
        const selectedId = activities.some((activity) => activity.id === this.selectedActivityId()) ? this.selectedActivityId() : activities[0]?.id ?? null;
        if (!selectedId) {
          this.selectedActivityId.set(null);
          this.selectedActivity.set(null);
          this.formularioActual.set(null);
          this.voiceTranscript.set("");
          this.stopVoiceCapture(false);
          return;
        }
        this.selectActivity(selectedId);
      },
      error: () => {
        this.isLoading.set(false);
        this.isDetailLoading.set(false);
        this.snackBar.open("Error al cargar actividades", "", { duration: 3000 });
      },
    });
  }

  selectActivity(activityId: string) {
    this.stopVoiceCapture(false);
    this.voiceTranscript.set("");
    this.selectedActivityId.set(activityId);
    this.isDetailLoading.set(true);
    this.formularioActual.set(null);
    this.api.get<ActivityDetail>(`/activities/${activityId}`).subscribe({
      next: (activity) => {
        this.selectedActivity.set(activity);
        this.fieldValues.set({ ...(activity.formData ?? {}) });
        this.api.get<ActivityForm>(`/forms/nodo/${activity.currentNodoId}`).subscribe({
          next: (form) => {
            this.formularioActual.set(form);
            this.isDetailLoading.set(false);
          },
          error: () => {
            this.formularioActual.set(activity.formDefinition ?? null);
            this.isDetailLoading.set(false);
          },
        });
      },
      error: (error) => {
        this.isDetailLoading.set(false);
        this.snackBar.open(error.error?.message || "Error al cargar la actividad", "", { duration: 3000 });
      },
    });
  }

  advance(transitionId: string) {
    const activityId = this.selectedActivity()?.id;
    if (!activityId) return;
    this.isSubmitting.set(true);
    this.api.post(`/activities/${activityId}/advance`, { transitionId, formData: this.fieldValues() }).subscribe({
      next: () => {
        this.isSubmitting.set(false);
        this.formularioActual.set(null);
        this.snackBar.open("Actividad enviada", "", { duration: 2500 });
        this.loadActivities();
      },
      error: (error) => {
        this.isSubmitting.set(false);
        this.snackBar.open(error.error?.message || "Error al enviar actividad", "", { duration: 3000 });
      },
    });
  }

  fieldValue(field: ActivityFormField) { return this.fieldValues()[field.name] ?? ""; }
  setFieldValue(field: ActivityFormField, value: unknown) { this.fieldValues.update((current) => ({ ...current, [field.name]: value })); }
  inputType(type: string) { return type === "DATE" ? "date" : type === "NUMBER" ? "number" : type === "EMAIL" ? "email" : "text"; }
  toBoolean(value: unknown) { return value === true; }
  gridColumns(field: ActivityFormField) {
    return [...(field.columns ?? [])].sort((first, second) => (first.order ?? 0) - (second.order ?? 0));
  }
  gridRows(field: ActivityFormField) {
    const value = this.fieldValues()[field.name];
    return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row)) : [];
  }
  addGridRow(field: ActivityFormField) {
    const columns = this.gridColumns(field);
    if (!columns.length) {
      this.snackBar.open("La grilla no tiene columnas configuradas", "", { duration: 2500 });
      return;
    }
    const nextRow = Object.fromEntries(columns.map((column) => [column.name, ""]));
    this.setFieldValue(field, [...this.gridRows(field), nextRow]);
  }
  removeGridRow(field: ActivityFormField, rowIndex: number) {
    this.setFieldValue(field, this.gridRows(field).filter((_, index) => index !== rowIndex));
  }
  setGridCellValue(field: ActivityFormField, rowIndex: number, column: GridColumn, value: unknown) {
    const rows = this.gridRows(field).map((row) => ({ ...row }));
    if (!rows[rowIndex]) {
      rows[rowIndex] = {};
    }
    rows[rowIndex] = { ...rows[rowIndex], [column.name]: value };
    this.setFieldValue(field, rows);
  }
  incomingGridColumns(field: IncomingField) {
    return [...(field.columns ?? [])].sort((first, second) => (first.order ?? 0) - (second.order ?? 0));
  }
  incomingGridRows(field: IncomingField) {
    return Array.isArray(field.value)
      ? field.value.filter((row): row is Record<string, unknown> => !!row && typeof row === "object" && !Array.isArray(row))
      : [];
  }
  isUploadedFile(value: unknown): value is UploadedFile { return isStoredFileValue(value); }
  isUploadedFileList(value: unknown): value is UploadedFile[] { return isStoredFileArray(value); }
  uploadedFileName(value: unknown) { return storedFileLabel(value); }
  asStoredFile(value: unknown): StoredFileValue { return value as StoredFileValue; }
  toUploadedFiles(value: unknown): UploadedFile[] {
    if (this.isUploadedFile(value)) return [value];
    if (this.isUploadedFileList(value)) return value;
    return [];
  }

  fileItemsForField(field: ActivityFormField) {
    return this.toUploadedFiles(this.fieldValues()[field.name]);
  }

  canUploadForField(field: ActivityFormField) {
    const files = this.fileItemsForField(field);
    return files.length ? this.documentAccess().canEdit : this.documentAccess().canCreate;
  }

  toggleVoiceCapture() {
    if (this.voiceListening()) {
      this.stopVoiceCapture(true);
      return;
    }
    this.startVoiceCapture();
  }

  uploadFiles(field: ActivityFormField, event: Event) {
    const files = Array.from((event.target as HTMLInputElement | null)?.files ?? []);
    if (!files.length) return;
    if (!this.canUploadForField(field)) {
      this.snackBar.open("No tienes permisos para cargar archivos en este nodo", "", { duration: 3000 });
      return;
    }
    const existingFiles = this.fileItemsForField(field);
    const uploadedFiles: UploadedFile[] = [];
    const uploadNext = (index: number) => {
      if (index >= files.length) {
        this.setFieldValue(field, [...existingFiles, ...uploadedFiles]);
        this.snackBar.open(`${uploadedFiles.length} archivo(s) subidos`, "", { duration: 3000 });
        return;
      }
      const file = files[index];
      const body = new FormData();
      body.append("file", file);
      const wfId = this.selectedActivity()?.workflowId;
      if (wfId) body.append("workflowId", wfId);
      this.api.post<UploadedFile>("/files/upload", body).subscribe({
        next: (uploaded) => {
          uploadedFiles.push(uploaded);
          uploadNext(index + 1);
        },
        error: () => this.snackBar.open(`Error al subir "${file.name}"`, "", { duration: 3000 }),
      });
    };
    uploadNext(0);
  }

  tramiteFileItems(value: unknown): StoredFileValue[] {
    if (isStoredFileValue(value)) return [value];
    if (isStoredFileArray(value)) return value;
    return [];
  }

  downloadFile(fieldName: string, value: unknown) {
    if (!this.documentAccess().canRead) {
      this.snackBar.open("No tienes permisos para leer este documento", "", { duration: 3000 });
      return;
    }
    openStoredFileDownload(value, { tramiteId: this.selectedActivity()?.id, fieldName });
  }

  openInEditor(fieldName: string, file: StoredFileValue) {
    const activity = this.selectedActivity();
    if (!activity) return;
    this.collabDocService.openFile({
      tramiteId:     activity.id,
      storedName:    file.storedName,
      workflowId:    activity.workflowId,
      workflowName:  file.workflowName || (activity as any).workflowName,
      tramiteFolder: file.tramiteFolder,
      title:         file.fileName || fieldName,
      downloadPath:  file.downloadPath,
    }).subscribe({
      next: (doc) => {
        sessionStorage.setItem(`collab_${doc.roomId}`, JSON.stringify(doc));
        this.router.navigate(['/collab-docs', doc.roomId], { state: { doc } });
      },
      error: () => this.snackBar.open("No se pudo abrir el archivo en el editor", "", { duration: 3000 }),
    });
  }

  replaceFile(fieldName: string, event: Event) {
    const files = Array.from((event.target as HTMLInputElement | null)?.files ?? []);
    if (!files.length || !this.documentAccess().canEdit) return;
    const file = files[0];
    const body = new FormData();
    body.append("file", file);
    const wfId = this.selectedActivity()?.workflowId;
    if (wfId) body.append("workflowId", wfId);
    this.api.post<UploadedFile>("/files/upload", body).subscribe({
      next: (uploaded) => {
        this.fieldValues.update(current => ({ ...current, [fieldName]: uploaded }));
        this.snackBar.open("Archivo reemplazado", "", { duration: 2500 });
      },
      error: () => this.snackBar.open("Error al reemplazar archivo", "", { duration: 3000 }),
    });
  }

  private startVoiceCapture() {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      this.snackBar.open("Tu navegador no soporta reconocimiento de voz", "", { duration: 3500 });
      return;
    }
    const activityId = this.selectedActivity()?.id;
    if (!activityId || !this.formFields().length) {
      this.snackBar.open("La actividad actual no tiene formulario para completar por voz", "", { duration: 3000 });
      return;
    }

    this.speechRecognition = new SpeechRecognitionCtor();
    this.speechRecognition.lang = "es-ES";
    this.speechRecognition.continuous = true;
    this.speechRecognition.interimResults = true;
    this.shouldApplyVoice = false;

    this.speechRecognition.onstart = () => {
      this.voiceListening.set(true);
      this.voiceTranscript.set("");
      this.clearSilenceTimer();
    };
    this.speechRecognition.onerror = () => {
      this.voiceListening.set(false);
      this.clearSilenceTimer();
      this.shouldApplyVoice = false;
      this.snackBar.open("No se pudo capturar la voz", "", { duration: 3000 });
    };
    this.speechRecognition.onend = () => {
      this.clearSilenceTimer();
      this.voiceListening.set(false);
      const shouldApply = this.shouldApplyVoice;
      this.shouldApplyVoice = false;
      this.speechRecognition = null;
      const transcript = this.voiceTranscript().trim();
      if (shouldApply && transcript) {
        this.applyVoiceTranscript(activityId, transcript);
      }
    };
    this.speechRecognition.onresult = (event: any) => {
      const transcript = Array.from(event.results ?? [])
        .map((result: any) => result?.[0]?.transcript || "")
        .join(" ")
        .trim();
      if (!transcript) return;
      this.voiceTranscript.set(transcript);
      this.restartSilenceTimer();
    };
    this.speechRecognition.start();
  }

  private stopVoiceCapture(executeApply: boolean) {
    this.shouldApplyVoice = executeApply;
    this.clearSilenceTimer();
    if (this.speechRecognition) {
      this.speechRecognition.stop();
      return;
    }
    const activityId = this.selectedActivity()?.id;
    if (executeApply && activityId && this.voiceTranscript().trim()) {
      this.applyVoiceTranscript(activityId, this.voiceTranscript().trim());
    }
    this.voiceListening.set(false);
  }

  private applyVoiceTranscript(activityId: string, transcript: string) {
    this.voiceLoading.set(true);
    this.api.post<VoiceFillResponse>(`/activities/${activityId}/voice-fill`, { transcript, formData: this.fieldValues() }).subscribe({
      next: (response) => {
        this.fieldValues.set({ ...response.formData });
        const applied = response.appliedFields?.length ?? 0;
        if (applied > 0) {
          this.snackBar.open(`Se completaron ${applied} campo(s) por voz`, "", { duration: 2500 });
        } else {
          this.snackBar.open(response.warnings?.[0] || "No se detectaron valores aplicables", "", { duration: 3000 });
        }
        this.voiceLoading.set(false);
      },
      error: (error) => {
        this.voiceLoading.set(false);
        this.snackBar.open(error.error?.message || "No se pudo interpretar la voz", "", { duration: 3000 });
      }
    });
  }

  private restartSilenceTimer() {
    this.clearSilenceTimer();
    this.silenceTimer = setTimeout(() => {
      if (this.voiceListening()) {
        this.stopVoiceCapture(true);
      }
    }, 4000);
  }

  private clearSilenceTimer() {
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
  }
}

