import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface OpenFileParams {
  tramiteId: string;
  storedName: string;
  workflowId?: string;
  workflowName?: string;
  tramiteFolder?: string;
  title?: string;
  downloadPath?: string;
}

export interface CollabDocFull {
  roomId: string;
  id: string;          // alias de roomId, para router.navigate
  title: string;
  fileStoredName: string;
  initialHtml: string;
  ydocState: string;   // JSON grid para xlsx, vacío para docx
  workflowName: string;
  tramiteFolder: string;
  workflowId: string;
  tramiteId: string;
}

@Injectable({ providedIn: 'root' })
export class CollabDocService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  openFile(params: OpenFileParams): Observable<CollabDocFull> {
    return this.http.post<CollabDocFull>(`${this.base}/collab-documents/open-file`, params);
  }
}
