import { CommonModule } from "@angular/common";
import { Component, computed, inject, OnInit, signal } from "@angular/core";
import { FormsModule } from "@angular/forms";
import { MatButtonModule } from "@angular/material/button";
import { MatCardModule } from "@angular/material/card";
import { MatFormFieldModule } from "@angular/material/form-field";
import { MatIconModule } from "@angular/material/icon";
import { MatInputModule } from "@angular/material/input";
import { MatProgressSpinnerModule } from "@angular/material/progress-spinner";
import { MatSnackBar, MatSnackBarModule } from "@angular/material/snack-bar";
import { ApiService } from "../../core/services/api.service";
import { isStoredFileValue, openStoredFileDownload, storedFileLabel } from "../../core/utils/file-value.utils";

interface ActivitySummary { id: string; code: string; title: string; status: string; workflowName: string; currentNodoName: string; }
interface ActivityTransition { id: string; name?: string; label?: string; resultadoRama?: string; }
interface ActivityFormField { id: string; name: string; type: string; order?: number; }
interface ActivityForm { id: string; title: string; fields: ActivityFormField[]; }
interface UploadedFile { fileName: string; storedName: string; downloadPath?: string; }
interface IncomingField { name: string; value: unknown; }
interface IncomingBlock { transitionId: string; transitionName?: string; fromNodoName: string; fields: IncomingField[]; }
interface ActivityDetail { id: string; code: string; workflowName: string; currentNodoId: string; currentNodoName: string; formData?: Record<string, unknown>; formDefinition?: ActivityForm; availableTransitions: ActivityTransition[]; incomingData: IncomingBlock[]; }
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
  imports: [CommonModule, FormsModule, MatButtonModule, MatCardModule, MatFormFieldModule, MatIconModule, MatInputModule, MatProgressSpinnerModule, MatSnackBarModule],
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
                            @if (isUploadedFile(field.value)) {
                              <button type="button" class="cursor-pointer border-none bg-transparent p-0 font-inherit text-indigo-600 underline" (click)="downloadFile(field.value)">{{ uploadedFileName(field.value) }}</button>
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

              @if (formFields().length) {
                <section class="mb-[18px]">
                  <div class="mb-3 flex items-center justify-between gap-3">
                    <h4 class="text-[15px] font-semibold text-slate-800">{{ formTitle() }}</h4>
                    <button mat-stroked-button type="button" [disabled]="voiceLoading()" (click)="toggleVoiceCapture()">
                      <mat-icon>{{ voiceListening() ? 'mic_off' : 'mic' }}</mat-icon>
                      {{ voiceListening() ? 'Detener voz' : 'Llenar por voz' }}
                    </button>
                  </div>
                  @if (voiceTranscript()) {
                    <div class="mb-4 rounded-xl border border-sky-200 bg-sky-50 p-3 text-[13px] text-sky-900">
                      <div class="mb-1 font-semibold">Texto reconocido</div>
                      <div>{{ voiceTranscript() }}</div>
                    </div>
                  }
                  @for (field of formFields(); track field.id) {
                    @if (field.type === "FILE") {
                      <div class="mb-4 flex flex-col gap-2">
                        <label class="text-[13px] font-medium text-slate-700">{{ field.name }}</label>
                        <input class="text-[13px] text-slate-700" type="file" (change)="uploadFile(field, $event)" />
                        @if (fieldValue(field)) {
                          <div class="text-xs text-indigo-500">
                            @if (isUploadedFile(fieldValue(field))) {
                              <button type="button" class="cursor-pointer border-none bg-transparent p-0 font-inherit text-indigo-600 underline" (click)="downloadFile(fieldValue(field))">{{ uploadedFileName(fieldValue(field)) }}</button>
                            } @else {
                              {{ fieldValue(field) }}
                            }
                          </div>
                        }
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

  formFields = computed(() => [...(this.formularioActual()?.fields ?? this.selectedActivity()?.formDefinition?.fields ?? [])].sort((first, second) => (first.order ?? 0) - (second.order ?? 0)));
  formTitle = computed(() => this.formularioActual()?.title || this.selectedActivity()?.formDefinition?.title || "Formulario");
  visibleTransitions = computed(() => this.selectedActivity()?.availableTransitions ?? []);

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
  isUploadedFile(value: unknown): value is UploadedFile { return isStoredFileValue(value); }
  uploadedFileName(value: unknown) { return storedFileLabel(value); }

  toggleVoiceCapture() {
    if (this.voiceListening()) {
      this.stopVoiceCapture(true);
      return;
    }
    this.startVoiceCapture();
  }

  uploadFile(field: ActivityFormField, event: Event) {
    const file = (event.target as HTMLInputElement | null)?.files?.[0];
    if (!file) return;
    const body = new FormData();
    body.append("file", file);
    this.api.post<UploadedFile>("/files/upload", body).subscribe({
      next: (uploaded) => this.setFieldValue(field, uploaded),
      error: () => this.snackBar.open("Error al subir archivo", "", { duration: 3000 }),
    });
  }

  downloadFile(value: unknown) {
    openStoredFileDownload(value);
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
    this.speechRecognition.continuous = false;
    this.speechRecognition.interimResults = false;

    this.speechRecognition.onstart = () => {
      this.voiceListening.set(true);
      this.voiceTranscript.set("");
    };
    this.speechRecognition.onerror = () => {
      this.voiceListening.set(false);
      this.snackBar.open("No se pudo capturar la voz", "", { duration: 3000 });
    };
    this.speechRecognition.onend = () => {
      this.voiceListening.set(false);
    };
    this.speechRecognition.onresult = (event: any) => {
      const transcript = Array.from(event.results ?? [])
        .map((result: any) => result?.[0]?.transcript || "")
        .join(" ")
        .trim();
      if (!transcript) return;
      this.voiceTranscript.set(transcript);
      this.applyVoiceTranscript(activityId, transcript);
    };
    this.speechRecognition.start();
  }

  private stopVoiceCapture(showMessage: boolean) {
    if (this.speechRecognition) {
      this.speechRecognition.stop();
      this.speechRecognition = null;
    }
    if (showMessage) {
      this.snackBar.open("Captura de voz detenida", "", { duration: 1800 });
    }
    this.voiceListening.set(false);
  }

  private applyVoiceTranscript(activityId: string, transcript: string) {
    this.voiceLoading.set(true);
    this.api.post<VoiceFillResponse>(`/activities/${activityId}/voice-fill`, { transcript }).subscribe({
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
}

