import {
  AfterViewInit,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
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
import { CollabDocService, CollabDocFull } from '../../core/services/collab-doc.service';
import { environment } from '../../../environments/environment';

interface Peer {
  userId: string;
  userName: string;
  color: string;
}

const PEER_COLORS = [
  '#6366f1', '#f59e0b', '#10b981', '#ef4444',
  '#8b5cf6', '#06b6d4', '#f97316', '#ec4899',
];

@Component({
  selector: 'app-collab-editor',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule],
  styles: [`:host { display: block; height: 100%; }`],
  template: `
    <div class="flex h-screen flex-col bg-slate-50">

      <!-- Topbar -->
      <div class="flex items-center gap-3 border-b border-slate-200 bg-white px-6 py-3 shadow-sm">
        <button (click)="goBack()" class="rounded-xl p-1.5 text-slate-500 transition hover:bg-slate-100">
          <mat-icon>arrow_back</mat-icon>
        </button>

        @if (doc()) {
          <div class="flex-1 min-w-0">
            <h1 class="truncate text-lg font-bold text-slate-900">{{ doc()!.title }}</h1>
            <p class="text-xs text-slate-400">
              {{ connected() ? 'Conectado · ' : 'Desconectado · ' }}
              {{ peers().length }} usuario(s) editando
            </p>
          </div>

          <!-- Peer avatars -->
          <div class="flex -space-x-2">
            @for (peer of peers(); track peer.userId) {
              <div
                class="flex h-7 w-7 items-center justify-center rounded-full border-2 border-white text-xs font-bold text-white"
                [style.background]="peer.color"
                [title]="peer.userName">
                {{ peer.userName.charAt(0).toUpperCase() }}
              </div>
            }
          </div>

          <!-- Toolbar -->
          <div class="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-2 py-1">
            <button (click)="fmt('bold')"            [class.bg-indigo-100]="editor?.isActive('bold')"            class="toolbar-btn" title="Negrita"><mat-icon class="!text-[16px]">format_bold</mat-icon></button>
            <button (click)="fmt('italic')"          [class.bg-indigo-100]="editor?.isActive('italic')"          class="toolbar-btn" title="Cursiva"><mat-icon class="!text-[16px]">format_italic</mat-icon></button>
            <div class="mx-1 h-5 w-px bg-slate-200"></div>
            <button (click)="fmt('h1')"              [class.bg-indigo-100]="editor?.isActive('heading',{level:1})" class="toolbar-btn text-xs font-bold">H1</button>
            <button (click)="fmt('h2')"              [class.bg-indigo-100]="editor?.isActive('heading',{level:2})" class="toolbar-btn text-xs font-bold">H2</button>
            <button (click)="fmt('h3')"              [class.bg-indigo-100]="editor?.isActive('heading',{level:3})" class="toolbar-btn text-xs font-bold">H3</button>
            <div class="mx-1 h-5 w-px bg-slate-200"></div>
            <button (click)="fmt('bulletList')"      [class.bg-indigo-100]="editor?.isActive('bulletList')"      class="toolbar-btn" title="Lista"><mat-icon class="!text-[16px]">format_list_bulleted</mat-icon></button>
            <button (click)="fmt('orderedList')"     [class.bg-indigo-100]="editor?.isActive('orderedList')"     class="toolbar-btn" title="Lista numerada"><mat-icon class="!text-[16px]">format_list_numbered</mat-icon></button>
            <button (click)="fmt('blockquote')"      [class.bg-indigo-100]="editor?.isActive('blockquote')"      class="toolbar-btn" title="Cita"><mat-icon class="!text-[16px]">format_quote</mat-icon></button>
            <div class="mx-1 h-5 w-px bg-slate-200"></div>
            <button (click)="fmt('undo')"  class="toolbar-btn" title="Deshacer"><mat-icon class="!text-[16px]">undo</mat-icon></button>
            <button (click)="fmt('redo')"  class="toolbar-btn" title="Rehacer"><mat-icon class="!text-[16px]">redo</mat-icon></button>
          </div>

        }
      </div>

      <!-- Body: el #editorRef SIEMPRE existe en el DOM para que ngAfterViewInit lo encuentre -->
      <div class="relative flex-1 overflow-y-auto">
        @if (loading()) {
          <div class="absolute inset-0 z-10 flex items-center justify-center bg-slate-50">
            <mat-spinner [diameter]="36" />
          </div>
        }
        <div class="mx-auto max-w-4xl">
          <div #editorRef class="tiptap-editor min-h-[calc(100vh-80px)] bg-white shadow-sm ring-1 ring-slate-100 mt-6 mx-4 mb-10 rounded-2xl overflow-hidden"></div>
        </div>
      </div>
    </div>
  `,
})
export class CollabEditorComponent implements OnInit, AfterViewInit, OnDestroy {
  @ViewChild('editorRef') editorRef!: ElementRef<HTMLDivElement>;

