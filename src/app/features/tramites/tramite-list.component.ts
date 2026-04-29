import { Component, computed, inject, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatSelectModule } from '@angular/material/select';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { finalize } from 'rxjs';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { isStoredFileValue, openStoredFileDownload, storedFileLabel } from '../../core/utils/file-value.utils';

interface Tramite { id: string; code: string; title: string; description?: string; status: string; workflowId: string; createdAt: string }
interface Workflow { id: string; name: string }
interface WorkflowTransition { id: string; fromNodoId: string; toNodoId: string; name?: string }
interface GridColumn { id: string; name: string; type: string; order?: number }
interface FormField { id: string; name: string; type: string; columns?: GridColumn[]; options?: string[]; required?: boolean; isRequired?: boolean; order?: number }
interface FormDefinition { id: string; title: string; fields: FormField[] }
interface FileValue { fileName: string; storedName: string; downloadPath?: string }
interface WorkflowNodo { id: string; name: string; order: number; nodeType: string; responsibleDepartmentId?: string; responsibleJobRoleId?: string; formDefinition?: FormDefinition }
interface WorkflowDetail extends Workflow { nodo: WorkflowNodo[]; transitions: WorkflowTransition[] }
interface VoiceFillResponse { transcript: string; formData: Record<string, unknown>; appliedFields: Array<{ field: string; value: unknown }>; warnings: string[]; }

declare global {
  interface Window {
    SpeechRecognition?: new () => any;
    webkitSpeechRecognition?: new () => any;
  }
}

