import { Component, signal, inject, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { HttpClient } from '@angular/common/http';
import { MatTabsModule } from '@angular/material/tabs';
import { MatCardModule } from '@angular/material/card';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatSelectModule } from '@angular/material/select';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatChipsModule } from '@angular/material/chips';
import { MatDividerModule } from '@angular/material/divider';
import { MatTooltipModule } from '@angular/material/tooltip';

const TF_API = 'http://localhost:8001';
const API    = '/api';

@Component({
  selector: 'app-motor-ia',
  standalone: true,
  imports: [
    CommonModule, FormsModule,
    MatTabsModule, MatCardModule, MatButtonModule, MatIconModule,
    MatSelectModule, MatFormFieldModule, MatInputModule,
    MatProgressSpinnerModule, MatChipsModule, MatDividerModule,
    MatTooltipModule,
  ],
  template: `
<div class="p-6 max-w-5xl mx-auto">

  <div class="mb-6">
    <h1 class="text-2xl font-bold text-slate-800 flex items-center gap-2">
      <mat-icon class="text-indigo-600">psychology</mat-icon>
      Motor Inteligente IA
    </h1>
    <p class="text-slate-500 mt-1">Modelos de Deep Learning entrenados con datos reales de la BD</p>
  </div>

  <mat-tab-group animationDuration="200ms" class="bg-white rounded-2xl shadow">

    <!-- ═══════════════════════════════════════════════════════════
         TAB 1 — OPTIMIZADOR DE WORKFLOW
    ═══════════════════════════════════════════════════════════ -->
    <mat-tab>
      <ng-template mat-tab-label>
        <mat-icon class="mr-2 text-green-500">auto_fix_high</mat-icon>
        Optimizador de Workflow
      </ng-template>

      <div class="p-6 space-y-4">
        <p class="text-slate-500 text-sm">
          Analiza el historial real de un workflow y recomienda cómo modificar sus nodos
          (agregar bifurcaciones, uniones, eliminar cuellos de botella) para reducir tiempos.
        </p>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Seleccioná un workflow</mat-label>
          <mat-select [(ngModel)]="optimizerWorkflowId">
            @for (wf of workflows(); track wf.id) {
              <mat-option [value]="wf.id">{{ wf.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <button mat-flat-button color="primary"
                (click)="runWorkflowOptimizer()"
                [disabled]="loadingOptimizer() || !optimizerWorkflowId">
          @if (loadingOptimizer()) { <mat-spinner diameter="18" class="inline mr-2"></mat-spinner> }
          <mat-icon>play_arrow</mat-icon> Analizar workflow
        </button>

        @if (optimizerResult()) {
          <!-- Resumen -->
          <div class="grid grid-cols-4 gap-3">
            <div class="rounded-xl border bg-white p-4 text-center">
              <p class="text-3xl font-black text-slate-800">{{ optimizerResult().summary.totalTramites }}</p>
              <p class="text-xs text-slate-500">Trámites analizados</p>
            </div>
            <div class="rounded-xl border bg-white p-4 text-center">
              <p class="text-3xl font-black text-green-600">{{ optimizerResult().summary.completados }}</p>
              <p class="text-xs text-slate-500">Completados</p>
            </div>
            <div class="rounded-xl border bg-white p-4 text-center">
              <p class="text-3xl font-black text-red-500">{{ optimizerResult().summary.rechazados }}</p>
              <p class="text-xs text-slate-500">Rechazados</p>
            </div>
            <div class="rounded-xl border bg-white p-4 text-center">
              <p class="text-3xl font-black text-indigo-600">{{ optimizerResult().summary.tiempoPromedioH }}h</p>
              <p class="text-xs text-slate-500">Tiempo promedio</p>
            </div>
          </div>

          <!-- Nodos -->
          <div>
            <p class="font-semibold text-slate-700 mb-2">Estado de nodos (ordenados por demora):</p>
            <div class="space-y-2">
              @for (n of optimizerResult().nodeStats; track n.nodoId) {
                <div class="flex items-center gap-3 rounded-lg border p-3 bg-white">
                  <div class="w-3 h-3 rounded-full flex-shrink-0"
                       [class]="n.severity === 'CRITICO' ? 'bg-red-500' :
                                n.severity === 'ALTO'    ? 'bg-orange-400' :
                                n.severity === 'MEDIO'   ? 'bg-yellow-400' : 'bg-green-400'">
                  </div>
                  <div class="flex-1">
                    <span class="font-medium">{{ n.nodoName }}</span>
                    <span class="ml-2 text-xs text-slate-400">{{ n.nodeType }}</span>
                  </div>
                  <div class="text-right text-sm">
                    <span class="font-bold"
                          [class]="n.severity === 'CRITICO' ? 'text-red-600' :
                                   n.severity === 'ALTO'    ? 'text-orange-500' : 'text-slate-700'">
                      {{ n.avgMinutesReal }}min
                    </span>
                    <span class="text-slate-400"> / {{ n.avgMinutesExpected }}min esp.</span>
                    @if (n.overRatio > 1) {
                      <span class="ml-1 text-xs font-bold"
                            [class]="n.severity !== 'NORMAL' ? 'text-orange-500' : 'text-slate-400'">
                        (x{{ n.overRatio }})
                      </span>
                    }
                  </div>
                  <div class="text-right text-xs text-slate-400 w-20">{{ n.visits }} visitas</div>
                </div>
              }
            </div>
          </div>

          <!-- Recomendaciones -->
          @if (optimizerResult().recommendations?.length) {
            <div>
              <p class="font-semibold text-slate-700 mb-2">Recomendaciones:</p>
              <div class="space-y-3">
                @for (r of optimizerResult().recommendations; track r.tipo) {
                  <div class="rounded-xl border p-4 space-y-2"
                       [class]="r.prioridad === 'ALTA'  ? 'border-red-200 bg-red-50' :
                                r.prioridad === 'MEDIA' ? 'border-orange-200 bg-orange-50' :
                                                          'border-slate-200 bg-slate-50'">
                    <div class="flex items-center gap-2 flex-wrap">
                      <span class="rounded-full px-2 py-0.5 text-xs font-bold text-white"
                            [class]="r.prioridad === 'ALTA' ? 'bg-red-600' :
                                     r.prioridad === 'MEDIA' ? 'bg-orange-500' : 'bg-slate-400'">
                        {{ r.prioridad }}
                      </span>
                      <span class="rounded-full px-2 py-0.5 text-xs bg-white border font-mono">{{ r.tipo }}</span>
                      <span class="font-semibold">{{ r.nodoAfectado }}</span>
                      @if (r.tiempoAhorradoEstimadoH) {
                        <span class="ml-auto text-green-700 text-sm font-bold">
                          -{{ r.tiempoAhorradoEstimadoH }}h estimadas
                        </span>
                      }
                    </div>
                    <p class="text-sm text-slate-700">{{ r.explicacion }}</p>
                    <div class="rounded-lg bg-white border p-3 text-sm">
                      <span class="font-semibold text-indigo-700">Acción: </span>{{ r.accion }}
                    </div>
                  </div>
                }
              </div>
            </div>
          } @else {
            <div class="rounded-xl border border-green-200 bg-green-50 p-4 flex items-center gap-3">
              <mat-icon class="text-green-600">check_circle</mat-icon>
              <p class="text-green-800">
                El workflow está operando dentro de los parámetros normales. No hay recomendaciones por ahora.
              </p>
            </div>
          }
        }
      </div>
    </mat-tab>

    <!-- ═══════════════════════════════════════════════════════════
         TAB 2 — PREDICCIÓN DE DEMORA
    ═══════════════════════════════════════════════════════════ -->
    <mat-tab>
      <ng-template mat-tab-label>
        <mat-icon class="mr-2 text-blue-500">schedule</mat-icon>
        Predicción de Demora
      </ng-template>

      <div class="p-6 space-y-4">
        <div class="rounded-xl bg-blue-50 border border-blue-100 p-4 text-sm text-blue-800">
          <strong>¿Qué hace este modelo?</strong> Predice, <em>antes de crear un trámite</em>,
          la probabilidad de que supere el tiempo esperado del workflow.
          Usa historial de trámites completados + hora y día actuales para la predicción.
        </div>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Seleccioná el workflow a analizar</mat-label>
          <mat-select [(ngModel)]="delayWorkflowId">
            @for (wf of workflows(); track wf.id) {
              <mat-option [value]="wf.id">{{ wf.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <button mat-flat-button color="primary"
                (click)="runDelayPredictor()"
                [disabled]="loadingDelay() || !delayWorkflowId">
          @if (loadingDelay()) { <mat-spinner diameter="18" class="inline mr-2"></mat-spinner> }
          <mat-icon>play_arrow</mat-icon> Predecir demora
        </button>

        @if (delayResult()) {
          <!-- Probabilidad grande -->
          <div class="rounded-2xl border p-6 space-y-4"
               [class]="delayResult().riskLevel === 'ALTO'  ? 'border-red-200 bg-red-50' :
                        delayResult().riskLevel === 'MEDIO' ? 'border-yellow-200 bg-yellow-50' :
                                                              'border-green-200 bg-green-50'">
            <div class="flex items-center gap-4">
              <mat-icon class="text-4xl"
                        [class]="delayResult().riskLevel === 'ALTO'  ? 'text-red-500' :
                                 delayResult().riskLevel === 'MEDIO' ? 'text-yellow-600' : 'text-green-600'">
                {{ delayResult().riskLevel === 'ALTO' ? 'running_with_errors' :
                   delayResult().riskLevel === 'MEDIO' ? 'schedule' : 'check_circle' }}
              </mat-icon>
              <div>
                <p class="text-5xl font-black"
                   [class]="delayResult().riskLevel === 'ALTO'  ? 'text-red-600' :
                            delayResult().riskLevel === 'MEDIO' ? 'text-yellow-700' : 'text-green-700'">
                  {{ (delayResult().delayProbability * 100).toFixed(0) }}%
                </p>
                <p class="text-sm font-semibold text-slate-600">
                  Probabilidad de demora —
                  <span [class]="delayResult().riskLevel === 'ALTO'  ? 'text-red-600' :
                                 delayResult().riskLevel === 'MEDIO' ? 'text-yellow-700' : 'text-green-700'">
                    Riesgo {{ delayResult().riskLevel }}
                  </span>
                </p>
              </div>
            </div>

            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div class="rounded-xl bg-white border p-3 text-center">
                <p class="text-slate-400 text-xs">Tiempo esperado</p>
                <p class="text-xl font-bold text-slate-800">{{ delayResult().totalExpectedHours }}h</p>
              </div>
              <div class="rounded-xl bg-white border p-3 text-center">
                <p class="text-slate-400 text-xs">Demora extra est.</p>
                <p class="text-xl font-bold"
                   [class]="delayResult().extraHoursEstimated > 0 ? 'text-red-600' : 'text-green-600'">
                  +{{ delayResult().extraHoursEstimated }}h
                </p>
              </div>
              <div class="rounded-xl bg-white border p-3 text-center">
                <p class="text-slate-400 text-xs">Tasa histórica</p>
                <p class="text-xl font-bold text-slate-800">
                  {{ (delayResult().historicalDelayRate * 100).toFixed(0) }}%
                </p>
              </div>
              <div class="rounded-xl bg-white border p-3 text-center">
                <p class="text-slate-400 text-xs">Nodos</p>
                <p class="text-xl font-bold text-slate-800">{{ delayResult().numNodos }}</p>
              </div>
            </div>

            <div class="rounded-lg bg-white/70 border px-4 py-2 text-xs text-slate-500 flex gap-4">
              <span>📅 {{ delayResult().context?.dayName }}</span>
              <span>🕐 {{ delayResult().context?.hour }}:00 hs</span>
            </div>
          </div>
        }
      </div>
    </mat-tab>

    <!-- ═══════════════════════════════════════════════════════════
         TAB 3 — PREDICCIÓN DE CUELLO DE BOTELLA
    ═══════════════════════════════════════════════════════════ -->
    <mat-tab>
      <ng-template mat-tab-label>
        <mat-icon class="mr-2 text-orange-500">hourglass_top</mat-icon>
        Cuello de Botella
      </ng-template>

      <div class="p-6 space-y-4">
        <div class="rounded-xl bg-orange-50 border border-orange-100 p-4 text-sm text-orange-800">
          <strong>¿Qué hace este modelo?</strong> Para cada nodo del workflow analiza su historial
          y predice cuál tiene mayor probabilidad de convertirse en cuello de botella en el próximo trámite.
        </div>

        <mat-form-field appearance="outline" class="w-full">
          <mat-label>Seleccioná el workflow a analizar</mat-label>
          <mat-select [(ngModel)]="bottleneckWorkflowId">
            @for (wf of workflows(); track wf.id) {
              <mat-option [value]="wf.id">{{ wf.name }}</mat-option>
            }
          </mat-select>
        </mat-form-field>

        <button mat-flat-button color="primary"
                (click)="runBottleneckPredictor()"
                [disabled]="loadingBottleneck() || !bottleneckWorkflowId">
          @if (loadingBottleneck()) { <mat-spinner diameter="18" class="inline mr-2"></mat-spinner> }
          <mat-icon>play_arrow</mat-icon> Analizar nodos
        </button>

        @if (bottleneckResult()) {
          <!-- Alerta del top bottleneck -->
          @if (bottleneckResult().topBottleneck) {
            <div class="rounded-xl border border-orange-300 bg-orange-50 p-4 flex items-start gap-3">
              <mat-icon class="text-orange-500 mt-0.5">warning</mat-icon>
              <p class="text-orange-900 text-sm">{{ bottleneckResult().summary }}</p>
            </div>
          }

          <!-- Lista de nodos -->
          <div>
            <p class="font-semibold text-slate-700 mb-3">Nodos ordenados por probabilidad de cuello de botella:</p>
            <div class="space-y-3">
              @for (n of bottleneckResult().nodes; track n.nodoId) {
                <div class="rounded-xl border p-4 bg-white space-y-2"
                     [class]="n.riskLevel === 'CRITICO' ? 'border-red-300' :
                              n.riskLevel === 'ALTO'    ? 'border-orange-300' :
                              n.riskLevel === 'MEDIO'   ? 'border-yellow-300' : 'border-slate-200'">
                  <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2">
                      <span class="rounded-full px-2 py-0.5 text-xs font-bold text-white"
                            [class]="n.riskLevel === 'CRITICO' ? 'bg-red-600' :
                                     n.riskLevel === 'ALTO'    ? 'bg-orange-500' :
                                     n.riskLevel === 'MEDIO'   ? 'bg-yellow-500' : 'bg-slate-400'">
                        {{ n.riskLevel }}
                      </span>
                      <span class="font-semibold text-slate-800">{{ n.nodoName }}</span>
                    </div>
                    <div class="text-right text-sm text-slate-500">
                      <span class="font-bold text-slate-800">{{ (n.bottleneckProb * 100).toFixed(0) }}%</span>
                      probabilidad
                    </div>
                  </div>

                  <!-- Barra de probabilidad -->
                  <div class="h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div class="h-full rounded-full transition-all"
                         [class]="n.riskLevel === 'CRITICO' ? 'bg-red-500' :
                                  n.riskLevel === 'ALTO'    ? 'bg-orange-400' :
                                  n.riskLevel === 'MEDIO'   ? 'bg-yellow-400' : 'bg-slate-300'"
                         [style.width.%]="n.bottleneckProb * 100">
                    </div>
                  </div>

                  <div class="flex gap-4 text-xs text-slate-500">
                    <span>⏱ Promedio esperado: <strong>{{ n.avgMinutes }}min</strong></span>
                    <span>📊 Overtime histórico: <strong class="text-orange-600">x{{ n.historicalOvertime }}</strong></span>
                    <span>🔁 Visitas: <strong>{{ n.visits }}</strong></span>
                  </div>
                </div>
              }
            </div>
          </div>
        }
      </div>
    </mat-tab>

    <!-- ═══════════════════════════════════════════════════════════
         TAB 4 — RANKING DE PRIORIDAD
    ═══════════════════════════════════════════════════════════ -->
    <mat-tab>
      <ng-template mat-tab-label>
        <mat-icon class="mr-2 text-purple-500">format_list_numbered</mat-icon>
        Ranking de Prioridad
      </ng-template>

      <div class="p-6 space-y-4">
        <div class="rounded-xl bg-purple-50 border border-purple-100 p-4 text-sm text-purple-800">
          <strong>¿Qué hace este modelo?</strong>
          Carga todos los trámites activos y los rankea por urgencia usando el
          <em>promedio en minutos de cada nodo</em> como SLA esperado.
          <br>
          <code class="bg-purple-100 px-1 rounded text-xs">
            ratio = horas_transcurridas / horas_esperadas_del_workflow
          </code>
          →
          <span class="font-bold text-red-700">CRITICAL</span> ≥ 1.5 ·
          <span class="font-bold text-orange-600">HIGH</span> ≥ 1.0 ·
          <span class="font-bold text-yellow-700">MEDIUM</span> ≥ 0.5 ·
          <span class="font-bold text-green-700">LOW</span> &lt; 0.5
        </div>

        <button mat-flat-button color="primary"
                (click)="loadPriority()"
                [disabled]="loadingPriority()">
          @if (loadingPriority()) { <mat-spinner diameter="18" class="inline mr-2"></mat-spinner> }
          <mat-icon>refresh</mat-icon> Cargar y rankear trámites activos
        </button>

        @if (priorityResult().length) {
          <p class="text-sm text-slate-500">{{ priorityResult().length }} trámites activos — mayor ratio = más urgente</p>

          <div class="space-y-2">
            @for (t of priorityResult(); track t.id) {
              <div class="flex items-center gap-4 rounded-xl border p-4 bg-white"
                   [class]="t.urgencyLevel === 'CRITICAL' ? 'border-red-300 bg-red-50' :
                            t.urgencyLevel === 'HIGH'     ? 'border-orange-300 bg-orange-50' :
                            t.urgencyLevel === 'MEDIUM'   ? 'border-yellow-300 bg-yellow-50' :
                                                            'border-slate-200'">

                <!-- Rank -->
                <div class="text-2xl font-black w-10 text-center flex-shrink-0"
                     [class]="t.urgencyLevel === 'CRITICAL' ? 'text-red-600' :
                              t.urgencyLevel === 'HIGH'     ? 'text-orange-500' :
                              t.urgencyLevel === 'MEDIUM'   ? 'text-yellow-600' : 'text-slate-400'">
                  #{{ t.rank }}
                </div>

                <!-- Info -->
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-bold text-slate-800">{{ t.code }}</span>
                    <span class="rounded-full px-2 py-0.5 text-xs font-bold text-white"
                          [class]="t.urgencyLevel === 'CRITICAL' ? 'bg-red-600' :
                                   t.urgencyLevel === 'HIGH'     ? 'bg-orange-500' :
                                   t.urgencyLevel === 'MEDIUM'   ? 'bg-yellow-500' : 'bg-slate-400'">
                      {{ t.urgencyLevel }}
                    </span>
                    <span class="text-xs text-slate-400 border rounded-full px-2 py-0.5">{{ t.status }}</span>
                  </div>
                  <p class="text-xs text-slate-500 truncate">{{ t.workflowName }}</p>
                  @if (t.title) {
                    <p class="text-xs text-slate-400 truncate">{{ t.title }}</p>
                  }
                </div>

                <!-- Tiempo -->
                <div class="text-right text-sm flex-shrink-0">
                  <div class="font-bold text-slate-700">{{ t.elapsedHours }}h</div>
                  <div class="text-xs text-slate-400">/ {{ t.expectedHours }}h esp.</div>
                  <div class="text-xs font-bold mt-0.5"
                       [class]="t.ratio >= 1.5 ? 'text-red-600' :
                                t.ratio >= 1.0 ? 'text-orange-500' :
                                t.ratio >= 0.5 ? 'text-yellow-600' : 'text-green-600'">
                    ratio {{ t.ratio }}
                  </div>
                </div>
              </div>
            }
          </div>
        } @else if (!loadingPriority()) {
          <div class="rounded-xl border border-dashed border-slate-300 p-8 text-center text-slate-400">
            <mat-icon class="text-4xl">inbox</mat-icon>
            <p class="mt-2">Presioná el botón para cargar los trámites activos</p>
          </div>
        }
      </div>
    </mat-tab>

  </mat-tab-group>
</div>
  `,
})
export class MotorIaComponent implements OnInit {
  private http = inject(HttpClient);

