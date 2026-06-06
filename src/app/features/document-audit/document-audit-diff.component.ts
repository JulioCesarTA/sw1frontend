import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';

interface SideLine {
  text: string | null;
  lineNo: number | null;
  type: 'added' | 'removed' | 'unchanged' | 'empty';
}

interface SideRow {
  left: SideLine;
  right: SideLine;
}

interface AuditEntry {
  id: string;
  fileName?: string;
  workflowName?: string;
  tramiteId?: string;
  userName?: string;
  userEmail?: string;
  departmentName?: string;
  textBefore?: string;
  textAfter?: string;
  createdAt: string;
}

@Component({
  selector: 'app-document-audit-diff',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="min-h-screen bg-slate-50">

      <!-- Topbar -->
      <div class="sticky top-0 z-10 flex items-center gap-4 border-b border-slate-200 bg-white px-6 py-4 shadow-sm">
        <button
          class="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 transition"
          (click)="goBack()">
          <mat-icon class="!h-4 !w-4 !text-[18px]">arrow_back</mat-icon>
          Volver
        </button>

        @if (entry()) {
          <div class="flex flex-1 flex-wrap items-center gap-5 text-sm">
            <div>
              <span class="text-xs uppercase tracking-wide text-slate-400">Documento</span>
              <div class="font-semibold text-slate-800">{{ entry()!.fileName || 'Sin nombre' }}</div>
            </div>
            <div>
              <span class="text-xs uppercase tracking-wide text-slate-400">Editado por</span>
              <div class="font-medium text-slate-700">
                {{ entry()!.userName || '-' }}
                <span class="ml-1 text-xs text-slate-400">{{ entry()!.userEmail }}</span>
              </div>
            </div>
            <div>
              <span class="text-xs uppercase tracking-wide text-slate-400">Fecha</span>
              <div class="font-medium text-slate-700">{{ entry()!.createdAt | date:'dd/MM/yyyy HH:mm:ss' }}</div>
            </div>
            <div>
              <span class="text-xs uppercase tracking-wide text-slate-400">Workflow</span>
              <div class="font-medium text-slate-700">{{ entry()!.workflowName || '-' }}</div>
            </div>
          </div>

          <!-- Stats -->
          <div class="flex items-center gap-3">
            <span class="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
              <mat-icon class="!h-3.5 !w-3.5 !text-[14px]">add</mat-icon>
              {{ addedCount() }} agregada(s)
            </span>
            <span class="flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
              <mat-icon class="!h-3.5 !w-3.5 !text-[14px]">remove</mat-icon>
              {{ removedCount() }} eliminada(s)
            </span>
          </div>
        }
      </div>

      <div class="mx-auto max-w-[1400px] p-6">

        @if (!entry()) {
          <div class="flex flex-col items-center justify-center py-24 text-slate-400">
            <mat-icon class="mb-3 !text-5xl text-slate-300">find_in_page</mat-icon>
            <p class="text-lg font-medium">No hay datos de comparación.</p>
            <button class="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    (click)="goBack()">Volver</button>
          </div>
        } @else {

          <!-- Vista lado a lado -->
          <div class="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm">
            <!-- Cabeceras -->
            <div class="grid grid-cols-2 border-b border-slate-200">
              <div class="flex items-center gap-2 border-r border-slate-200 bg-rose-50 px-5 py-3">
                <mat-icon class="!h-4 !w-4 !text-[18px] text-rose-500">history</mat-icon>
                <span class="text-sm font-semibold text-rose-700">Antes</span>
              </div>
              <div class="flex items-center gap-2 bg-emerald-50 px-5 py-3">
                <mat-icon class="!h-4 !w-4 !text-[18px] text-emerald-500">check_circle</mat-icon>
                <span class="text-sm font-semibold text-emerald-700">Después</span>
              </div>
            </div>

            <!-- Leyenda -->
            <div class="flex items-center gap-6 border-b border-slate-100 bg-slate-50 px-5 py-2 text-xs text-slate-500">
              <span class="flex items-center gap-1.5">
                <span class="inline-block h-3 w-6 rounded bg-rose-200"></span> Eliminado
              </span>
              <span class="flex items-center gap-1.5">
                <span class="inline-block h-3 w-6 rounded bg-emerald-200"></span> Agregado
              </span>
              <span class="flex items-center gap-1.5">
                <span class="inline-block h-3 w-6 rounded bg-slate-100"></span> Sin cambios
              </span>
            </div>

            <!-- Filas de diff -->
            @if (!sideRows().length) {
              <div class="px-6 py-12 text-center text-slate-400">Sin diferencias detectadas.</div>
            } @else {
              <div class="overflow-auto max-h-[calc(100vh-220px)] font-mono text-sm">
                @for (row of sideRows(); track $index) {
                  <div class="grid grid-cols-2 border-t border-slate-50 leading-6">

                    <!-- Lado izquierdo (Antes) -->
                    <div class="flex items-stretch border-r border-slate-100"
                         [class.bg-rose-50]="row.left.type === 'removed'"
                         [class.bg-slate-50]="row.left.type === 'unchanged'"
                         [class.bg-white]="row.left.type === 'empty'">
                      <!-- Número de línea -->
                      <div class="w-10 shrink-0 select-none border-r px-1 py-1 text-right text-xs text-slate-300"
                           [class.border-rose-100]="row.left.type === 'removed'"
                           [class.border-slate-100]="row.left.type !== 'removed'">
                        {{ row.left.lineNo ?? '' }}
                      </div>
                      <!-- Indicador -->
                      <div class="flex w-6 shrink-0 items-center justify-center text-sm font-bold select-none"
                           [class.text-rose-400]="row.left.type === 'removed'"
                           [class.text-slate-200]="row.left.type !== 'removed'">
                        {{ row.left.type === 'removed' ? '−' : '' }}
                      </div>
                      <!-- Texto -->
                      <div class="flex-1 py-1 pr-4 whitespace-pre-wrap break-words"
                           [class.text-rose-900]="row.left.type === 'removed'"
                           [class.text-slate-400]="row.left.type === 'unchanged'"
                           [class.text-transparent]="row.left.type === 'empty'">
                        {{ row.left.text ?? ' ' }}
                      </div>
                    </div>

                    <!-- Lado derecho (Después) -->
                    <div class="flex items-stretch"
                         [class.bg-emerald-50]="row.right.type === 'added'"
                         [class.bg-slate-50]="row.right.type === 'unchanged'"
                         [class.bg-white]="row.right.type === 'empty'">
                      <!-- Número de línea -->
                      <div class="w-10 shrink-0 select-none border-r px-1 py-1 text-right text-xs text-slate-300"
                           [class.border-emerald-100]="row.right.type === 'added'"
                           [class.border-slate-100]="row.right.type !== 'added'">
                        {{ row.right.lineNo ?? '' }}
                      </div>
                      <!-- Indicador -->
                      <div class="flex w-6 shrink-0 items-center justify-center text-sm font-bold select-none"
                           [class.text-emerald-500]="row.right.type === 'added'"
                           [class.text-slate-200]="row.right.type !== 'added'">
                        {{ row.right.type === 'added' ? '+' : '' }}
                      </div>
                      <!-- Texto -->
                      <div class="flex-1 py-1 pr-4 whitespace-pre-wrap break-words"
                           [class.text-emerald-900]="row.right.type === 'added'"
                           [class.text-slate-400]="row.right.type === 'unchanged'"
                           [class.text-transparent]="row.right.type === 'empty'">
                        {{ row.right.text ?? ' ' }}
                      </div>
                    </div>

                  </div>
                }
              </div>
            }
          </div>
        }
      </div>
    </div>
  `
})
export class DocumentAuditDiffComponent implements OnInit {
  private router = inject(Router);

  entry      = signal<AuditEntry | null>(null);
  sideRows   = signal<SideRow[]>([]);
  addedCount   = signal(0);
  removedCount = signal(0);

  ngOnInit() {
    const state = history.state as { entry?: AuditEntry };
    if (state?.entry) {
      this.entry.set(state.entry);
      this.computeDiff(state.entry.textBefore ?? '', state.entry.textAfter ?? '');
    }
  }

  goBack() {
    this.router.navigate(['/document-audit']);
  }

  private computeDiff(before: string, after: string) {
    const a = before.split('\n').slice(0, 500);
    const b = after.split('\n').slice(0, 500);
    const m = a.length;
    const n = b.length;

    // LCS DP table
    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }

    // Backtrack → produce flat diff tokens
    type Token = { text: string; type: 'added' | 'removed' | 'unchanged' };
    const tokens: Token[] = [];
    let i = m, j = n;
    while (i > 0 || j > 0) {
      if (i > 0 && j > 0 && a[i - 1] === b[j - 1]) {
        tokens.unshift({ text: a[i - 1], type: 'unchanged' });
        i--; j--;
      } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
        tokens.unshift({ text: b[j - 1], type: 'added' });
        j--;
      } else {
        tokens.unshift({ text: a[i - 1], type: 'removed' });
        i--;
      }
    }

    // Build side-by-side rows: pair consecutive removed+added as modified lines
    const rows: SideRow[] = [];
    let leftLineNo  = 1;
    let rightLineNo = 1;
    let k = 0;

    while (k < tokens.length) {
      const tk = tokens[k];

      if (tk.type === 'unchanged') {
        rows.push({
          left:  { text: tk.text, lineNo: leftLineNo++,  type: 'unchanged' },
          right: { text: tk.text, lineNo: rightLineNo++, type: 'unchanged' },
        });
        k++;

      } else {
        // Collect consecutive removed and added blocks
        const removed: string[] = [];
        const added: string[]   = [];

        while (k < tokens.length && tokens[k].type === 'removed') { removed.push(tokens[k++].text); }
        while (k < tokens.length && tokens[k].type === 'added')   { added.push(tokens[k++].text); }

        const maxLen = Math.max(removed.length, added.length);
        for (let r = 0; r < maxLen; r++) {
          const hasLeft  = r < removed.length;
          const hasRight = r < added.length;
          rows.push({
            left:  hasLeft  ? { text: removed[r], lineNo: leftLineNo++,  type: 'removed' }
                            : { text: null,        lineNo: null,          type: 'empty' },
            right: hasRight ? { text: added[r],   lineNo: rightLineNo++, type: 'added' }
                            : { text: null,        lineNo: null,          type: 'empty' },
          });
        }
      }
    }

    this.sideRows.set(rows);
    this.addedCount.set(tokens.filter(t => t.type === 'added').length);
    this.removedCount.set(tokens.filter(t => t.type === 'removed').length);
  }
}
