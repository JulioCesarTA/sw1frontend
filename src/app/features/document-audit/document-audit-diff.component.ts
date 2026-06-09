import { Component, OnInit, inject, signal, computed } from '@angular/core';
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

interface CellDiff {
  value: string;
  type: 'unchanged' | 'changed' | 'added' | 'removed' | 'empty';
}

interface TableRow {
  left:  CellDiff[];
  right: CellDiff[];
  rowNo: number;
  changed: boolean;
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
  styles: [`
    .grid-table { border-collapse: collapse; font-size: 12px; font-family: monospace; }
    .grid-table th, .grid-table td { border: 1px solid #e2e8f0; padding: 3px 10px; white-space: pre-wrap; word-break: break-word; max-width: 180px; min-width: 60px; }
    .grid-table th { background: #f8fafc; color: #64748b; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; text-align: center; }
    .grid-table .row-num { background: #f1f5f9; color: #94a3b8; font-size: 11px; text-align: right; width: 28px; min-width: 28px; }
    .cell-hi-left  { background: #fee2e2 !important; color: #991b1b; font-weight: 600; }
    .cell-hi-right { background: #dcfce7 !important; color: #166534; font-weight: 600; }
  `],
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
            @if (isGrid()) {
              <span class="flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-700">
                <mat-icon class="!h-3.5 !w-3.5 !text-[14px]">edit</mat-icon>
                {{ changedCellCount() }} celda(s) modificada(s)
              </span>
            } @else {
              <span class="flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <mat-icon class="!h-3.5 !w-3.5 !text-[14px]">add</mat-icon>
                {{ addedCount() }} agregada(s)
              </span>
              <span class="flex items-center gap-1.5 rounded-full border border-rose-200 bg-rose-50 px-3 py-1 text-xs font-semibold text-rose-700">
                <mat-icon class="!h-3.5 !w-3.5 !text-[14px]">remove</mat-icon>
                {{ removedCount() }} eliminada(s)
              </span>
            }
          </div>
        }
      </div>

      <div class="mx-auto max-w-[1600px] p-6">

        @if (!entry()) {
          <div class="flex flex-col items-center justify-center py-24 text-slate-400">
            <mat-icon class="mb-3 !text-5xl text-slate-300">find_in_page</mat-icon>
            <p class="text-lg font-medium">No hay datos de comparación.</p>
            <button class="mt-4 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700"
                    (click)="goBack()">Volver</button>
          </div>
        } @else {

          <!-- ═══════════ VISTA TABLA (Excel/TSV) ═══════════ -->
          @if (isGrid()) {
            <div class="overflow-hidden rounded-[18px] border border-slate-200 bg-white shadow-sm">
              <!-- Cabeceras de panel -->
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
                  <span class="inline-block h-3 w-6 rounded bg-rose-200"></span> Celda modificada (antes)
                </span>
                <span class="flex items-center gap-1.5">
                  <span class="inline-block h-3 w-6 rounded bg-emerald-200"></span> Celda modificada (después)
                </span>
              </div>

              <div class="overflow-auto max-h-[calc(100vh-220px)]">
                <div class="flex min-w-fit">

                  <!-- Grilla Antes -->
                  <div class="flex-1 min-w-0 border-r border-slate-200">
                    <table class="grid-table w-full">
                      <thead>
                        <tr>
                          <th class="row-num">#</th>
                          @for (col of colHeaders(); track $index) {
                            <th>{{ col }}</th>
                          }
                        </tr>
                      </thead>
                      <tbody>
                        @for (row of tableRows(); track row.rowNo) {
                          <tr>
                            <td class="row-num">{{ row.rowNo }}</td>
                            @for (i of colIndices(); track i) {
                              <td [class.cell-hi-left]="row.left[i]?.type === 'changed' || row.left[i]?.type === 'removed'">
                                {{ row.left[i]?.value ?? '' }}
                              </td>
                            }
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>

                  <!-- Grilla Después -->
                  <div class="flex-1 min-w-0">
                    <table class="grid-table w-full">
                      <thead>
                        <tr>
                          <th class="row-num">#</th>
                          @for (col of colHeaders(); track $index) {
                            <th>{{ col }}</th>
                          }
                        </tr>
                      </thead>
                      <tbody>
                        @for (row of tableRows(); track row.rowNo) {
                          <tr>
                            <td class="row-num">{{ row.rowNo }}</td>
                            @for (i of colIndices(); track i) {
                              <td [class.cell-hi-right]="row.right[i]?.type === 'changed' || row.right[i]?.type === 'added'">
                                {{ row.right[i]?.value ?? '' }}
                              </td>
                            }
                          </tr>
                        }
                      </tbody>
                    </table>
                  </div>

                </div>
              </div>
            </div>

          } @else {
            <!-- ═══════════ VISTA TEXTO (Word/etc) ═══════════ -->
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

              @if (!sideRows().length) {
                <div class="px-6 py-12 text-center text-slate-400">Sin diferencias detectadas.</div>
              } @else {
                <div class="overflow-auto max-h-[calc(100vh-220px)] font-mono text-sm">
                  @for (row of sideRows(); track $index) {
                    <div class="grid grid-cols-2 border-t border-slate-50 leading-6">

                      <div class="flex items-stretch border-r border-slate-100"
                           [class.bg-rose-50]="row.left.type === 'removed'"
                           [class.bg-slate-50]="row.left.type === 'unchanged'"
                           [class.bg-white]="row.left.type === 'empty'">
                        <div class="w-10 shrink-0 select-none border-r px-1 py-1 text-right text-xs text-slate-300"
                             [class.border-rose-100]="row.left.type === 'removed'"
                             [class.border-slate-100]="row.left.type !== 'removed'">
                          {{ row.left.lineNo ?? '' }}
                        </div>
                        <div class="flex w-6 shrink-0 items-center justify-center text-sm font-bold select-none"
                             [class.text-rose-400]="row.left.type === 'removed'"
                             [class.text-slate-200]="row.left.type !== 'removed'">
                          {{ row.left.type === 'removed' ? '−' : '' }}
                        </div>
                        <div class="flex-1 py-1 pr-4 whitespace-pre-wrap break-words"
                             [class.text-rose-900]="row.left.type === 'removed'"
                             [class.text-slate-400]="row.left.type === 'unchanged'"
                             [class.text-transparent]="row.left.type === 'empty'">
                          {{ row.left.text ?? ' ' }}
                        </div>
                      </div>

                      <div class="flex items-stretch"
                           [class.bg-emerald-50]="row.right.type === 'added'"
                           [class.bg-slate-50]="row.right.type === 'unchanged'"
                           [class.bg-white]="row.right.type === 'empty'">
                        <div class="w-10 shrink-0 select-none border-r px-1 py-1 text-right text-xs text-slate-300"
                             [class.border-emerald-100]="row.right.type === 'added'"
                             [class.border-slate-100]="row.right.type !== 'added'">
                          {{ row.right.lineNo ?? '' }}
                        </div>
                        <div class="flex w-6 shrink-0 items-center justify-center text-sm font-bold select-none"
                             [class.text-emerald-500]="row.right.type === 'added'"
                             [class.text-slate-200]="row.right.type !== 'added'">
                          {{ row.right.type === 'added' ? '+' : '' }}
                        </div>
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
        }
      </div>
    </div>
  `
})
export class DocumentAuditDiffComponent implements OnInit {
  private router = inject(Router);

  entry            = signal<AuditEntry | null>(null);
  sideRows         = signal<SideRow[]>([]);
  tableRows        = signal<TableRow[]>([]);
  colHeaders       = signal<string[]>([]);
  colIndices       = signal<number[]>([]);
  addedCount       = signal(0);
  removedCount     = signal(0);
  changedCellCount = signal(0);

  isGrid = computed(() => {
    const e = this.entry();
    if (!e) return false;
    const name = (e.fileName ?? '').toLowerCase();
    return name.endsWith('.xlsx') || name.endsWith('.xls');
  });

  ngOnInit() {
    const state = history.state as { entry?: AuditEntry };
    if (state?.entry) {
      this.entry.set(state.entry);
      const before = state.entry.textBefore ?? '';
      const after  = state.entry.textAfter  ?? '';
      const name   = (state.entry.fileName ?? '').toLowerCase();
      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        this.computeTableDiff(before, after);
      } else {
        this.computeDiff(before, after);
      }
    }
  }

  goBack() {
    this.router.navigate(['/document-audit']);
  }

  cellCls(type?: string): string {
    switch (type) {
      case 'changed':  return 'cell-changed-left';
      case 'added':    return 'cell-added';
      case 'removed':  return 'cell-removed';
      case 'empty':    return 'cell-empty';
      default:         return '';
    }
  }

  private parseGrid(text: string): string[][] {
    if (!text.trim()) return [];
    return text.split('\n').map(r => r.split('\t'));
  }

  private computeTableDiff(before: string, after: string) {
    const gridA = this.parseGrid(before);
    const gridB = this.parseGrid(after);

    const maxRows = Math.max(gridA.length, gridB.length);
    const maxCols = Math.max(
      ...gridA.map(r => r.length),
      ...gridB.map(r => r.length),
      0
    );

    // Column labels: A, B, C, ...
    const headers: string[] = [];
    for (let c = 0; c < maxCols; c++) {
      headers.push(String.fromCharCode(65 + c));
    }
    this.colHeaders.set(headers);
    this.colIndices.set(headers.map((_, i) => i));

    let changed = 0;
    const rows: TableRow[] = [];

    for (let r = 0; r < maxRows; r++) {
      const rowA = gridA[r] ?? [];
      const rowB = gridB[r] ?? [];
      const leftCells:  CellDiff[] = [];
      const rightCells: CellDiff[] = [];
      let rowChanged = false;

      for (let c = 0; c < maxCols; c++) {
        const va = rowA[c] ?? '';
        const vb = rowB[c] ?? '';

        if (r >= gridA.length) {
          leftCells.push({ value: '', type: 'empty' });
          rightCells.push({ value: vb, type: 'added' });
          if (vb) { changed++; rowChanged = true; }
        } else if (r >= gridB.length) {
          leftCells.push({ value: va, type: 'removed' });
          rightCells.push({ value: '', type: 'empty' });
          if (va) { changed++; rowChanged = true; }
        } else if (va === vb) {
          leftCells.push({ value: va, type: 'unchanged' });
          rightCells.push({ value: vb, type: 'unchanged' });
        } else {
          leftCells.push({ value: va, type: 'changed' });
          rightCells.push({ value: vb, type: 'changed' });
          changed++;
          rowChanged = true;
        }
      }

      rows.push({ left: leftCells, right: rightCells, rowNo: r + 1, changed: rowChanged });
    }

    this.tableRows.set(rows);
    this.changedCellCount.set(changed);
  }

  private computeDiff(before: string, after: string) {
    const a = before.split('\n').slice(0, 500);
    const b = after.split('\n').slice(0, 500);
    const m = a.length;
    const n = b.length;

    const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
    for (let i = 1; i <= m; i++) {
      for (let j = 1; j <= n; j++) {
        dp[i][j] = a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1] + 1
          : Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }

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
