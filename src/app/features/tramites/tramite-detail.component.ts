import { Component, computed, inject, Input, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSnackBar, MatSnackBarModule } from '@angular/material/snack-bar';
import { ApiService } from '../../core/services/api.service';
import { environment } from '../../../environments/environment';

interface HistoryEntry { id: string; action: string; fromStageId?: string; toStageId?: string; comment?: string; changedAt: string; stageName?: string; departmentName?: string; jobRoleName?: string; isCurrent?: boolean }
interface TransitionOption { id: string; fromStageId: string; toStageId: string; name: string; label?: string; targetStageName?: string; kind?: string; branchOutcome?: string }
interface FormField { id: string; name: string; type: string; options?: string[]; required?: boolean; isRequired?: boolean; order?: number }
interface FormDefinition { id: string; title: string; fields: FormField[] }
interface FileValue { fileName: string; storedName: string; downloadPath?: string }
interface TramiteDetail { id: string; code: string; title: string; description?: string; status: string; workflowId: string; currentStageId: string; formData?: Record<string, unknown>; availableTransitions: TransitionOption[]; history: HistoryEntry[] }

const H_COLOR: Record<string, string> = {
  CREADO: 'blue', RECHAZADO: 'rose', DECISION_RECHAZADA: 'orange',
  LOOP_RECHAZADO: 'orange', LOOP_APROBADO: 'sky', LOOP_EVALUADO: 'sky'
};
const H_LABELS: Record<string, string> = {
  AVANZADO: 'Avanzado',
  CREADO: 'Creado', UNION_COMPLETADA: 'Union completada', DECISION_RECHAZADA: 'Rechazado',
  LOOP_RECHAZADO: 'Rechazado', LOOP_APROBADO: 'Iteracion aprobada', RECHAZADO: 'Rechazado',
  BIFURCACION: 'Bifurcacion'
};
const H_ICONS: Record<string, string> = {
  CREADO: 'add_circle', RECHAZADO: 'cancel', DECISION_RECHAZADA: 'undo',
  UNION_COMPLETADA: 'merge_type', LOOP_RECHAZADO: 'repeat', LOOP_APROBADO: 'repeat',
  BIFURCACION: 'call_split'
};

