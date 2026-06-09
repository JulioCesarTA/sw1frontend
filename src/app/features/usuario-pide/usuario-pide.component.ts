import { Component, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { environment } from '../../../environments/environment';



interface AnalyzedDoc {
  filename:     string;
  detectedType: string;
  confidence:   number;
  preview:      string;
}

interface WorkflowMatch {
  workflowId:           string;
  workflowName:         string;
  workflowDescription?: string;
  score:                number;
  cosSim:               number;
  confidence:           string;
  requiredDocs:    string[];
  optionalDocs:    string[];
  presentRequired: string[];
  missingRequired: string[];
  presentOptional: string[];
  docsComplete:    boolean;
}

@Component({
  selector: 'app-usuario-pide',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatProgressSpinnerModule],
  styles: [`
    .mic-btn.recording { animation: pulse 1.2s infinite; }
    @keyframes pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,.4); }
      50%      { box-shadow: 0 0 0 14px rgba(239,68,68,0); }
    }
    .drop-zone { transition: all .2s; }
    .drop-zone.drag-over { border-color: #6366f1; background: #eef2ff; }
  `],
  template: `
    <div class="mx-auto max-w-[1300px] p-6 space-y-6">

      <!-- Header -->
      <div>
        <h2 class="m-0 text-2xl font-bold text-slate-800">Usuario Pide</h2>
        <p class="mt-1 text-sm text-slate-500">
          Describí tu problema y subí tus documentos. TensorFlow analizará el contenido,
          recomendará los 3 workflows más adecuados e indicará qué campos obligatorios faltan completar.
        </p>
      </div>

      <div class="grid grid-cols-1 gap-6 lg:grid-cols-2">

        <!-- Columna izquierda: entrada -->
        <div class="space-y-4">

          <!-- Descripción voz/texto -->
          <div class="rounded-[18px] border border-slate-200 bg-white p-5 shadow-sm">
            <h3 class="mb-3 text-sm font-semibold text-slate-700">
              <mat-icon class="mr-1 !text-[16px] align-middle text-indigo-500">mic</mat-icon>
              Describí tu problema
            </h3>
            <div class="flex gap-3">
              <button
                class="mic-btn flex h-11 w-11 shrink-0 items-center justify-center rounded-full shadow transition"
                [class.recording]="recording()"
                [class.bg-rose-500]="recording()"
                [class.bg-indigo-600]="!recording()"
                (click)="toggleRecording()">
                <mat-icon class="!text-[20px] text-white">{{ recording() ? 'stop' : 'mic' }}</mat-icon>
              </button>
              <textarea
                class="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none"
                rows="4"
                [(ngModel)]="userText"
                placeholder='Ej: "Necesito reconectar el servicio de agua, tengo la factura y mi DNI"'>
              </textarea>
            </div>
            @if (recording()) {
              <p class="mt-2 flex items-center gap-1.5 text-xs text-rose-500">
                <span class="h-2 w-2 animate-pulse rounded-full bg-rose-500"></span>
                Grabando… hablá ahora
              </p>
            }
          </div>

          <!-- Subir documentos -->
          <div class="rounded-[18px] border border-slate-200 bg-white p-5 shadow-sm">
            <h3 class="mb-3 text-sm font-semibold text-slate-700">
              <mat-icon class="mr-1 !text-[16px] align-middle text-emerald-500">upload_file</mat-icon>
              Subí tus documentos
            </h3>
            <p class="mb-3 text-xs text-slate-400">
              Formatos aceptados: <strong>Word (.docx), PDF, TXT</strong>.
              TensorFlow leerá el contenido y determinará qué tipo de documento es cada uno.
            </p>

            <!-- Drop zone -->
            <div
              class="drop-zone flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center transition hover:border-indigo-400 hover:bg-indigo-50"
              (click)="fileInput.click()"
              (dragover)="onDragOver($event)"
              (dragleave)="onDragLeave($event)"
              (drop)="onDrop($event)">
              <mat-icon class="mb-2 !text-4xl text-slate-300">cloud_upload</mat-icon>
              <p class="text-sm font-medium text-slate-500">
                Arrastrá archivos aquí o hacé clic para seleccionar
              </p>
              <p class="mt-1 text-xs text-slate-400">.docx · .pdf · .txt</p>
            </div>
            <input #fileInput type="file" class="hidden"
                   accept=".docx,.pdf,.txt" multiple
                   (change)="onFilesSelected($event)">

            @if (selectedFiles.length) {
              <div class="mt-3 space-y-2">
                @for (f of selectedFiles; track f.name; let i = $index) {
                  <div class="flex items-center justify-between rounded-xl border border-slate-200 bg-white px-3 py-2">
                    <div class="flex items-center gap-2 min-w-0">
                      <mat-icon class="shrink-0 !text-[20px] text-indigo-400">
                        {{ fileIcon() }}
                      </mat-icon>
                      <div class="min-w-0">
                        <p class="truncate text-xs font-medium text-slate-700">{{ f.name }}</p>
                        <p class="text-xs text-slate-400">{{ (f.size / 1024).toFixed(0) }} KB</p>
                      </div>
                    </div>
                    <button (click)="removeFile(i)"
                      class="ml-2 shrink-0 rounded-full p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-500 transition">
                      <mat-icon class="!text-[16px]">close</mat-icon>
                    </button>
                  </div>
                }
              </div>
            }
          </div>

          <!-- Botón analizar -->
          <button
            class="w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50 transition"
            [disabled]="loading() || (!userText.trim() && !selectedFiles.length)"
            (click)="analyze()">
            @if (loading()) {
              <mat-spinner [diameter]="18" />
              TensorFlow analizando documentos…
            } @else {
              <mat-icon class="!text-[20px]">psychology</mat-icon>
              Analizar y recomendar workflow
            }
          </button>

          @if (error()) {
            <div class="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
              <mat-icon class="!text-[18px] shrink-0">error_outline</mat-icon>
              {{ error() }}
            </div>
          }
        </div>

        <!-- Columna derecha: resultados -->
        <div class="space-y-4">

          <!-- Documentos analizados por TF -->
          @if (analyzedDocs().length) {
            <div class="rounded-[18px] border border-slate-200 bg-white p-5 shadow-sm">
              <h3 class="mb-3 text-sm font-semibold text-slate-700">
                <mat-icon class="mr-1 !text-[16px] align-middle text-indigo-400">auto_awesome</mat-icon>
                Documentos leídos por TensorFlow
              </h3>
              <div class="space-y-2">
                @for (doc of analyzedDocs(); track doc.filename) {
                  <div class="flex items-start gap-3 rounded-xl border border-slate-100 bg-slate-50 p-3">
                    <mat-icon class="shrink-0 !text-[22px] text-indigo-500 mt-0.5">
                      {{ docTypeIcon() }}
                    </mat-icon>
                    <div class="flex-1 min-w-0">
                      <div class="flex items-center justify-between gap-2">
                        <p class="truncate text-xs font-semibold text-slate-700">{{ doc.filename }}</p>
                        <span class="shrink-0 rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
                          {{ doc.confidence }}%
                        </span>
                      </div>
                      <p class="mt-0.5 text-xs font-medium text-indigo-600">
                        {{ docTypeLabel(doc.detectedType) }}
                      </p>
                      @if (doc.preview) {
                        <p class="mt-1 line-clamp-2 text-xs text-slate-400">{{ doc.preview }}</p>
                      }
                    </div>
                  </div>
                }
              </div>
            </div>
          }

          <!-- Estado vacío -->
          @if (!matches().length && !loading() && !analyzedDocs().length) {
            <div class="flex flex-col items-center justify-center rounded-[18px] border border-dashed border-slate-200 bg-slate-50 p-10 text-center text-slate-400">
              <mat-icon class="mb-3 !text-5xl text-slate-300">account_tree</mat-icon>
              <p class="font-medium">Los workflows recomendados aparecerán aquí</p>
              <p class="mt-1 text-xs">Describí tu problema, subí tus documentos y hacé clic en "Analizar"</p>
            </div>
          }

          @if (loading()) {
            <div class="flex flex-col items-center justify-center rounded-[18px] border border-slate-200 bg-white p-10">
              <mat-spinner [diameter]="40" />
              <p class="mt-4 text-sm text-slate-500">Leyendo documentos y analizando con TensorFlow…</p>
            </div>
          }

          <!-- Workflows recomendados -->
          @if (matches().length && !loading()) {
            <div class="space-y-3">
              <p class="text-xs font-semibold uppercase tracking-wide text-slate-400">
                Workflows recomendados
              </p>

              @for (m of matches(); track m.workflowId; let i = $index) {
                <div class="rounded-[18px] border bg-white p-5 shadow-sm"
                     [class.border-indigo-300]="i === 0"
                     [class.ring-1]="i === 0"
                     [class.ring-indigo-200]="i === 0"
                     [class.border-slate-200]="i !== 0">

                  <div class="flex items-start justify-between gap-3">
                    <div class="flex items-center gap-2">
                      <span class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                            [class.bg-indigo-600]="i === 0"
                            [class.bg-slate-300]="i !== 0">
                        {{ i + 1 }}
                      </span>
                      <div>
                        <p class="font-semibold text-slate-800">{{ m.workflowName }}</p>
                        @if (m.workflowDescription) {
                          <p class="mt-0.5 text-xs text-slate-500">{{ m.workflowDescription }}</p>
                        }
                        <p class="mt-0.5 text-xs text-slate-400">Similitud: {{ m.cosSim }}%</p>
                      </div>
                    </div>
                    <div class="shrink-0 text-right">
                      <p class="text-2xl font-bold" [ngClass]="scoreColor(m.score)">{{ m.score }}%</p>
                      <span class="rounded-full px-2 py-0.5 text-xs font-semibold"
                            [ngClass]="confidenceCls(m.confidence)">
                        {{ m.confidence }}
                      </span>
                    </div>
                  </div>

                  <!-- Barra de progreso -->
                  <div class="mt-3 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                    <div class="h-2 rounded-full transition-all"
                         [style.width.%]="m.score"
                         [ngClass]="scoreBarColor(m.score)">
                    </div>
                  </div>

                  <!-- Campos obligatorios del primer nodo de proceso -->
                  @if (m.requiredDocs.length) {
                    <div class="mt-4">
                      <p class="mb-2 text-xs font-semibold text-slate-500">
                        Campos obligatorios del primer paso:
                      </p>
                      <div class="flex flex-wrap gap-1.5">
                        @for (doc of m.requiredDocs; track doc) {
                          <span class="flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium border"
                                [ngClass]="m.presentRequired.includes(doc)
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-rose-50 text-rose-700 border-rose-200'">
                            <mat-icon class="!h-3.5 !w-3.5 !text-[13px]">
                              {{ m.presentRequired.includes(doc) ? 'check_circle' : 'cancel' }}
                            </mat-icon>
                            {{ doc }}
                          </span>
                        }
                      </div>
                    </div>
                  }

                  <!-- Campos opcionales -->
                  @if (m.optionalDocs.length) {
                    <div class="mt-2">
                      <p class="mb-2 text-xs font-semibold text-slate-400">Campos opcionales:</p>
                      <div class="flex flex-wrap gap-1.5">
                        @for (doc of m.optionalDocs; track doc) {
                          <span class="flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs"
                                [ngClass]="m.presentOptional.includes(doc)
                                  ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                                  : 'border-slate-200 bg-slate-50 text-slate-400'">
                            <mat-icon class="!h-3.5 !w-3.5 !text-[13px]">description</mat-icon>
                            {{ doc }}
                          </span>
                        }
                      </div>
                    </div>
                  }

                  <!-- Alerta campos faltantes -->
                  @if (m.missingRequired.length) {
                    <div class="mt-3 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
                      <mat-icon class="!text-[18px] shrink-0 mt-0.5 text-amber-500">warning</mat-icon>
                      <div>
                        <p class="font-semibold">Faltan estos campos obligatorios:</p>
                        <ul class="mt-1 list-disc pl-4 space-y-0.5">
                          @for (campo of m.missingRequired; track campo) {
                            <li><strong>{{ campo }}</strong></li>
                          }
                        </ul>
                        <p class="mt-1 text-amber-700">
                          Tenés que completarlos o presentarlos para poder avanzar en el trámite.
                        </p>
                      </div>
                    </div>
                  }

                  @if (m.docsComplete) {
                    <div class="mt-3 flex items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-700">
                      <mat-icon class="!text-[16px]">verified</mat-icon>
                      Tenés todos los campos obligatorios cubiertos. ¡Podés iniciar el trámite!
                    </div>
                  }

                  @if (i === 0) {
                    <button (click)="iniciarTramite(m)"
                      class="mt-4 w-full flex items-center justify-center gap-2 rounded-xl bg-indigo-600 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 transition">
                      <mat-icon class="!text-[18px]">play_arrow</mat-icon>
                      Iniciar trámite con este workflow
                    </button>
                  } @else {
                    <button (click)="iniciarTramite(m)"
                      class="mt-3 w-full flex items-center justify-center gap-2 rounded-xl border border-slate-200 py-2 text-sm text-slate-600 hover:bg-slate-50 transition">
                      Usar este workflow
                    </button>
                  }
                </div>
              }
            </div>
          }
        </div>
      </div>

    </div>
  `
})
export class UsuarioPideComponent implements OnDestroy {
  private recognition: any = null;