  private route = inject(ActivatedRoute);

  private auth = inject(AuthService);
  private docService = inject(CollabDocService);

  doc = signal<CollabDocFull | null>(null);
  loading = signal(true);
  connected = signal(false);
  peers = signal<Peer[]>([]);

  editor: Editor | null = null;
  private ydoc!: Y.Doc;
  private stomp!: Client;
  private docId!: string;
  private myUserId!: string;
  private myUserName!: string;
  private myColor!: string;
  private saveTimer: any;
  private dirty = false;
  private initArrivedEmpty = false;

  ngOnInit() {
    this.docId = this.route.snapshot.paramMap.get('id')!;
    const currentUser = this.auth.user();
    this.myUserId = currentUser?.id ?? 'anon';
    this.myUserName = currentUser?.name ?? 'Anónimo';
    this.myColor = PEER_COLORS[Math.abs(this.myUserId.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % PEER_COLORS.length];

    this.docService.getDoc(this.docId).subscribe({
      next: (doc) => {
        this.doc.set(doc);
        this.loading.set(false);
        // Si init ya llegó con ydocState vacío, aplicar initialHtml ahora
        this.tryApplyInitialHtml();
      },
      error: () => {
        this.loading.set(false);
      },
    });
  }

  private tryApplyInitialHtml() {
    if (!this.initArrivedEmpty) return;
    const html = this.doc()?.initialHtml;
    if (html && html.trim()) {
      setTimeout(() => this.editor?.commands.setContent(html, true), 80);
    }
  }

  ngAfterViewInit() {
    this.ydoc = new Y.Doc();
    this.initEditor();
    this.connectStomp();
  }

  private initEditor() {
    this.editor = new Editor({
      element: this.editorRef.nativeElement,
      extensions: [
        StarterKit.configure({ history: false }),
        Placeholder.configure({ placeholder: 'Empieza a escribir…' }),
        Collaboration.configure({ document: this.ydoc }),
        Table.configure({ resizable: false }),
        TableRow,
        TableCell,
        TableHeader,
      ],
    });
  }

  private connectStomp() {
    this.stomp = new Client({
      webSocketFactory: () => new SockJS(environment.wsUrl),
      connectHeaders: { Authorization: `Bearer ${localStorage.getItem('accessToken') ?? ''}` },
      reconnectDelay: 3000,
    });

    this.stomp.onConnect = () => {
      this.connected.set(true);

      // Subscribe to this document's topic
      this.stomp.subscribe(`/topic/collab-docs/${this.docId}`, (msg) => {
        const data = JSON.parse(msg.body);
        this.handleMessage(data);
      });

      // Announce join
      this.stomp.publish({
        destination: `/app/collab-docs/${this.docId}/join`,
        body: JSON.stringify({ userId: this.myUserId, userName: this.myUserName }),
      });

      // Observe local Yjs changes and broadcast
      this.ydoc.on('update', (update: Uint8Array, origin: any) => {
        if (origin === 'remote') return;
        this.stomp.publish({
          destination: `/app/collab-docs/${this.docId}/update`,
          body: JSON.stringify({
            userId: this.myUserId,
            update: this.toBase64(update),
          }),
        });
        this.dirty = true;
        this.scheduleSave();
      });

      // Broadcast presence on cursor change
      this.editor?.on('selectionUpdate', ({ editor }) => {
        const { from, to } = editor.state.selection;
        this.stomp.publish({
          destination: `/app/collab-docs/${this.docId}/presence`,
          body: JSON.stringify({
            userId: this.myUserId,
            userName: this.myUserName,
            color: this.myColor,
            from,
            to,
          }),
        });
      });
    };

    this.stomp.onDisconnect = () => this.connected.set(false);
    this.stomp.onStompError = () => this.connected.set(false);
    this.stomp.onWebSocketError = () => this.connected.set(false);
    this.stomp.activate();
  }

  private handleMessage(data: any) {
    switch (data.type) {
      case 'init':
        if (data.targetUserId === this.myUserId) {
          if (data.ydocState) {
            try {
              Y.applyUpdate(this.ydoc, this.fromBase64(data.ydocState), 'remote');
            } catch { /* estado Yjs inválido, ignorar */ }
          } else {
            // Doc nuevo — intentar cargar initialHtml
            this.initArrivedEmpty = true;
            this.tryApplyInitialHtml();
          }
        }
        break;

      case 'peer_joined':
        // A new user joined — send them my full live state so they get unsaved changes
        if (data.joiningUserId !== this.myUserId && this.stomp?.connected) {
          const fullState = Y.encodeStateAsUpdate(this.ydoc);
          this.stomp.publish({
            destination: `/app/collab-docs/${this.docId}/peer-state`,
            body: JSON.stringify({
              targetUserId: data.joiningUserId,
              fromUserId: this.myUserId,
              update: this.toBase64(fullState),
            }),
          });
        }
        break;

      case 'peer_state':
        // Another peer sent their full state for me — apply it to merge
        if (data.targetUserId === this.myUserId && data.update) {
          Y.applyUpdate(this.ydoc, this.fromBase64(data.update), 'remote');
        }
        break;

      case 'update':
        if (data.userId !== this.myUserId && data.update) {
          Y.applyUpdate(this.ydoc, this.fromBase64(data.update), 'remote');
        }
        break;

      case 'presence':
        if (data.userId !== this.myUserId) {
          this.updatePeer({ userId: data.userId, userName: data.userName, color: data.color });
        }
        break;
    }
  }

  private updatePeer(peer: Peer) {
    this.peers.update(list => {
      const existing = list.findIndex(p => p.userId === peer.userId);
      if (existing >= 0) {
        const updated = [...list];
        updated[existing] = peer;
        return updated;
      }
      return [...list, peer];
    });
  }

  private scheduleSave() {
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.persistState(), 5000);
  }

  private persistState() {
    if (!this.stomp?.connected || !this.ydoc || !this.dirty) return;
    this.dirty = false;
    clearTimeout(this.saveTimer);
    const state = Y.encodeStateAsUpdate(this.ydoc);
    const text = this.editor?.getText() ?? '';
    const user = this.auth.user();
    this.stomp.publish({
      destination: `/app/collab-docs/${this.docId}/save-state`,
      body: JSON.stringify({
        ydocState: this.toBase64(state),
        textSnapshot: text,
        userId: this.myUserId,
        userName: this.myUserName,
        userEmail: user?.email ?? '',
      }),
    });
  }

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

  goBack() {
    this.persistState();
    window.history.back();
  }

  ngOnDestroy() {
    clearTimeout(this.saveTimer);
    this.persistState();
    this.editor?.destroy();
    this.stomp?.deactivate();
  }

  private toBase64(arr: Uint8Array): string {
    return btoa(String.fromCharCode(...arr));
  }

  private fromBase64(b64: string): Uint8Array {
    return Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  }
}