@Component({
  selector: 'app-tramite-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, MatCardModule, MatButtonModule, MatCheckboxModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressSpinnerModule, MatSnackBarModule],
  template: `
    <div class="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-6 py-6">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <h2 class="text-3xl font-bold text-slate-900">Tramites</h2>
        <button mat-flat-button color="primary" (click)="openCreate()"><mat-icon>add</mat-icon> Nuevo Tramite</button>
      </div>

      <div class="max-w-[320px]">
        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Buscar por codigo</mat-label>
          <input matInput [ngModel]="codeFilter()" (ngModelChange)="codeFilter.set($event)" placeholder="Ej: TRM00068">
          @if (codeFilter().trim()) { <button mat-icon-button matSuffix (click)="codeFilter.set('')"><mat-icon>close</mat-icon></button> }
        </mat-form-field>
      </div>

      @if (loading()) { <div class="flex justify-center py-16"><mat-spinner /></div> }
      @else {
        <div class="overflow-hidden rounded-3xl bg-white shadow-sm">
          <div class="overflow-x-auto">
            <table class="min-w-full text-sm">
              <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                <tr><th class="px-4 py-3">Codigo</th><th class="px-4 py-3">Titulo</th><th class="px-4 py-3">Estado</th><th class="px-4 py-3">Workflow</th><th class="px-4 py-3">Fecha</th><th class="px-4 py-3"></th></tr>
              </thead>
              <tbody>
                @for (p of filteredTramites(); track p.id) {
                  <tr class="border-t border-slate-100 hover:bg-slate-50">
                    <td class="px-4 py-3"><code class="rounded bg-slate-100 px-2 py-1 text-xs">{{ p.code }}</code></td>
                    <td class="px-4 py-3">{{ p.title }}</td>
                    <td class="px-4 py-3"><span class="rounded-full px-3 py-1 text-xs font-semibold" [ngClass]="statusClass(p.status)">{{ p.status }}</span></td>
                    <td class="px-4 py-3">{{ wfName(p.workflowId) }}</td>
                    <td class="px-4 py-3">{{ p.createdAt | date:'dd/MM/yyyy' }}</td>
                    <td class="px-4 py-3"><button mat-icon-button [routerLink]="[p.id]"><mat-icon>visibility</mat-icon></button></td>
                  </tr>
                }
                @empty { <tr><td colspan="6" class="px-4 py-10 text-center text-slate-400">No hay tramites</td></tr> }
              </tbody>
            </table>
          </div>
        </div>
      }

      @if (showForm()) {
        <div class="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/40 px-4" (click)="closeCreate()">
          <mat-card class="max-h-[85vh] w-full max-w-[540px] overflow-auto rounded-3xl p-6 shadow-2xl" (click)="$event.stopPropagation()">
            <h3 class="mb-4 text-xl font-semibold text-slate-900">Nuevo Tramite</h3>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Workflow</mat-label>
              <mat-select [(ngModel)]="formWorkflowId" (ngModelChange)="onWorkflowChange($event)">
                @for (wf of workflows(); track wf.id) { <mat-option [value]="wf.id">{{ wf.name }}</mat-option> }
              </mat-select>
            </mat-form-field>

            @if (loadingWorkflowDetail()) { <div class="flex justify-center pb-5 pt-2"><mat-spinner diameter="24" /></div> }
            @else if (entryNodo()) {
              <div class="mb-4 text-sm text-slate-600"><strong>Etapa:</strong> {{ entryNodo()!.name }}</div>
              @if (entryFormFields().length) {
                <div class="mb-3 flex items-center justify-between gap-3">
                  <h4 class="text-sm font-semibold text-slate-900">{{ entryNodo()!.formDefinition?.title || 'Formulario' }}</h4>
                  <button mat-stroked-button type="button" [disabled]="voiceLoading()" (click)="toggleVoiceCapture()">
                    <mat-icon>{{ voiceListening() ? 'mic_off' : 'mic' }}</mat-icon>
                    {{ voiceListening() ? 'Detener voz' : 'Llenar por voz' }}
                  </button>
                </div>
                @for (field of entryFormFields(); track field.id) {
                  @if (field.type === 'FILE') {
                    <div class="mb-4 flex flex-col gap-2">
                      <label class="text-sm font-medium text-slate-700">{{ field.name }}</label>
                      <input class="text-sm text-slate-700" type="file" (change)="onFileSelected(field, $event)">
                      @if (fieldValue(field) && isFileValue(fieldValue(field))) {
                        <button type="button" class="bg-transparent p-0 text-left text-xs text-indigo-600 underline" (click)="downloadFile(fieldValue(field))">{{ fileLabel(fieldValue(field)) }}</button>
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
                                        <input
                                          class="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-400"
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
                      } @else {
                        <div class="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-3 text-sm text-slate-500">
                          Esta grilla no tiene columnas configuradas.
                        </div>
                      }
                    </div>
                  } @else if (field.type === 'CHECKBOX') {
                    <div class="mb-4 rounded-xl border border-slate-200 px-3 py-2">
                      <mat-checkbox [ngModel]="toBoolean(fieldValue(field))" (ngModelChange)="setFieldValue(field, $event)">
                        {{ field.name }}
                      </mat-checkbox>
                    </div>
                  } @else {
                    <mat-form-field appearance="outline" class="w-full">
                      <mat-label>{{ field.name }}</mat-label>
                      @switch (field.type) {
                        @case ('DATE') { <input matInput type="date" [ngModel]="fieldValue(field)" (ngModelChange)="setFieldValue(field,$event)" [required]="isRequired(field)"> }
                        @case ('NUMBER') { <input matInput type="number" [ngModel]="fieldValue(field)" (ngModelChange)="setFieldValue(field,$event)" [required]="isRequired(field)"> }
                        @case ('EMAIL') { <input matInput type="email" [ngModel]="fieldValue(field)" (ngModelChange)="setFieldValue(field,$event)" [required]="isRequired(field)"> }
                        @default { <input matInput [ngModel]="fieldValue(field)" (ngModelChange)="setFieldValue(field,$event)" [required]="isRequired(field)"> }
                      }
                    </mat-form-field>
                  }
                }
              } @else {
                <p class="mb-3 text-sm text-slate-500">Sin formulario inicial para tu etapa.</p>
              }
            }

            <div class="mt-2 flex justify-end gap-2">
              <button mat-button (click)="closeCreate()">Cancelar</button>
              <button mat-flat-button color="primary" (click)="save()" [disabled]="loadingWorkflowDetail() || submitting()">{{ submitting() ? 'Enviando...' : 'Enviar' }}</button>
            </div>
          </mat-card>
        </div>
      }
    </div>
  `
})
export class TramiteListComponent implements OnInit {
  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  private auth = inject(AuthService);