@Component({
  selector: 'app-tramite-detail',
  standalone: true,
  imports: [CommonModule, FormsModule, MatButtonModule, MatIconModule, MatCardModule, MatFormFieldModule, MatInputModule, MatProgressSpinnerModule, MatSnackBarModule],
  template: `
    <div class="mx-auto flex w-full max-w-[1400px] flex-col gap-6 px-6 py-6">
      <div class="flex items-center gap-3">
        <button mat-icon-button (click)="router.navigate(['/tramites'])"><mat-icon>arrow_back</mat-icon></button>
        <div>
          <h2 class="text-2xl font-bold text-slate-900">{{ tramite()?.title }}</h2>
          <code class="rounded bg-slate-100 px-2 py-1 text-xs">{{ tramite()?.code }}</code>
        </div>
        <span class="ml-auto rounded-full px-3 py-1 text-xs font-semibold" [ngClass]="statusClass(tramite()?.status || '')">{{ tramite()?.status }}</span>
      </div>

      @if (loading()) { <div class="flex justify-center py-16"><mat-spinner /></div> }
      @else if (tramite()) {
        <div class="grid gap-4 xl:grid-cols-2">
          <mat-card class="rounded-3xl p-5 shadow-sm">
            <h3 class="mb-3 text-base font-semibold text-slate-900">Informacion</h3>
            <p class="mb-2 text-sm text-slate-600"><strong class="text-slate-900">Descripcion:</strong> {{ tramite()!.description || 'Sin Descripcion' }}</p>
            <p class="text-sm text-slate-600"><strong class="text-slate-900">Estado:</strong> <span class="ml-1 rounded-full px-3 py-1 text-xs font-semibold" [ngClass]="statusClass(tramite()!.status)">{{ tramite()!.status }}</span></p>
          </mat-card>

          @if (availableTransitions().length && tramite()!.status !== 'COMPLETADO' && tramite()!.status !== 'RECHAZADO') {
            <mat-card class="rounded-3xl p-5 shadow-sm">
              <h3 class="mb-3 text-base font-semibold text-slate-900">Avanzar Tramite</h3>
              @if (currentFormFields().length) {
                <h4 class="mb-3 text-sm font-semibold text-slate-900">{{ currentFormTitle() }}</h4>
                @for (field of currentFormFields(); track field.id) {
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
                        @case ('EMAIL') { <input matInput type="email" [ngModel]="fieldValue(field)" (ngModelChange)="setFieldValue(field,$event)" [required]="isRequired(field)"> }
                        @default { <input matInput [ngModel]="fieldValue(field)" (ngModelChange)="setFieldValue(field,$event)" [required]="isRequired(field)"> }
                      }
                    </mat-form-field>
                  }
                }
              }
              @if (decisionButtons().length) {
                <div class="mb-4 flex flex-wrap gap-2">
                  @for (t of decisionButtons(); track t.id; let i = $index) {
                    <button mat-flat-button [color]="isRejectTransition(t,i)?'warn':'primary'" (click)="advance(t.id)">{{ btnLabel(t,i) }}</button>
                  }
                </div>
              }
              <mat-form-field appearance="outline" class="w-full"><mat-label>Comentario</mat-label><input matInput [(ngModel)]="comment"></mat-form-field>
              <div class="mt-2 flex flex-wrap gap-2">
                @if (!decisionButtons().length) { <button mat-flat-button color="primary" (click)="advance()" [disabled]="!primaryTransitionId()"><mat-icon>arrow_forward</mat-icon> Enviar actividad</button> }
                <button mat-stroked-button color="warn" (click)="reject()"><mat-icon>close</mat-icon> Rechazar</button>
              </div>
            </mat-card>
          }

          <mat-card class="rounded-3xl p-5 shadow-sm xl:col-span-2">
            <h3 class="mb-3 text-base font-semibold text-slate-900">Historial</h3>
            <div class="relative pl-5">
              <div class="absolute bottom-4 left-[15px] top-4 w-[2px] bg-slate-200"></div>
              @for (h of tramite()!.history; track h.id) {
                <div class="relative flex gap-3 py-3">
                  <div class="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full" [ngClass]="hDotClass(h)">
                    <mat-icon class="!h-[18px] !w-[18px] !text-[18px]">{{ H_ICONS[h.action] || 'arrow_forward' }}</mat-icon>
                  </div>
                  <div class="flex-1 pt-0.5">
                    <div class="flex flex-wrap items-center gap-2">
                      <span class="text-sm font-semibold" [ngClass]="hLabelClass(h)">{{ H_LABELS[h.action] || h.action }}</span>
                      @if (h.isCurrent) { <span class="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-bold text-amber-700">EN CURSO</span> }
                    </div>
                    @if (h.stageName) { <p class="mt-0.5 text-xs font-medium text-slate-700">{{ h.stageName }}</p> }
                    @if (h.departmentName || h.jobRoleName) {
                      <p class="text-xs text-slate-500">{{ h.departmentName }}@if(h.departmentName && h.jobRoleName){<span class="mx-1 text-slate-300">·</span>}{{ h.jobRoleName }}</p>
                    }
                    @if (h.comment) { <p class="mt-0.5 text-xs italic text-slate-500">{{ h.comment }}</p> }
                    <p class="mt-1 text-xs text-slate-400">{{ h.changedAt | date:'dd/MM/yyyy HH:mm' }}</p>
                  </div>
                </div>
              }
              @if (tramite()!.status === 'COMPLETADO') {
                <div class="relative flex gap-3 py-3">
                  <div class="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700"><mat-icon class="!h-[18px] !w-[18px] !text-[18px]">flag</mat-icon></div>
                  <div class="flex-1 pt-0.5"><span class="text-sm font-semibold text-blue-700">FIN</span><p class="text-xs text-slate-500">Trámite completado</p></div>
                </div>
              }
            </div>
          </mat-card>
        </div>
      }
    </div>
  `
})
export class TramiteDetailComponent implements OnInit {
  @Input() id!: string;
  protected readonly H_ICONS = H_ICONS;
  protected readonly H_LABELS = H_LABELS;

  private api = inject(ApiService);
  private snack = inject(MatSnackBar);
  readonly router = inject(Router);