  workflows = signal<any[]>([]);

  // Tab 1 — Optimizador de Workflow
  optimizerWorkflowId = '';
  optimizerResult     = signal<any>(null);
  loadingOptimizer    = signal(false);

  // Tab 2 — Predicción de Demora
  delayWorkflowId = '';
  delayResult     = signal<any>(null);
  loadingDelay    = signal(false);

  // Tab 3 — Cuello de Botella
  bottleneckWorkflowId = '';
  bottleneckResult     = signal<any>(null);
  loadingBottleneck    = signal(false);

  // Tab 4 — Ranking de Prioridad
  priorityResult  = signal<any[]>([]);
  loadingPriority = signal(false);

  ngOnInit() {
    this.http.get<any[]>(`${API}/workflows`).subscribe({
      next: wfs => this.workflows.set(wfs),
      error: () => {},
    });
  }

  // ── Tab 1 ────────────────────────────────────────────────────────────────
  runWorkflowOptimizer() {
    this.loadingOptimizer.set(true);
    this.optimizerResult.set(null);
    this.http.get(`${TF_API}/nlp/optimize-workflow/${this.optimizerWorkflowId}`).subscribe({
      next: (r: any) => { this.optimizerResult.set(r); this.loadingOptimizer.set(false); },
      error: () => this.loadingOptimizer.set(false),
    });
  }

