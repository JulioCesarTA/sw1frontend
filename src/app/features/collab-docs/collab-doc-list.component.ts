import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-collab-doc-list',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  template: `
    <div class="flex flex-col items-center gap-2 rounded-2xl border border-dashed border-slate-200 bg-slate-50 py-8 text-slate-400">
      <mat-icon class="!text-[32px]">edit_document</mat-icon>
      <p class="text-sm text-center">Para editar un documento, abrilo desde la lista de archivos del trámite.</p>
    </div>
  `,
})
export class CollabDocListComponent {
  @Input() tramiteId!: string;
}