  tramite = signal<TramiteDetail | null>(null);
  currentForm = signal<FormDefinition | null>(null);
  formValues = signal<Record<string, unknown>>({});
  loading = signal(true);
  comment = '';

  currentFormFields = computed(() => [...(this.currentForm()?.fields ?? [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0)));
  currentFormTitle = computed(() => this.currentForm()?.title || 'Formulario de la etapa');
  availableTransitions = computed(() => this.tramite()?.availableTransitions ?? []);
  decisionButtons = computed(() => {
    const t = this.availableTransitions();
    return t.length && t.every(x => x.kind === 'decision-branch') ? this.dedupe(t) : [];
  });
  primaryTransitionId = computed(() => this.decisionButtons().length ? '' : (this.availableTransitions()[0]?.id ?? ''));

  ngOnInit() { this.load(); }

  load() {
    this.api.get<TramiteDetail>(`/tramites/${this.id}`).subscribe({
      next: p => { this.tramite.set(p); this.formValues.set((p.formData ?? {}) as Record<string, unknown>);
      this.loading.set(false); this.loadForm(p.currentStageId); },
      error: () => this.loading.set(false)
    });
  }

  statusClass(status: string) {
    return ({ PENDIENTE: 'bg-amber-100 text-amber-800', EN_PROGRESO: 'bg-blue-100 text-blue-800',
      COMPLETADO: 'bg-emerald-100 text-emerald-800', RECHAZADO: 'bg-rose-100 text-rose-800',
      APROBADO: 'bg-emerald-100 text-emerald-800', OBSERVADO: 'bg-yellow-100 text-yellow-800'
    } as Record<string, string>)[status] ?? 'bg-slate-100 text-slate-700';
  }

  private hColor(h: HistoryEntry) { return h.isCurrent ? 'amber' : (H_COLOR[h.action] ?? 'emerald'); }
  hDotClass(h: HistoryEntry) { const c = this.hColor(h); return `bg-${c}-100 text-${c}-700`; }
  hLabelClass(h: HistoryEntry) { return `text-${this.hColor(h)}-700`; }

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
    const body = new FormData();
    body.append('file', file);
    this.api.post<FileValue>('/files/upload', body).subscribe({ next: u => this.setFieldValue(field, u), error: () => this.snack.open('Error al subir archivo', '', { duration: 3000 }) });
  }

  advance(transitionId?: string) {
    const id = transitionId ?? this.primaryTransitionId();
    if (!id) return;
    this.api.post(`/activities/${this.id}/advance`, { transitionId: id, comment: this.comment, formData: this.formValues() }).subscribe({
      next: (p: any) => { this.tramite.set(p); this.formValues.set((p.formData ?? {}) as Record<string, unknown>); this.comment = ''; this.loadForm(p.currentStageId); this.snack.open('Tramite avanzado', '', { duration: 2000 }); },
      error: (err) => this.snack.open(err.error?.message || 'Error', '', { duration: 3000 })
    });
  }

  reject() {
    const reason = prompt('Motivo del rechazo:');
    if (reason === null) return;
    this.api.post(`/activities/${this.id}/reject`, { reason }).subscribe({
      next: (p: any) => { this.tramite.update(prev => prev ? { ...prev, status: p.status } : prev); this.snack.open('Rechazado', '', { duration: 2000 }); },
      error: () => this.snack.open('Error al rechazar', '', { duration: 3000 })
    });
  }

  btnLabel(t: TransitionOption, i: number) { return (t.label || t.name || '').trim() || `Opcion ${i + 1}`; }
  isRejectTransition(t: TransitionOption, i: number) {
    const n = this.btnLabel(t, i).toLowerCase();
    return t.branchOutcome === 'reject' || ['no', 'rechazar', 'rechazado', 'devolver'].includes(n);
  }

  private dedupe(transitions: TransitionOption[]) {
    const seen = new Set<string>();
    return transitions.filter((t, i) => { const k = this.btnLabel(t, i).toLowerCase(); return seen.has(k) ? false : !!seen.add(k); });
  }

  private loadForm(stageId: string) {
    this.api.get<FormDefinition>(`/forms/stage/${stageId}`).subscribe({ next: f => this.currentForm.set(f), error: () => this.currentForm.set(null) });
  }
}
