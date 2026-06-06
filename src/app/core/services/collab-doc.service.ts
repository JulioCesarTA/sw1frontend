import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { environment } from '../../../environments/environment';

export interface CollabDocSummary {
  id: string;
  tramiteId: string;
  title: string;
  createdBy: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface CollabDocFull extends CollabDocSummary {
  ydocState: string;
  textSnapshot: string;
  initialHtml: string;
  fileStoredName: string;
}

export interface OpenFileParams {
  tramiteId: string;
  storedName: string;
  workflowId?: string;
  title?: string;
}

@Injectable({ providedIn: 'root' })
export class CollabDocService {
  private http = inject(HttpClient);
  private base = environment.apiUrl;

  create(tramiteId: string, title: string): Observable<CollabDocSummary> {
    return this.http.post<CollabDocSummary>(`${this.base}/collab-documents`, { tramiteId, title });
  }

  listByTramite(tramiteId: string): Observable<CollabDocSummary[]> {
    return this.http.get<CollabDocSummary[]>(`${this.base}/collab-documents/by-tramite/${tramiteId}`);
  }

  getDoc(docId: string): Observable<CollabDocFull> {
    return this.http.get<CollabDocFull>(`${this.base}/collab-documents/${docId}`);
  }

  delete(docId: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/collab-documents/${docId}`);
  }

  openFile(params: OpenFileParams): Observable<CollabDocFull> {
    return this.http.post<CollabDocFull>(`${this.base}/collab-documents/open-file`, params);
  }


}
