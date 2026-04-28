import { Injectable, inject } from '@angular/core';
import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export interface WorkflowNodoLock {
  workflowId: string;
  nodoId: string;
  sessionId: string;
  userId: string;
  userName: string;
  lockedAt: string;
}

export interface CollaborativeWorkflowNodo {
  id: string;
  workflowId: string;
  name: string;
  description?: string;
  order: number;
  responsibleRole?: string;
  responsibleDepartmentId?: string;
  responsibleDepartmentName?: string;
  requiresForm: boolean;
  avgMinutes: number;
  nodeType?: string;
  isConditional?: boolean;
  condition?: string;
  trueLabel?: string;
  falseLabel?: string;
  posX?: number;
  posY?: number;
  responsibleJobRoleId?: string;
}

export interface CollaborativeWorkflowTransition {
  id: string;
  workflowId: string;
  fromNodoId: string;
  toNodoId: string;
  name?: string;
  condition?: string;
  forwardConfig?: {
    mode?: string;
    fieldNames?: string[];
    includeFiles?: boolean;
  };
}

interface WorkflowCollabHandlers {
  onSnapshot?: (locks: WorkflowNodoLock[]) => void;
  onNodoLocked?: (lock: WorkflowNodoLock) => void;
  onNodoUnlocked?: (nodoId: string, userId?: string) => void;
  onNodoMoved?: (event: { nodoId: string; x: number; y: number; userId?: string }) => void;
  onNodoCreated?: (event: { nodo: CollaborativeWorkflowNodo; userId?: string }) => void;
  onNodoUpdated?: (event: { nodo: CollaborativeWorkflowNodo; userId?: string }) => void;
  onNodoDeleted?: (event: { nodoId: string; userId?: string }) => void;
  onTransitionCreated?: (event: { transition: CollaborativeWorkflowTransition; userId?: string }) => void;
  onTransitionUpdated?: (event: { transition: CollaborativeWorkflowTransition; userId?: string }) => void;
  onTransitionDeleted?: (event: { transitionId: string; userId?: string }) => void;
  onLockDenied?: (event: { nodoId: string; lock?: WorkflowNodoLock }) => void;
}

@Injectable({ providedIn: 'root' })
export class WorkflowCollaborationService {
  private auth = inject(AuthService);
  private client: Client | null = null;
  private workflowId: string | null = null;
  private handlers: WorkflowCollabHandlers = {};
  private connected = false;
  private clientId = this.initClientId();

  private initClientId(): string {
    const existing = sessionStorage.getItem('workflowCollabClientId');
    if (existing) return existing;
    const created = `client-${Math.random().toString(36).slice(2, 10)}`;
    sessionStorage.setItem('workflowCollabClientId', created);
    return created;
  }

  connect(workflowId: string, handlers: WorkflowCollabHandlers) {
    const token = localStorage.getItem('accessToken');
    if (!token) return;

    this.disconnect();
    this.workflowId = workflowId;
    this.handlers = handlers;

    this.client = new Client({
      webSocketFactory: () => new SockJS(environment.wsUrl),
      connectHeaders: { Authorization: `Bearer ${token}` },
      reconnectDelay: 5000,
      onConnect: () => {
        this.connected = true;
        if (!this.client || !this.workflowId) return;

        this.client.subscribe(`/topic/workflows/${this.workflowId}/collab`, msg => this.handleTopicMessage(msg));
        this.client.publish({
          destination: `/app/workflows/${this.workflowId}/join`,
          body: JSON.stringify({ userId: this.clientId, userName: this.auth.user()?.name ?? 'Usuario' })
        });
      },
      onWebSocketClose: () => {
        this.connected = false;
      },
      onStompError: () => {
        this.connected = false;
      }
    });

    this.client.activate();
  }

  disconnect() {
    this.client?.deactivate();
    this.client = null;
    this.connected = false;
    this.workflowId = null;
    this.handlers = {};
  }

  isConnected(): boolean {
    return this.connected && !!this.client?.connected;
  }

  getClientId(): string {
    return this.clientId;
  }

  lockNodo(nodoId: string) {
    if (!this.client || !this.workflowId) return;
    this.client.publish({
      destination: `/app/workflows/${this.workflowId}/lock-nodo`,
      body: JSON.stringify({ nodoId, userId: this.clientId, userName: this.auth.user()?.name ?? 'Usuario' })
    });
  }

  unlockNodo(nodoId: string) {
    if (!this.client || !this.workflowId) return;
    this.client.publish({
      destination: `/app/workflows/${this.workflowId}/unlock-nodo`,
      body: JSON.stringify({ nodoId, userId: this.clientId })
    });
  }

  moveNodo(nodoId: string, x: number, y: number) {
    if (!this.client || !this.workflowId) return;
    this.client.publish({
      destination: `/app/workflows/${this.workflowId}/move-nodo`,
      body: JSON.stringify({ nodoId, x, y, userId: this.clientId })
    });
  }

  publishNodoCreated(nodo: CollaborativeWorkflowNodo) {
    if (!this.client || !this.workflowId) return;
    this.client.publish({
      destination: `/app/workflows/${this.workflowId}/nodo-created`,
      body: JSON.stringify({ nodo, userId: this.clientId })
    });
  }

  private handleTopicMessage(message: IMessage) {
    const data = JSON.parse(message.body);
    if (data.targetUserId && data.targetUserId !== this.clientId) return;

    switch (data.type) {
      case 'snapshot':
        this.handlers.onSnapshot?.(data.locks ?? []);
        break;
      case 'nodo_locked':
        this.handlers.onNodoLocked?.(data.lock);
        break;
      case 'nodo_unlocked':
        this.handlers.onNodoUnlocked?.(data.nodoId, data.userId);
        break;
      case 'nodo_moved':
        this.handlers.onNodoMoved?.(data);
        break;
      case 'nodo_created':
        this.handlers.onNodoCreated?.(data);
        break;
      case 'nodo_updated':
        this.handlers.onNodoUpdated?.(data);
        break;
      case 'nodo_deleted':
        this.handlers.onNodoDeleted?.(data);
        break;
      case 'transition_created':
        this.handlers.onTransitionCreated?.(data);
        break;
      case 'transition_updated':
        this.handlers.onTransitionUpdated?.(data);
        break;
      case 'transition_deleted':
        this.handlers.onTransitionDeleted?.(data);
        break;
      case 'lock_denied':
        this.handlers.onLockDenied?.(data);
        break;
    }
  }
}
