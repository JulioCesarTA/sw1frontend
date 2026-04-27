import { Injectable, inject } from '@angular/core';
import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { environment } from '../../../environments/environment';
import { AuthService } from './auth.service';

export interface WorkflowStageLock {
  workflowId: string;
  stageId: string;
  sessionId: string;
  userId: string;
  userName: string;
  lockedAt: string;
}

export interface CollaborativeWorkflowStage {
  id: string;
  workflowId: string;
  name: string;
  description?: string;
  order: number;
  responsibleRole?: string;
  responsibleDepartmentId?: string;
  responsibleDepartmentName?: string;
  requiresForm: boolean;
  avgHours: number;
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
  fromStageId: string;
  toStageId: string;
  name?: string;
  condition?: string;
  forwardConfig?: {
    mode?: string;
    fieldNames?: string[];
    includeFiles?: boolean;
  };
}

interface WorkflowCollabHandlers {
  onSnapshot?: (locks: WorkflowStageLock[]) => void;
  onStageLocked?: (lock: WorkflowStageLock) => void;
  onStageUnlocked?: (stageId: string, userId?: string) => void;
  onStageMoved?: (event: { stageId: string; x: number; y: number; userId?: string }) => void;
  onStageCreated?: (event: { stage: CollaborativeWorkflowStage; userId?: string }) => void;
  onStageUpdated?: (event: { stage: CollaborativeWorkflowStage; userId?: string }) => void;
  onStageDeleted?: (event: { stageId: string; userId?: string }) => void;
  onTransitionCreated?: (event: { transition: CollaborativeWorkflowTransition; userId?: string }) => void;
  onTransitionUpdated?: (event: { transition: CollaborativeWorkflowTransition; userId?: string }) => void;
  onTransitionDeleted?: (event: { transitionId: string; userId?: string }) => void;
  onLockDenied?: (event: { stageId: string; lock?: WorkflowStageLock }) => void;
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

  lockStage(stageId: string) {
    if (!this.client || !this.workflowId) return;
    this.client.publish({
      destination: `/app/workflows/${this.workflowId}/lock-stage`,
      body: JSON.stringify({ stageId, userId: this.clientId, userName: this.auth.user()?.name ?? 'Usuario' })
    });
  }

  unlockStage(stageId: string) {
    if (!this.client || !this.workflowId) return;
    this.client.publish({
      destination: `/app/workflows/${this.workflowId}/unlock-stage`,
      body: JSON.stringify({ stageId, userId: this.clientId })
    });
  }

  moveStage(stageId: string, x: number, y: number) {
    if (!this.client || !this.workflowId) return;
    this.client.publish({
      destination: `/app/workflows/${this.workflowId}/move-stage`,
      body: JSON.stringify({ stageId, x, y, userId: this.clientId })
    });
  }

  publishStageCreated(stage: CollaborativeWorkflowStage) {
    if (!this.client || !this.workflowId) return;
    this.client.publish({
      destination: `/app/workflows/${this.workflowId}/stage-created`,
      body: JSON.stringify({ stage, userId: this.clientId })
    });
  }

  private handleTopicMessage(message: IMessage) {
    const data = JSON.parse(message.body);
    if (data.targetUserId && data.targetUserId !== this.clientId) return;

    switch (data.type) {
      case 'snapshot':
        this.handlers.onSnapshot?.(data.locks ?? []);
        break;
      case 'stage_locked':
        this.handlers.onStageLocked?.(data.lock);
        break;
      case 'stage_unlocked':
        this.handlers.onStageUnlocked?.(data.stageId, data.userId);
        break;
      case 'stage_moved':
        this.handlers.onStageMoved?.(data);
        break;
      case 'stage_created':
        this.handlers.onStageCreated?.(data);
        break;
      case 'stage_updated':
        this.handlers.onStageUpdated?.(data);
        break;
      case 'stage_deleted':
        this.handlers.onStageDeleted?.(data);
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