  // ── Tab 2 ────────────────────────────────────────────────────────────────
  runDelayPredictor() {
    this.loadingDelay.set(true);
    this.delayResult.set(null);
    this.http.get(`${TF_API}/nlp/predict-delay/${this.delayWorkflowId}`).subscribe({
      next: (r: any) => { this.delayResult.set(r); this.loadingDelay.set(false); },
      error: () => this.loadingDelay.set(false),
    });
  }

  // ── Tab 3 ────────────────────────────────────────────────────────────────
  runBottleneckPredictor() {
    this.loadingBottleneck.set(true);
    this.bottleneckResult.set(null);
    this.http.get(`${TF_API}/nlp/predict-bottleneck/${this.bottleneckWorkflowId}`).subscribe({
      next: (r: any) => { this.bottleneckResult.set(r); this.loadingBottleneck.set(false); },
      error: () => this.loadingBottleneck.set(false),
    });
  }

  // ── Tab 4 ────────────────────────────────────────────────────────────────
  loadPriority() {
    this.loadingPriority.set(true);
    this.http.get<any>(`${TF_API}/nlp/rank-priority-real`).subscribe({
      next: (r) => { this.priorityResult.set(r.ranked || []); this.loadingPriority.set(false); },
      error: () => this.loadingPriority.set(false),
    });
  }
}
