import { Component, OnDestroy, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { environment } from '../../../environments/environment';

const COLUMN_LABELS: Record<string, string> = {
  tramiteId:      'ID',
  code:           'Código',
  title:          'Título',
  workflowName:   'Workflow',
  departmentName: 'Departamento',
  status:         'Estado',
  userName:       'Usuario',
  createdAt:      'Fecha',
};

interface ReportResult {
  spec: {
    title: string;
    filters: Record<string, string>;
    groupBy: string | null;
    orderBy: string;
    format: string;
    columns: string[];
  };
  data: Record<string, any>[];
  total: number;
}

@Component({
  selector: 'app-report-nlp',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatProgressSpinnerModule],
  styles: [`
    .mic-pulse { animation: pulse 1.2s infinite; }
    @keyframes pulse {
      0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,.4); }
      50%      { box-shadow: 0 0 0 12px rgba(239,68,68,0); }
    }
  `],
  template: `
    <div class="mx-auto max-w-[1200px] space-y-5 p-6">

      <!-- Header -->
      <div>
        <h2 class="m-0 text-2xl font-bold text-slate-800">Reportes</h2>
      
      </div>

      <!-- Input card -->
      <div class="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div class="mb-4 flex gap-3">
          <!-- Mic -->
          <button
            class="flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow transition"
            [class.mic-pulse]="recording()"
            [class.bg-rose-500]="recording()"
            [class.bg-indigo-600]="!recording()"
            (click)="toggleRecording()"
            [title]="recording() ? 'Detener' : 'Dictar'">
            <mat-icon class="!text-[22px] text-white">{{ recording() ? 'stop' : 'mic' }}</mat-icon>
          </button>

          <!-- Textarea -->
          <textarea
            class="flex-1 resize-none rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-indigo-400 focus:bg-white focus:outline-none"
            rows="3"
            placeholder='Ej: "reporte del departamento técnico entre enero y marzo en excel, agrupado por workflow" o "todos los trámites pendientes de este mes en pantalla ordenado por fecha"'
            [(ngModel)]="prompt">
          </textarea>
        </div>

        @if (recording()) {
          <p class="mb-3 flex items-center gap-1.5 text-xs text-rose-500">
            <span class="h-2 w-2 animate-pulse rounded-full bg-rose-500"></span>
            Grabando… hablá ahora
          </p>
        }

        <div class="flex flex-wrap items-center gap-3">
          <button
            class="flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-indigo-700 disabled:opacity-50"
            [disabled]="!prompt.trim() || loading()"
            (click)="generate()">
            @if (loading()) {
              <mat-spinner [diameter]="16" />
            } @else {
              <mat-icon class="!text-[18px]">auto_awesome</mat-icon>
            }
            Generar reporte
          </button>

          @if (result()) {
            <button
              class="flex items-center gap-1 rounded-xl border border-slate-200 px-4 py-2.5 text-sm text-slate-500 transition hover:bg-slate-50"
              (click)="clear()">
              <mat-icon class="!text-[18px]">refresh</mat-icon>
              Nuevo
            </button>
          }
        </div>

        @if (error()) {
          <div class="mt-4 flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <mat-icon class="!text-[18px]">error_outline</mat-icon>
            {{ error() }}
          </div>
        }
      </div>

      <!-- Resultado -->
      @if (result()) {
        <!-- Spec summary -->
        <div class="flex flex-wrap gap-2">
          <span class="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-xs font-medium text-slate-600">
            {{ result()!.total }} resultado(s)
          </span>
          @for (entry of activeFilters(); track entry.key) {
            <span class="rounded-full border border-indigo-200 bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
              {{ entry.key }}: {{ entry.value }}
            </span>
          }
          @if (result()!.spec.groupBy) {
            <span class="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
              Agrupado por {{ colLabel(result()!.spec.groupBy!) }}
            </span>
          }
        </div>

        <!-- Tabla -->
        @if (result()!.data.length) {
          <div class="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <div class="flex items-center border-b border-slate-100 bg-slate-50 px-5 py-3">
              <span class="font-semibold text-slate-700">{{ result()!.spec.title }}</span>
            </div>
            <div class="overflow-x-auto">
              <table class="min-w-full text-sm">
                <thead class="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    @for (col of result()!.spec.columns; track col) {
                      <th class="border-b border-slate-200 px-4 py-3">{{ colLabel(col) }}</th>
                    }
                  </tr>
                </thead>
                <tbody>
                  @for (row of result()!.data; track $index) {
                    @if (isGroupHeader(row)) {
                      <tr class="bg-indigo-50">
                        <td [attr.colspan]="result()!.spec.columns.length"
                            class="px-4 py-2 text-xs font-bold text-indigo-700">
                          {{ row['_groupLabel'] }}
                        </td>
                      </tr>
                    } @else {
                      <tr class="border-t border-slate-100 hover:bg-slate-50">
                        @for (col of result()!.spec.columns; track col) {
                          <td class="px-4 py-2.5 text-slate-700">{{ formatCell(row, col) }}</td>
                        }
                      </tr>
                    }
                  }
                </tbody>
              </table>
            </div>
            <div class="border-t border-slate-100 px-5 py-2 text-right text-xs text-slate-400">
              {{ result()!.total }} registro(s)
            </div>
          </div>
        } @else {
          <div class="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-slate-400">
            <mat-icon class="!h-10 !w-10 !text-4xl">search_off</mat-icon>
            <p class="mt-2">No se encontraron datos para los criterios indicados.</p>
          </div>
        }
      }

    </div>
  `
})
export class ReportNlpComponent implements OnDestroy {
  private recognition: any = null;

