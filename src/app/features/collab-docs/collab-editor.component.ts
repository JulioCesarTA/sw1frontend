import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import * as Y from 'yjs';
import { Editor } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Collaboration from '@tiptap/extension-collaboration';
import Placeholder from '@tiptap/extension-placeholder';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';

import { AuthService } from '../../core/services/auth.service';
import { CollabDocFull } from '../../core/services/collab-doc.service';
import { environment } from '../../../environments/environment';

interface Peer { userId: string; userName: string; color: string; }

const PEER_COLORS = ['#6366f1','#f59e0b','#10b981','#ef4444','#8b5cf6','#06b6d4','#f97316','#ec4899'];

@Component({
  selector: 'app-collab-editor',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatProgressSpinnerModule],
  styles: [`:host { display: block; height: 100%; }
    .sheet-wrap { height: 100%; overflow: auto; background: #fff; }
    .sheet-table { border-collapse: collapse; font-size: 13px; }
    .s-corner { background:#f1f5f9; border:1px solid #cbd5e1; width:48px; min-width:48px; position:sticky; top:0; left:0; z-index:20; }
    .s-col { background:#f1f5f9; font-weight:600; text-align:center; padding:4px 6px; border:1px solid #cbd5e1; min-width:90px; position:sticky; top:0; z-index:10; user-select:none; font-size:12px; color:#64748b; }
    .s-row { background:#f1f5f9; font-weight:600; text-align:right; padding:4px 8px; border:1px solid #cbd5e1; width:48px; min-width:48px; position:sticky; left:0; z-index:5; user-select:none; font-size:12px; color:#64748b; }
    .s-td { border:1px solid #e2e8f0; padding:0; }
    .s-inp { display:block; width:100%; height:100%; min-height:26px; padding:3px 7px; background:transparent; border:none; outline:none; font-size:13px; font-family:inherit; box-sizing:border-box; }
    .s-inp:focus { background:#eff6ff; box-shadow:inset 0 0 0 2px #3b82f6; }
    .ss-btn { display:inline-flex; align-items:center; gap:4px; padding:4px 10px; border-radius:8px; font-size:13px; font-weight:500; background:transparent; border:1px solid #e2e8f0; cursor:pointer; color:#475569; transition:background .15s,border-color .15s; }
    .ss-btn:hover:not(:disabled) { background:#f1f5f9; border-color:#94a3b8; }
    .ss-btn:disabled { opacity:.35; cursor:default; }
    .ss-btn mat-icon { font-size:16px; height:16px; width:16px; line-height:16px; }
    .ss-sep { width:1px; height:20px; background:#e2e8f0; margin:0 4px; }
  `],
  template: `
    <div class="flex h-screen flex-col bg-slate-50">

      <!-- Topbar -->
      <div class="flex flex-wrap items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 shadow-sm">
        <button (click)="goBack()" class="rounded-xl p-1.5 text-slate-500 transition hover:bg-slate-100 shrink-0">
          <mat-icon>arrow_back</mat-icon>
        </button>

        @if (docCtx()) {
          <div class="flex-1 min-w-0">
            <h1 class="truncate text-base font-bold text-slate-900 leading-tight">{{ docCtx()!.title }}</h1>
            <p class="text-xs text-slate-400">{{ connected() ? 'Conectado' : 'Desconectado' }} · {{ peers().length }} editando</p>
          </div>

          <div class="flex -space-x-2">
            @for (peer of peers(); track peer.userId) {
              <div class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white"
                   [style.background]="peer.color" [title]="peer.userName">
                {{ peer.userName.charAt(0).toUpperCase() }}
              </div>
            }
          </div>

          @if (isSpreadsheet()) {
            <div class="flex items-center gap-2 flex-wrap">
              <button class="ss-btn" (click)="addRow()"><mat-icon>add</mat-icon> Fila</button>
              <button class="ss-btn" (click)="addCol()"><mat-icon>add</mat-icon> Columna</button>
              <span class="ss-sep"></span>
              <button class="ss-btn" [disabled]="!activeCell()" (click)="deleteSelectedRow()"><mat-icon>remove</mat-icon> Fila</button>
              <button class="ss-btn" [disabled]="!activeCell()" (click)="deleteSelectedCol()"><mat-icon>remove</mat-icon> Columna</button>
            </div>
          } @else {
            <div class="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1 flex-wrap">
              <button (click)="fmt('bold')"        [class.bg-indigo-100]="editor?.isActive('bold')"              class="toolbar-btn" title="Negrita"><mat-icon class="!text-[16px]">format_bold</mat-icon></button>
              <button (click)="fmt('italic')"      [class.bg-indigo-100]="editor?.isActive('italic')"            class="toolbar-btn" title="Cursiva"><mat-icon class="!text-[16px]">format_italic</mat-icon></button>
              <div class="mx-1 h-5 w-px bg-slate-200"></div>
              <button (click)="fmt('h1')"          [class.bg-indigo-100]="editor?.isActive('heading',{level:1})" class="toolbar-btn text-xs font-bold">H1</button>
              <button (click)="fmt('h2')"          [class.bg-indigo-100]="editor?.isActive('heading',{level:2})" class="toolbar-btn text-xs font-bold">H2</button>
              <button (click)="fmt('h3')"          [class.bg-indigo-100]="editor?.isActive('heading',{level:3})" class="toolbar-btn text-xs font-bold">H3</button>
              <div class="mx-1 h-5 w-px bg-slate-200"></div>
              <button (click)="fmt('bulletList')"  [class.bg-indigo-100]="editor?.isActive('bulletList')"        class="toolbar-btn" title="Lista"><mat-icon class="!text-[16px]">format_list_bulleted</mat-icon></button>
              <button (click)="fmt('orderedList')" [class.bg-indigo-100]="editor?.isActive('orderedList')"       class="toolbar-btn" title="Lista num."><mat-icon class="!text-[16px]">format_list_numbered</mat-icon></button>
              <button (click)="fmt('blockquote')"  [class.bg-indigo-100]="editor?.isActive('blockquote')"        class="toolbar-btn" title="Cita"><mat-icon class="!text-[16px]">format_quote</mat-icon></button>
              <div class="mx-1 h-5 w-px bg-slate-200"></div>
              <button (click)="fmt('undo')" class="toolbar-btn" title="Deshacer"><mat-icon class="!text-[16px]">undo</mat-icon></button>
              <button (click)="fmt('redo')" class="toolbar-btn" title="Rehacer"><mat-icon class="!text-[16px]">redo</mat-icon></button>
            </div>
          }
        }
      </div>

      <!-- Body -->
      <div class="relative flex-1 overflow-hidden">
        @if (loading()) {
          <div class="absolute inset-0 z-10 flex items-center justify-center bg-slate-50">
            <mat-spinner [diameter]="36" />
          </div>
        }

        @if (isSpreadsheet()) {
          <div class="sheet-wrap">
            <table class="sheet-table">
              <thead>
                <tr>
                  <th class="s-corner"></th>
                  @for (letter of colLetters(); track letter) {
                    <th class="s-col">{{ letter }}</th>
                  }
                </tr>
              </thead>
              <tbody>
                @for (row of gridData(); track ri; let ri = $index) {
                  <tr>
                    <td class="s-row">{{ ri + 1 }}</td>
                    @for (cell of row; track ci; let ci = $index) {
                      <td class="s-td">
                        <input
                          class="s-inp"
                          [value]="cell"
                          (focus)="activeCell.set({row: ri, col: ci})"
                          (blur)="commitCell(ri, ci, $any($event.target).value)"
                          (keydown.enter)="$event.preventDefault(); moveFocus(ri + 1, ci)"
                          (keydown.tab)="$event.preventDefault(); moveFocus(ri, ci + 1)"
                          (keydown.arrowDown)="$event.preventDefault(); moveFocus(ri + 1, ci)"
                          (keydown.arrowUp)="$event.preventDefault(); moveFocus(ri - 1, ci)"
                          [attr.id]="cellId(ri, ci)" />
                      </td>
                    }
                  </tr>
                }
              </tbody>
            </table>
          </div>
        }

        <!-- TipTap – siempre en DOM; oculto para xlsx -->
        <div class="mx-auto max-w-4xl" [style.display]="isSpreadsheet() ? 'none' : 'block'">
          <div #editorRef class="tiptap-editor min-h-[calc(100vh-80px)] bg-white shadow-sm ring-1 ring-slate-100 mt-6 mx-4 mb-10 rounded-2xl overflow-hidden"></div>
        </div>
      </div>
    </div>
  `,
})
export class CollabEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('editorRef') editorRef!: ElementRef<HTMLDivElement>;

  private route = inject(ActivatedRoute);
  private auth  = inject(AuthService);

  docCtx    = signal<CollabDocFull | null>(null);
  loading   = signal(true);
  connected = signal(false);
  peers     = signal<Peer[]>([]);

  isSpreadsheet = signal(false);
  gridData      = signal<string[][]>([]);
  activeCell    = signal<{ row: number; col: number } | null>(null);
  colLetters    = computed(() => {
    const cols = this.gridData()[0]?.length ?? 0;
    return Array.from({ length: cols }, (_, i) => this.toColLetter(i));
  });

  editor: Editor | null = null;
  private ydoc!: Y.Doc;
  private stomp!: Client;
  private roomId!: string;
  private myUserId!: string;
  private myUserName!: string;
  private myColor!: string;
  private saveTimer: any;
  private gridSaveTimer: any;
  private dirty     = false;
  private gridDirty = false;
  // Para xlsx: grid del nav state, aplicar inmediatamente
  private pendingGrid: string[][] | null = null;
  // Para docx: html del nav state, aplicar SOLO si no llega peer_state (primer usuario)
  private initHtmlPending: string | null = null;
  private initHtmlTimer: any = null;
  private peerStateApplied  = false;

  ngOnInit() {
    this.roomId      = this.route.snapshot.paramMap.get('id')!;
    const user       = this.auth.user();
    this.myUserId    = user?.id    ?? 'anon';
    this.myUserName  = user?.name  ?? 'Anónimo';
    this.myColor     = PEER_COLORS[Math.abs(this.myUserId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % PEER_COLORS.length];

    // Cargar contexto: navigation state → sessionStorage
    const navDoc: CollabDocFull | undefined = window.history.state?.doc;
    const ctx: CollabDocFull | null = navDoc ?? this.loadFromSession();
    if (ctx) {
      this.initFromDoc(ctx);
    } else {
      this.loading.set(false);
    }
  }

  private loadFromSession(): CollabDocFull | null {
    try {
      const raw = sessionStorage.getItem(`collab_${this.roomId}`);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  private initFromDoc(doc: CollabDocFull) {
    this.docCtx.set(doc);
    const name = (doc.fileStoredName || doc.title || '').toLowerCase();
    this.isSpreadsheet.set(name.endsWith('.xlsx') || name.endsWith('.xls'));

    if (this.isSpreadsheet() && doc.ydocState?.startsWith('[[')) {
      // xlsx: el grid completo se aplica siempre (no usa Yjs)
      try { this.pendingGrid = this.normalizeGrid(JSON.parse(doc.ydocState)); } catch {}
    } else if (!this.isSpreadsheet() && doc.initialHtml?.trim()) {
      // docx: guardar para usarlo SOLO si somos el primer usuario en la sala
      // (si hay peers, ellos enviarán su estado Yjs via peer_state)
      this.initHtmlPending = doc.initialHtml;
    }

    this.loading.set(false);
    // xlsx: si el editor ya inicializó, aplicar grid ahora
    if (this.pendingGrid && this.isSpreadsheet()) {
      this.gridData.set(this.pendingGrid);
      this.pendingGrid = null;
    }
  }

  ngAfterViewInit() {
    this.ydoc = new Y.Doc();
    this.initEditor();
    this.connectStomp();
    // xlsx: si el doc llegó antes que AfterViewInit
    if (this.pendingGrid) {
      this.gridData.set(this.pendingGrid);
      this.pendingGrid = null;
    }
  }

  // ── Editor ──────────────────────────────────────────────────────────────

  private initEditor() {
    this.editor = new Editor({
      element: this.editorRef.nativeElement,
      extensions: [
        StarterKit.configure({ history: false }),
        Placeholder.configure({ placeholder: 'Empieza a escribir…' }),
        Collaboration.configure({ document: this.ydoc }),
        Table.configure({ resizable: false }),
        TableRow, TableCell, TableHeader,
      ],
    });
  }

  // ── STOMP ────────────────────────────────────────────────────────────────

  private connectStomp() {
    this.stomp = new Client({
      webSocketFactory: () => new SockJS(environment.wsUrl),
      connectHeaders: { Authorization: `Bearer ${localStorage.getItem('accessToken') ?? ''}` },
      reconnectDelay: 3000,
    });

    this.stomp.onConnect = () => {
      this.connected.set(true);

      this.stomp.subscribe(`/topic/collab-docs/${this.roomId}`, (msg) => {
        this.handleMessage(JSON.parse(msg.body));
      });

      const ctx = this.docCtx();
      this.stomp.publish({
        destination: `/app/collab-docs/${this.roomId}/join`,
        body: JSON.stringify({
          userId:        this.myUserId,
          userName:      this.myUserName,
          tramiteId:     ctx?.tramiteId     ?? '',
          storedName:    ctx?.fileStoredName ?? '',
          workflowName:  ctx?.workflowName  ?? '',
          tramiteFolder: ctx?.tramiteFolder  ?? '',
          title:         ctx?.title          ?? '',
        }),
      });

      if (!this.isSpreadsheet()) {
        this.ydoc.on('update', (update: Uint8Array, origin: any) => {
          if (origin === 'remote') return;
          this.stomp.publish({
            destination: `/app/collab-docs/${this.roomId}/update`,
            body: JSON.stringify({ userId: this.myUserId, update: this.toBase64(update) }),
          });
          this.dirty = true;
          this.scheduleSave();
        });

        this.editor?.on('selectionUpdate', ({ editor }) => {
          const { from, to } = editor.state.selection;
          this.stomp.publish({
            destination: `/app/collab-docs/${this.roomId}/presence`,
            body: JSON.stringify({ userId: this.myUserId, userName: this.myUserName, color: this.myColor, from, to }),
          });
        });
      }
    };

    this.stomp.onDisconnect    = () => this.connected.set(false);
    this.stomp.onStompError    = () => this.connected.set(false);
    this.stomp.onWebSocketError = () => this.connected.set(false);
    this.stomp.activate();
  }

  private handleMessage(data: any) {
    switch (data.type) {
      case 'init':
        if (data.targetUserId === this.myUserId) {
          if (data.gridJson) {
            // xlsx: siempre reemplazar con el estado del servidor
            try { this.gridData.set(this.normalizeGrid(JSON.parse(data.gridJson))); } catch {}
          } else {
            // docx: guardar initialHtml y esperar 1 segundo a que llegue peer_state
            // Si nadie responde → somos el primer usuario → aplicar HTML
            const html = data.initialHtml ?? this.initHtmlPending ?? '';
            if (html.trim()) {
              this.initHtmlPending  = html;
              this.peerStateApplied = false;
              clearTimeout(this.initHtmlTimer);
              this.initHtmlTimer = setTimeout(() => {
                if (!this.peerStateApplied && this.initHtmlPending) {
                  this.editor?.commands.setContent(this.initHtmlPending, true);
                  this.initHtmlPending = null;
                }
              }, 1000);
            }
          }
        }
        break;

      case 'peer_joined':
        if (data.joiningUserId !== this.myUserId && this.stomp?.connected) {
          if (this.isSpreadsheet()) {
            this.stomp.publish({
              destination: `/app/collab-docs/${this.roomId}/update`,
              body: JSON.stringify({ userId: this.myUserId, gridJson: JSON.stringify(this.gridData()) }),
            });
          } else {
            const fullState = Y.encodeStateAsUpdate(this.ydoc);
            this.stomp.publish({
              destination: `/app/collab-docs/${this.roomId}/peer-state`,
              body: JSON.stringify({ targetUserId: data.joiningUserId, fromUserId: this.myUserId, update: this.toBase64(fullState) }),
            });
          }
        }
        break;

      case 'peer_state':
        if (data.targetUserId === this.myUserId && data.update && !this.isSpreadsheet()) {
          // Peer ya tiene el doc inicializado → usar su estado Yjs exacto
          // Esto evita el conflicto de dos setContent() independientes
          clearTimeout(this.initHtmlTimer);
          this.peerStateApplied = true;
          this.initHtmlPending  = null;
          Y.applyUpdate(this.ydoc, this.fromBase64(data.update), 'remote');
        }
        break;

      case 'update':
        if (data.userId !== this.myUserId) {
          if (data.gridJson) {
            try { this.gridData.set(this.normalizeGrid(JSON.parse(data.gridJson))); } catch {}
          } else if (data.update) {
            try { Y.applyUpdate(this.ydoc, this.fromBase64(data.update), 'remote'); } catch {}
          }
        }
        break;

      case 'presence':
        if (data.userId !== this.myUserId) {
          this.updatePeer({ userId: data.userId, userName: data.userName, color: data.color });
        }
        break;
    }
  }

  // ── Grid ─────────────────────────────────────────────────────────────────

  cellId(row: number, col: number) { return `cell-${this.roomId}-${row}-${col}`; }

  commitCell(row: number, col: number, value: string) {
    const grid = this.gridData().map(r => [...r]);
    if (grid[row]) { grid[row][col] = value; this.gridData.set(grid); }
    this.gridDirty = true;
    this.scheduleGridSave();
    this.broadcastGrid();
  }

  moveFocus(row: number, col: number) {
    const grid = this.gridData();
    if (row < 0 || col < 0) return;
    if (row >= grid.length) this.addRow();
    if (col >= (grid[0]?.length ?? 0)) this.addCol();
    setTimeout(() => (document.getElementById(this.cellId(row, col)) as HTMLInputElement)?.focus(), 0);
  }

  addRow()    { this.gridData.update(g => [...g, Array(g[0]?.length ?? 10).fill('')]); this.markGridDirty(); }
  addCol()    { this.gridData.update(g => g.map(r => [...r, ''])); this.markGridDirty(); }

  deleteSelectedRow() {
    const ac = this.activeCell();
    if (!ac || this.gridData().length <= 1) return;
    this.gridData.update(g => g.filter((_, i) => i !== ac.row));
    this.activeCell.set(null);
    this.markGridDirty();
    this.broadcastGrid();
  }

  deleteSelectedCol() {
    const ac = this.activeCell();
    if (!ac || (this.gridData()[0]?.length ?? 0) <= 1) return;
    this.gridData.update(g => g.map(r => r.filter((_, i) => i !== ac.col)));
    this.activeCell.set(null);
    this.markGridDirty();
    this.broadcastGrid();
  }

  private markGridDirty() { this.gridDirty = true; this.scheduleGridSave(); }

  private broadcastGrid() {
    if (!this.stomp?.connected) return;
    this.stomp.publish({
      destination: `/app/collab-docs/${this.roomId}/update`,
      body: JSON.stringify({ userId: this.myUserId, gridJson: JSON.stringify(this.gridData()) }),
    });
  }

  private scheduleGridSave() {
    clearTimeout(this.gridSaveTimer);
    this.gridSaveTimer = setTimeout(() => this.persistGridState(), 4000);
  }

  private persistGridState() {
    if (!this.stomp?.connected || !this.gridDirty) return;
    this.gridDirty = false;
    const ctx = this.docCtx();
    if (!ctx) return;
    const gridJson = JSON.stringify(this.gridData());
    this.stomp.publish({
      destination: `/app/collab-docs/${this.roomId}/save-state`,
      body: JSON.stringify({
        gridJson,
        textSnapshot:  this.textFromGrid(this.gridData()),
        userId:        this.myUserId,
        userName:      this.myUserName,
        userEmail:     this.auth.user()?.email ?? '',
        tramiteId:     ctx.tramiteId,
        storedName:    ctx.fileStoredName,
        workflowName:  ctx.workflowName,
        tramiteFolder: ctx.tramiteFolder,
        workflowId:    ctx.workflowId,
        title:         ctx.title,
      }),
    });
  }

  // ── Rich-text ─────────────────────────────────────────────────────────────

  fmt(action: string) {
    if (!this.editor) return;
    const chain = this.editor.chain().focus();
    switch (action) {
      case 'bold':        chain.toggleBold().run(); break;
      case 'italic':      chain.toggleItalic().run(); break;
      case 'h1':          chain.toggleHeading({ level: 1 }).run(); break;
      case 'h2':          chain.toggleHeading({ level: 2 }).run(); break;
      case 'h3':          chain.toggleHeading({ level: 3 }).run(); break;
      case 'bulletList':  chain.toggleBulletList().run(); break;
      case 'orderedList': chain.toggleOrderedList().run(); break;
      case 'blockquote':  chain.toggleBlockquote().run(); break;
      case 'undo':        this.editor.chain().focus().undo().run(); break;
      case 'redo':        this.editor.chain().focus().redo().run(); break;
    }
  }

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persistDocxState(), 5000);
  }

  private persistDocxState() {
    if (!this.stomp?.connected || !this.dirty) return;
    this.dirty = false;
    const ctx = this.docCtx();
    if (!ctx) return;
    const htmlContent = this.editor?.getHTML() ?? '';
    const textSnapshot = this.editor?.getText() ?? '';
    this.stomp.publish({
      destination: `/app/collab-docs/${this.roomId}/save-state`,
      body: JSON.stringify({
        htmlContent,
        textSnapshot,
        userId:        this.myUserId,
        userName:      this.myUserName,
        userEmail:     this.auth.user()?.email ?? '',
        tramiteId:     ctx.tramiteId,
        storedName:    ctx.fileStoredName,
        workflowName:  ctx.workflowName,
        tramiteFolder: ctx.tramiteFolder,
        workflowId:    ctx.workflowId,
        title:         ctx.title,
      }),
    });
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private normalizeGrid(grid: string[][]): string[][] {
    if (!grid.length) return this.emptyGrid();
    const maxCols = Math.max(...grid.map(r => r.length), 1);
    return grid.map(r => { const row = [...r]; while (row.length < maxCols) row.push(''); return row; });
  }

  private emptyGrid(rows = 30, cols = 10): string[][] {
    return Array.from({ length: rows }, () => Array(cols).fill(''));
  }

  private toColLetter(i: number): string {
    let n = i + 1; let r = '';
    while (n > 0) { n--; r = String.fromCharCode(65 + n % 26) + r; n = Math.floor(n / 26); }
    return r;
  }

  private textFromGrid(grid: string[][]): string {
    return grid.map(r => r.filter(c => c?.trim()).join(' ')).filter(Boolean).join('\n');
  }

  private updatePeer(peer: Peer) {
    this.peers.update(list => {
      const idx = list.findIndex(p => p.userId === peer.userId);
      if (idx >= 0) { const u = [...list]; u[idx] = peer; return u; }
      return [...list, peer];
    });
  }

  goBack() {
    if (this.isSpreadsheet()) this.persistGridState();
    else this.persistDocxState();
    window.history.back();
  }

  ngOnDestroy() {
    clearTimeout(this.saveTimer);
    clearTimeout(this.gridSaveTimer);
    clearTimeout(this.initHtmlTimer);
    if (this.isSpreadsheet()) this.persistGridState();
    else this.persistDocxState();
    this.editor?.destroy();
    this.stomp?.deactivate();
  }

  private toBase64(arr: Uint8Array): string { return btoa(String.fromCharCode(...arr)); }
  private fromBase64(b64: string): Uint8Array { return Uint8Array.from(atob(b64), c => c.charCodeAt(0)); }
}
