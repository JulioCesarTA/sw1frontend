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

interface Tramite { id: string; code: string; title: string; description?: string; status: string; workflowId: string; createdAt: string }
interface Workflow { id: string; name: string }
interface WorkflowTransition { id: string; fromStageId: string; toStageId: string; name?: string }
interface FormField { id: string; name: string; type: string; options?: string[]; required?: boolean; isRequired?: boolean; order?: number }
interface FormDefinition { id: string; title: string; fields: FormField[] }
interface FileValue { fileName: string; storedName: string; downloadPath?: string }
interface WorkflowStage { id: string; name: string; order: number; nodeType: string; responsibleDepartmentId?: string; responsibleJobRoleId?: string; formDefinition?: FormDefinition }
interface WorkflowDetail extends Workflow { stages: WorkflowStage[]; transitions: WorkflowTransition[] }

@Component({
  selector: 'app-tramite-list',
  standalone: true,
  imports: [CommonModule, RouterLink, FormsModule, MatCardModule, MatButtonModule, MatIconModule, MatFormFieldModule, MatInputModule, MatSelectModule, MatProgressSpinnerModule, MatSnackBarModule],
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
        <div class="fixed inset-0 z-[1000] flex items-center justify-center bg-slate-950/40 px-4" (click)="showForm.set(false)">
          <mat-card class="max-h-[85vh] w-full max-w-[540px] overflow-auto rounded-3xl p-6 shadow-2xl" (click)="$event.stopPropagation()">
            <h3 class="mb-4 text-xl font-semibold text-slate-900">Nuevo Tramite</h3>
            <mat-form-field appearance="outline" class="w-full">
              <mat-label>Workflow</mat-label>
              <mat-select [(ngModel)]="formWorkflowId" (ngModelChange)="onWorkflowChange($event)">
                @for (wf of workflows(); track wf.id) { <mat-option [value]="wf.id">{{ wf.name }}</mat-option> }
              </mat-select>
            </mat-form-field>

            @if (loadingWorkflowDetail()) { <div class="flex justify-center pb-5 pt-2"><mat-spinner diameter="24" /></div> }
            @else if (entryStage()) {
              <div class="mb-4 text-sm text-slate-600"><strong>Etapa:</strong> {{ entryStage()!.name }}</div>
              @if (entryFormFields().length) {
                <h4 class="mb-3 text-sm font-semibold text-slate-900">{{ entryStage()!.formDefinition?.title || 'Formulario' }}</h4>
                @for (field of entryFormFields(); track field.id) {
                  @if (field.type === 'FILE') {
                    <div class="mb-4 flex flex-col gap-2">
                      <label class="text-sm font-medium text-slate-700">{{ field.name }}</label>
                      <input class="text-sm text-slate-700" type="file" (change)="onFileSelected(field, $event)">
                      @if (fieldValue(field) && isFileValue(fieldValue(field))) {
                        <button type="button" class="bg-transparent p-0 text-left text-xs text-indigo-600 underline" (click)="downloadFile(fieldValue(field))">{{ fileLabel(fieldValue(field)) }}</button>
                      }
                    </div>
                  } @else {
                    <mat-form-field appearance="outline" class="w-full">
                      <mat-label>{{ field.name }}</mat-label>
                      @switch (field.type) {
                        @case ('DATE') { <input matInput type="date" [ngModel]="fieldValue(field)" (ngModelChange)="setFieldValue(field,$event)" [required]="isRequired(field)"> }
                        @case ('NUMBER') { <input matInput type="number" [ngModel]="fieldValue(field)" (ngModelChange)="setFieldValue(field,$event)" [required]="isRequired(field)"> }
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
              <button mat-button (click)="showForm.set(false)">Cancelar</button>
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
  entryStage = signal<WorkflowStage | null>(null);
  autoStartTransition = signal<WorkflowTransition | null>(null);
  submitTransition = signal<WorkflowTransition | null>(null);
  formValues = signal<Record<string, unknown>>({});
  formWorkflowId = '';
  codeFilter = signal('');

  entryFormFields = computed(() => [...(this.entryStage()?.formDefinition?.fields ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  filteredTramites = computed(() => {
    const f = this.codeFilter().trim().toLowerCase();
    return f ? this.tramites().filter(p => p.code.toLowerCase().includes(f)) : this.tramites();
  });

  ngOnInit() {
    this.api.get<Tramite[]>('/tramites').subscribe({ next: p => { this.tramites.set(p); this.loading.set(false); }, error: () => this.loading.set(false) });
    this.api.get<Workflow[]>('/workflows').subscribe({ next: w => this.workflows.set(w) });
  }

  statusClass(s: string) {
    return ({ PENDIENTE: 'bg-amber-100 text-amber-800', EN_PROGRESO: 'bg-blue-100 text-blue-800', COMPLETADO: 'bg-emerald-100 text-emerald-800', RECHAZADO: 'bg-rose-100 text-rose-800', APROBADO: 'bg-emerald-100 text-emerald-800', OBSERVADO: 'bg-yellow-100 text-yellow-800' } as Record<string, string>)[s] ?? 'bg-slate-100 text-slate-700';
  }

  wfName(id: string) { return this.workflows().find(w => w.id === id)?.name || id; }

  openCreate() {
    this.formWorkflowId = '';
    this.formValues.set({});
    this.selectedWorkflow.set(null); this.entryStage.set(null);
    this.autoStartTransition.set(null); this.submitTransition.set(null);
    this.showForm.set(true);
  }

  onWorkflowChange(workflowId: string) {
    this.formValues.set({});
    this.selectedWorkflow.set(null); this.entryStage.set(null);
    this.autoStartTransition.set(null); this.submitTransition.set(null);
    if (!workflowId) return;
    this.loadingWorkflowDetail.set(true);
    this.api.get<WorkflowDetail>(`/workflows/${workflowId}`).pipe(finalize(() => this.loadingWorkflowDetail.set(false))).subscribe({
      next: wf => {
        this.selectedWorkflow.set(wf);
        const stages = [...wf.stages].sort((a, b) => a.order - b.order);
        const startStage = stages.find(stage => stage.nodeType.toLowerCase() === 'start') ?? null;
        const firstWorkStage = stages.find(stage => stage.nodeType.toLowerCase() !== 'start') ?? null;
        const startTx = startStage ? (wf.transitions.find(t => t.fromStageId === startStage.id) ?? null) : null;
        const entry = startTx
          ? stages.find(stage => stage.id === startTx.toStageId) ?? firstWorkStage ?? startStage
          : firstWorkStage ?? startStage;
        if (!entry) return;
        this.autoStartTransition.set(startTx);
        this.submitTransition.set(wf.transitions.find(t => t.fromStageId === entry.id) ?? null);
        if (entry.formDefinition?.fields?.length) { this.entryStage.set(entry); return; }
        this.api.get<FormDefinition>(`/forms/stage/${entry.id}`).subscribe({ next: f => this.entryStage.set({ ...entry, formDefinition: f }), error: () => this.entryStage.set(entry) });
      },
      error: (err) => this.snack.open(err.error?.message || 'Error al cargar el workflow', '', { duration: 3000 })
    });
  }

  isRequired(f: FormField) { return !!(f.required || f.isRequired); }
  fieldValue(f: FormField) { return this.formValues()[f.name] ?? ''; }
  setFieldValue(f: FormField, v: unknown) { this.formValues.update(vals => ({ ...vals, [f.name]: v })); }

  isFileValue(v: unknown): v is FileValue { return !!v && typeof v === 'object' && 'storedName' in (v as object); }
  fileLabel(v: unknown) { const f = v as FileValue; return f?.fileName || f?.storedName || ''; }
  downloadFile(v: unknown) {
    if (!this.isFileValue(v)) return;
    const path = v.downloadPath || `/files/${v.storedName}/download`;
    window.open(`${environment.apiUrl}${path}${path.includes('?') ? '&' : '?'}filename=${encodeURIComponent(this.fileLabel(v))}`, '_blank');
  }

  onFileSelected(field: FormField, event: Event) {
    const file = (event.target as HTMLInputElement)?.files?.[0];
    if (!file) return;
    const body = new FormData(); body.append('file', file);
    this.api.post<FileValue>('/files/upload', body).subscribe({ next: u => this.setFieldValue(field, u), error: () => this.snack.open('Error al subir archivo', '', { duration: 3000 }) });
  }

  save() {
    if (!this.formWorkflowId) { this.snack.open('Selecciona un workflow', '', { duration: 2500 }); return; }
    if (!this.entryStage()) { this.snack.open('Espera a que cargue la etapa inicial', '', { duration: 3000 }); return; }
    const wf = this.selectedWorkflow(); const entry = this.entryStage();
    const payload = {
      title: wf && entry ? `${wf.name} - ${entry.name}` : `Tramite ${new Date().toLocaleString()}`,
      description: '', workflowId: this.formWorkflowId, formData: this.formValues(),
      comment: `Enviado por ${this.auth.user()?.name || 'usuario'}`,
      autoTransitionIds: [this.autoStartTransition()?.id, this.submitTransition()?.id].filter((id): id is string => !!id)
    };
    this.submitting.set(true);
    this.api.post<any>('/tramites/submit', payload).pipe(finalize(() => this.submitting.set(false))).subscribe({
      next: (p: any) => { this.tramites.update(list => [p, ...list.filter(i => i.id !== p.id)]); this.showForm.set(false); this.snack.open('Tramite enviado', '', { duration: 2500 }); },
      error: (err) => this.snack.open(err.error?.message || 'Error al enviar', '', { duration: 3500 })
    });
  }
}