  tramites = signal<Tramite[]>([]);
  workflows = signal<Workflow[]>([]);
  loading = signal(true);
  showForm = signal(false);
  loadingWorkflowDetail = signal(false);
  submitting = signal(false);
  selectedWorkflow = signal<WorkflowDetail | null>(null);
  entryNodo = signal<WorkflowNodo | null>(null);
  autoStartTransition = signal<WorkflowTransition | null>(null);
  submitTransition = signal<WorkflowTransition | null>(null);
  formValues = signal<Record<string, unknown>>({});
  voiceListening = signal(false);
  voiceLoading = signal(false);
  voiceTranscript = signal('');
  formWorkflowId = '';
  codeFilter = signal('');
  private speechRecognition: any = null;
  private shouldApplyVoice = false;
  private silenceTimer: ReturnType<typeof setTimeout> | null = null;

  entryFormFields = computed(() => [...(this.entryNodo()?.formDefinition?.fields ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  filteredTramites = computed(() => {
    const f = this.codeFilter().trim().toLowerCase();
    return f ? this.tramites().filter(p => p.code.toLowerCase().includes(f)) : this.tramites();
  });

  ngOnInit() {
    this.api.get<Tramite[]>('/tramites').subscribe({ next: p => { this.tramites.set(p); this.loading.set(false); }, error: () => this.loading.set(false) });
    this.api.get<Workflow[]>('/workflows').subscribe({ next: w => this.workflows.set(w) });
  }

  statusClass(s: string) {
    return ({ PENDIENTE: 'bg-amber-100 text-amber-800', EN_PROGRESO: 'bg-blue-100 text-blue-800', COMPLETADO: 'bg-emerald-100 text-emerald-800', RECHAZADO: 'bg-rose-100 text-rose-800' } as Record<string, string>)[s] ?? 'bg-slate-100 text-slate-700';
  }

  wfName(id: string) { return this.workflows().find(w => w.id === id)?.name || id; }

  openCreate() {
    this.stopVoiceCapture(false);
    this.voiceTranscript.set('');
    this.formWorkflowId = '';
    this.formValues.set({});
    this.selectedWorkflow.set(null); this.entryNodo.set(null);
    this.autoStartTransition.set(null); this.submitTransition.set(null);
    this.showForm.set(true);
  }

  closeCreate() {
    this.stopVoiceCapture(false);
    this.showForm.set(false);
  }

  onWorkflowChange(workflowId: string) {
    this.stopVoiceCapture(false);
    this.voiceTranscript.set('');
    this.formValues.set({});
    this.selectedWorkflow.set(null); this.entryNodo.set(null);
    this.autoStartTransition.set(null); this.submitTransition.set(null);
    if (!workflowId) return;
    this.loadingWorkflowDetail.set(true);
    this.api.get<WorkflowDetail>(`/workflows/${workflowId}`).pipe(finalize(() => this.loadingWorkflowDetail.set(false))).subscribe({
      next: wf => {
        this.selectedWorkflow.set(wf);
        const nodo = [...wf.nodo].sort((a, b) => a.order - b.order);
        const nodoInicio = nodo.find(nodo => nodo.nodeType.toLowerCase() === 'inicio') ?? null;
        const primerNodoTrabajo = nodo.find(nodo => nodo.nodeType.toLowerCase() !== 'inicio') ?? null;
        const transicionInicio = nodoInicio ? (wf.transitions.find(t => t.fromNodoId === nodoInicio.id) ?? null) : null;
        const entry = transicionInicio
          ? nodo.find(nodo => nodo.id === transicionInicio.toNodoId) ?? primerNodoTrabajo ?? nodoInicio
          : primerNodoTrabajo ?? nodoInicio;
        if (!entry) return;
        this.autoStartTransition.set(transicionInicio);
        this.submitTransition.set(this.resolveSubmitTransition(wf, entry));
        if (entry.formDefinition?.fields?.length) { this.entryNodo.set(entry); return; }
        this.api.get<FormDefinition>(`/forms/nodo/${entry.id}`).subscribe({ next: f => this.entryNodo.set({ ...entry, formDefinition: f }), error: () => this.entryNodo.set(entry) });
      },
      error: (err) => this.snack.open(err.error?.message || 'Error al cargar el workflow', '', { duration: 3000 })
    });
  }

  private resolveSubmitTransition(workflow: WorkflowDetail, entry: WorkflowNodo) {
    const transition = workflow.transitions.find(t => t.fromNodoId === entry.id) ?? null;
    if (!transition) return null;
    const targetNodo = workflow.nodo.find(nodo => nodo.id === transition.toNodoId);
    const targetType = String(targetNodo?.nodeType || '').toLowerCase();
    if (targetType === 'decision' || targetType === 'iteracion') {
      return null;
    }
    return transition;
  }

  isRequired(f: FormField) { return !!(f.required || f.isRequired); }
  fieldValue(f: FormField) { return this.formValues()[f.name] ?? ''; }
  setFieldValue(f: FormField, v: unknown) { this.formValues.update(vals => ({ ...vals, [f.name]: v })); }
  inputType(type: string) { return type === 'DATE' ? 'date' : type === 'NUMBER' ? 'number' : type === 'EMAIL' ? 'email' : 'text'; }
  toBoolean(value: unknown) { return value === true; }

  gridColumns(field: FormField) {
    return [...(field.columns ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  gridRows(field: FormField) {
    const value = this.formValues()[field.name];
    return Array.isArray(value) ? value.filter((row): row is Record<string, unknown> => !!row && typeof row === 'object' && !Array.isArray(row)) : [];
  }

  addGridRow(field: FormField) {
    const columns = this.gridColumns(field);
    if (!columns.length) {
      this.snack.open('La grilla no tiene columnas configuradas', '', { duration: 2500 });
      return;
    }
    const nextRow = Object.fromEntries(columns.map(column => [column.name, '']));
    this.setFieldValue(field, [...this.gridRows(field), nextRow]);
  }

  removeGridRow(field: FormField, rowIndex: number) {
    this.setFieldValue(field, this.gridRows(field).filter((_, index) => index !== rowIndex));
  }

  setGridCellValue(field: FormField, rowIndex: number, column: GridColumn, value: unknown) {
    const rows = this.gridRows(field).map(row => ({ ...row }));
    if (!rows[rowIndex]) {
      rows[rowIndex] = {};
    }
    rows[rowIndex] = { ...rows[rowIndex], [column.name]: value };
    this.setFieldValue(field, rows);
  }

  isFileValue(v: unknown): v is FileValue { return isStoredFileValue(v); }
  fileLabel(v: unknown) { return storedFileLabel(v); }
  downloadFile(v: unknown) {
    openStoredFileDownload(v);
  }

  onFileSelected(field: FormField, event: Event) {
    const file = (event.target as HTMLInputElement)?.files?.[0];
    if (!file) return;
    const body = new FormData(); body.append('file', file);
    this.api.post<FileValue>('/files/upload', body).subscribe({ next: u => { this.setFieldValue(field, u); this.snack.open(`Archivo "${u.fileName || file.name}" subido`, '', { duration: 3000 }); }, error: () => this.snack.open('Error al subir archivo', '', { duration: 3000 }) });
  }

  toggleVoiceCapture() {
    if (this.voiceListening()) {
      this.stopVoiceCapture(true);
      return;
    }
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognitionCtor) {
      this.snack.open('Tu navegador no soporta reconocimiento de voz', '', { duration: 3500 });
      return;
    }
    if (!this.formWorkflowId || !this.entryFormFields().length) {
      this.snack.open('El workflow actual no tiene formulario para completar por voz', '', { duration: 3000 });
      return;
    }
    this.speechRecognition = new SpeechRecognitionCtor();
    this.speechRecognition.lang = 'es-ES';
    this.speechRecognition.continuous = true;
    this.speechRecognition.interimResults = true;
    this.shouldApplyVoice = false;
    this.speechRecognition.onstart = () => {
      this.voiceListening.set(true);
      this.voiceTranscript.set('');
      this.clearSilenceTimer();
    };
    this.speechRecognition.onerror = () => {
      this.voiceListening.set(false);
      this.clearSilenceTimer();
      this.shouldApplyVoice = false;
      this.snack.open('No se pudo capturar la voz', '', { duration: 3000 });
    };
    this.speechRecognition.onend = () => {
      this.clearSilenceTimer();
      this.voiceListening.set(false);
      const shouldApply = this.shouldApplyVoice;
      this.shouldApplyVoice = false;
      this.speechRecognition = null;
      const transcript = this.voiceTranscript().trim();
      if (shouldApply && transcript) {
        this.applyVoiceTranscript(transcript);
      }
    };
    this.speechRecognition.onresult = (event: any) => {
      const transcript = Array.from(event.results ?? [])
        .map((result: any) => result?.[0]?.transcript || '')
        .join(' ')
        .trim();
      if (!transcript) return;
      this.voiceTranscript.set(transcript);
      this.restartSilenceTimer();
    };
    this.speechRecognition.start();
  }

  save() {
    if (!this.formWorkflowId) { this.snack.open('Selecciona un workflow', '', { duration: 2500 }); return; }
    if (!this.entryNodo()) { this.snack.open('Espera a que cargue la etapa inicial', '', { duration: 3000 }); return; }
    const wf = this.selectedWorkflow(); const entry = this.entryNodo();
    const payload = {
      title: wf && entry ? `${wf.name} - ${entry.name}` : `Tramite ${new Date().toLocaleString()}`,
      description: '', workflowId: this.formWorkflowId, formData: this.formValues(),
      comment: `Enviado por ${this.auth.user()?.name || 'usuario'}`,
      autoTransitionIds: [this.autoStartTransition()?.id, this.submitTransition()?.id].filter((id): id is string => !!id)
    };
    this.submitting.set(true);
    this.api.post<any>('/tramites/submit', payload).pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: (p: any) => { this.tramites.update(list => [p, ...list.filter(i => i.id !== p.id)]); this.closeCreate(); this.snack.open('Tramite enviado', '', { duration: 2500 }); },
      error: (err) => this.snack.open(err.error?.message || 'Error al enviar', '', { duration: 3500 })
    });
  }

  private stopVoiceCapture(executeApply: boolean) {
    this.shouldApplyVoice = executeApply;
    this.clearSilenceTimer();
    if (this.speechRecognition) {
      this.speechRecognition.stop();
      return;
    }
    if (executeApply && this.voiceTranscript().trim()) {
      this.applyVoiceTranscript(this.voiceTranscript().trim());
    }
    this.voiceListening.set(false);
  }

  private applyVoiceTranscript(transcript: string) {
    this.voiceLoading.set(true);
    this.api.post<VoiceFillResponse>('/tramites/voice-fill', {
      workflowId: this.formWorkflowId,
      transcript,
      formData: this.formValues()
    }).pipe(finalize(() => this.voiceLoading.set(false))).subscribe({
      next: (response) => {
        this.formValues.set({ ...response.formData });
        const applied = response.appliedFields?.length ?? 0;
        if (applied > 0) {
          this.snack.open(`Se completaron ${applied} campo(s) por voz`, '', { duration: 2500 });
        } else {
          this.snack.open(response.warnings?.[0] || 'No se detectaron valores aplicables', '', { duration: 3000 });
        }
      },
      error: (err) => this.snack.open(err.error?.message || 'No se pudo interpretar la voz', '', { duration: 3000 })
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
