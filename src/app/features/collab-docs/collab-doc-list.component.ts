import { Component, OnInit, inject, signal, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { CollabDocService, CollabDocSummary } from '../../core/services/collab-doc.service';

@Component({
  selector: 'app-collab-doc-list',
  standalone: true,
  imports: [CommonModule, FormsModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="flex flex-col gap-4">
      <!-- Header -->
      <div class="flex items-center justify-between">
        <h3 class="text-base font-semibold text-slate-800 flex items-center gap-2">
          <mat-icon class="!text-[18px] text-indigo-500">description</mat-icon>
          Documentos colaborativos
        </h3>
        <button
          (click)="openCreate()"
          class="flex items-center gap-1.5 rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition hover:bg-indigo-700 active:scale-95">
          <mat-icon class="!text-[16px]">add</mat-icon>
          Nuevo documento
        </button>
      </div>

      <!-- Create form -->
      @if (creating()) {
        <div class="flex items-center gap-2 rounded-2xl border border-indigo-200 bg-indigo-50 p-3">
          <input
            [(ngModel)]="newTitle"
            (keydown.enter)="confirmCreate()"
            (keydown.escape)="creating.set(false)"
            placeholder="Nombre del documento..."
            autofocus
            class="flex-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100" />
          <button
            (click)="confirmCreate()"
            [disabled]="!newTitle.trim() || saving()"
            class="rounded-xl bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50 hover:bg-indigo-700">
            Crear
          </button>
          <button
            (click)="creating.set(false)"
            class="rounded-xl bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-200">
            Cancelar
          </button>
        </div>
      }

      <!-- List -->
      @if (loading()) {
        <div class="flex justify-center py-6"><mat-spinner [diameter]="28" /></div>
      } @else if (docs().length === 0) {
        <div class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-10 text-slate-400">
          <mat-icon class="!text-[36px]">folder_open</mat-icon>
          <p class="text-sm">Sin documentos todavía</p>
        </div>
      } @else {
        <div class="flex flex-col gap-2">
          @for (doc of docs(); track doc.id) {
            <div class="group flex items-center gap-3 rounded-2xl border border-slate-100 bg-white px-4 py-3 shadow-sm transition hover:border-indigo-200 hover:shadow">
              <mat-icon class="!text-[20px] shrink-0 text-indigo-400">article</mat-icon>
              <div class="min-w-0 flex-1 cursor-pointer" (click)="openDoc(doc.id)">
                <p class="truncate text-sm font-medium text-slate-800">{{ doc.title }}</p>
                <p class="text-xs text-slate-400">
                  {{ doc.createdByName }} · {{ doc.updatedAt | date:'dd/MM/yyyy HH:mm' }}
                </p>
              </div>
              <button
                (click)="openDoc(doc.id)"
                class="shrink-0 rounded-lg bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-600 opacity-0 transition group-hover:opacity-100 hover:bg-indigo-100">
                Abrir
              </button>
              <button
                (click)="deleteDoc(doc)"
                class="shrink-0 rounded-lg bg-rose-50 p-1 text-rose-400 opacity-0 transition group-hover:opacity-100 hover:bg-rose-100">
                <mat-icon class="!text-[16px]">delete_outline</mat-icon>
              </button>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class CollabDocListComponent implements OnInit {
  @Input() tramiteId!: string;

  private docService = inject(CollabDocService);
  private router = inject(Router);

  docs = signal<CollabDocSummary[]>([]);
  loading = signal(true);
  creating = signal(false);
  saving = signal(false);
  newTitle = '';

  ngOnInit() {
    this.load();
  }

  load() {
    this.loading.set(true);
    this.docService.listByTramite(this.tramiteId).subscribe({
      next: (docs) => { this.docs.set(docs); this.loading.set(false); },
      error: () => this.loading.set(false),
    });
  }

  openCreate() {
    this.newTitle = '';
    this.creating.set(true);
  }

  confirmCreate() {
    const title = this.newTitle.trim();
    if (!title) return;
    this.saving.set(true);
    this.docService.create(this.tramiteId, title).subscribe({
      next: (doc) => {
        this.saving.set(false);
        this.creating.set(false);
        this.newTitle = '';
        this.router.navigate(['/collab-docs', doc.id]);
      },
      error: () => this.saving.set(false),
    });
  }

  openDoc(docId: string) {
    this.router.navigate(['/collab-docs', docId]);
  }

  deleteDoc(doc: CollabDocSummary) {
    if (!confirm(`¿Eliminar "${doc.title}"?`)) return;
    this.docService.delete(doc.id).subscribe({
      next: () => this.docs.update(list => list.filter(d => d.id !== doc.id)),
    });
  }
}