  recording    = signal(false);
  loading      = signal(false);
  error        = signal('');
  analyzedDocs = signal<AnalyzedDoc[]>([]);
  matches      = signal<WorkflowMatch[]>([]);

  userText      = '';
  selectedFiles: File[] = [];

  constructor(private http: HttpClient, private router: Router) {}

  // ---------------------------------------------------------------- //
  // Archivos
  // ---------------------------------------------------------------- //
  onFilesSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files) this.addFiles(Array.from(input.files));
  }

  onDragOver(event: DragEvent) {
    event.preventDefault();
    (event.currentTarget as HTMLElement).classList.add('drag-over');
  }

  onDragLeave(event: DragEvent) {
    (event.currentTarget as HTMLElement).classList.remove('drag-over');
  }

  onDrop(event: DragEvent) {
    event.preventDefault();
    (event.currentTarget as HTMLElement).classList.remove('drag-over');
    if (event.dataTransfer?.files)
      this.addFiles(Array.from(event.dataTransfer.files));
  }

  private addFiles(newFiles: File[]) {
    const allowed = newFiles.filter(f =>
      /\.(docx|pdf|txt)$/i.test(f.name) && !this.selectedFiles.find(e => e.name === f.name)
    );
    this.selectedFiles = [...this.selectedFiles, ...allowed];
  }

  removeFile(i: number) {
    this.selectedFiles = this.selectedFiles.filter((_, idx) => idx !== i);
  }

  // ---------------------------------------------------------------- //
  // Análisis
  // ---------------------------------------------------------------- //
  analyze() {
    this.loading.set(true);
    this.error.set('');
    this.analyzedDocs.set([]);
    this.matches.set([]);

    const form = new FormData();
    form.append('text', this.userText.trim());
    for (const f of this.selectedFiles) form.append('files', f, f.name);

    this.http.post<{ documents: AnalyzedDoc[]; matches: WorkflowMatch[] }>(
      `${environment.apiUrl}/workflow-ai/match-with-docs`, form
    ).subscribe({
      next: (res) => {
        this.analyzedDocs.set(res.documents);
        this.matches.set(res.matches);
        this.loading.set(false);
      },
      error: (err) => {
        this.loading.set(false);
        this.error.set(
          err.status === 0
            ? 'No se pudo conectar al servidor. ¿Está corriendo el backend?'
            : `Error ${err.status}: ${err.error?.detail ?? 'Error desconocido'}`
        );
      },
    });
  }

  iniciarTramite(m: WorkflowMatch) {
    this.router.navigate(['/tramites'], { state: { workflowId: m.workflowId } });
  }

  // ---------------------------------------------------------------- //
  // Voz
  // ---------------------------------------------------------------- //
  toggleRecording() { this.recording() ? this.stopRecording() : this.startRecording(); }

  private startRecording() {
    const w  = window as any;
    const SR = w.SpeechRecognition || w.webkitSpeechRecognition;
    if (!SR) { this.error.set('Web Speech API no disponible. Usá Chrome o Edge.'); return; }
    this.recognition = new SR();
    this.recognition.lang = 'es-ES';
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.onresult = (e: any) => {
      let t = '';
      for (let i = e.resultIndex; i < e.results.length; i++) t += e.results[i][0].transcript;
      this.userText = t;
    };
    this.recognition.onerror = (e: any) => { this.error.set(`Error: ${e.error}`); this.recording.set(false); };
    this.recognition.onend  = () => this.recording.set(false);
    this.recognition.start();
    this.recording.set(true);
  }

  private stopRecording() { this.recognition?.stop(); this.recording.set(false); }

  fileIcon() { return 'insert_drive_file'; }

  docTypeLabel(t: string) {
    return t.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  }

  docTypeIcon() { return 'insert_drive_file'; }

  scoreColor(s: number)    { return s >= 70 ? 'text-emerald-600' : s >= 40 ? 'text-amber-500' : 'text-slate-400'; }
  scoreBarColor(s: number) { return s >= 70 ? 'bg-emerald-500'   : s >= 40 ? 'bg-amber-400'   : 'bg-slate-300'; }
  confidenceCls(c: string) {
    if (c === 'Alta')  return 'bg-emerald-100 text-emerald-700';
    if (c === 'Media') return 'bg-amber-100 text-amber-700';
    return 'bg-slate-100 text-slate-500';
  }

  ngOnDestroy() { this.recognition?.stop(); }
}