  prompt   = '';
  recording = signal(false);
  loading   = signal(false);
  result    = signal<ReportResult | null>(null);
  error     = signal('');

  constructor(private http: HttpClient) {}

  toggleRecording() {
    this.recording() ? this.stopRecording() : this.startRecording();
  }

  private startRecording() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { this.error.set('Tu navegador no soporta dictado. Usá Chrome o Edge.'); return; }
    this.error.set('');
    this.recognition = new SR();
    this.recognition.lang = 'es-ES';
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.onresult = (e: any) => {
      this.prompt = Array.from(e.results).map((r: any) => r[0].transcript).join(' ').trim();
    };
    this.recognition.onerror = () => this.recording.set(false);
    this.recognition.onend   = () => this.recording.set(false);
    this.recognition.start();
    this.recording.set(true);
  }

  private stopRecording() {
    this.recognition?.stop();
    this.recording.set(false);
  }

  generate() {
    if (!this.prompt.trim()) return;
    this.loading.set(true);
    this.error.set('');
    this.result.set(null);

    this.http.post(
      `${environment.apiUrl}/workflow-ai/nlp/report-generate`,
      { prompt: this.prompt.trim() },
      { responseType: 'blob', observe: 'response' }
    ).subscribe({
      next: (response) => {
        this.loading.set(false);
        const contentType = response.headers.get('Content-Type') ?? '';
        const blob = response.body!;

        if (contentType.includes('application/json')) {
          // Pantalla: parsear JSON y mostrar tabla
          blob.text().then(text => {
            const res: ReportResult = JSON.parse(text);
            if (res.spec.groupBy && res.data.length) {
              res.data = this.flattenGroups(res.data, res.spec.groupBy);
            }
            this.result.set(res);
          });
        } else {
          // Word o Excel: descargar automáticamente
          const isWord = contentType.includes('wordprocessingml');
          const ext = isWord ? 'docx' : 'xlsx';
          const url = URL.createObjectURL(blob);
          const a   = document.createElement('a');
          a.href = url; a.download = `reporte.${ext}`; a.click();
          URL.revokeObjectURL(url);
        }
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

  clear() {
    this.result.set(null);
    this.prompt = '';
    this.error.set('');
  }

  colLabel(col: string): string {
    return COLUMN_LABELS[col] ?? col;
  }

  activeFilters() {
    const labelMap: Record<string, string> = {
      departmentName: 'Departamento', workflowName: 'Workflow',
      userName: 'Usuario', status: 'Estado',
      dateFrom: 'Desde', dateTo: 'Hasta',
    };
    return Object.entries(this.result()?.spec.filters ?? {})
      .filter(([, v]) => v)
      .map(([k, v]) => ({ key: labelMap[k] ?? k, value: v }));
  }

  isGroupHeader(row: Record<string, any>): boolean {
    return '_groupLabel' in row;
  }

  formatCell(row: Record<string, any>, col: string): string {
    const val = row[col];
    if (!val) return '—';
    if (col === 'createdAt') return String(val).substring(0, 10);
    return String(val);
  }

  private flattenGroups(rows: Record<string, any>[], groupBy: string): Record<string, any>[] {
    const groups: Record<string, Record<string, any>[]> = {};
    for (const row of rows) {
      const key = String(row[groupBy] ?? 'Sin valor');
      (groups[key] = groups[key] ?? []).push(row);
    }
    const flat: Record<string, any>[] = [];
    for (const [key, groupRows] of Object.entries(groups)) {
      flat.push({ _groupLabel: `${this.colLabel(groupBy)}: ${key} (${groupRows.length})` });
      flat.push(...groupRows);
    }
    return flat;
  }

  ngOnDestroy() { this.recognition?.stop(); }
}
