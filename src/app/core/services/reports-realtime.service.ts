import { Injectable, NgZone, inject } from '@angular/core';
import { Client, IMessage } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import { environment } from '../../../environments/environment';

interface ReportsRealtimeHandlers {
  onConnected?: () => void;
  onDisconnected?: () => void;
  onDashboard?: (payload: any) => void;
}

@Injectable({ providedIn: 'root' })
export class ReportsRealtimeService {
  private zone = inject(NgZone);
  private client: Client | null = null;
  private handlers: ReportsRealtimeHandlers = {};

  connect(handlers: ReportsRealtimeHandlers) {
    const token = localStorage.getItem('accessToken');
    this.disconnect();
    this.handlers = handlers;

    this.client = new Client({
      webSocketFactory: () => new SockJS(environment.wsUrl),
      connectHeaders: token ? { Authorization: `Bearer ${token}` } : {},
      reconnectDelay: 5000,
      onConnect: () => {
        this.zone.run(() => this.handlers.onConnected?.());
        if (!this.client) return;
        this.client.subscribe('/topic/reports/dashboard', message => this.handleDashboard(message));
      },
      onWebSocketClose: () => this.zone.run(() => this.handlers.onDisconnected?.()),
      onStompError: () => this.zone.run(() => this.handlers.onDisconnected?.())
    });

    this.client.activate();
  }

  disconnect() {
    this.client?.deactivate();
    this.client = null;
    this.handlers = {};
  }

  private handleDashboard(message: IMessage) {
    this.zone.run(() => {
      this.handlers.onDashboard?.(JSON.parse(message.body));
    });
  }
}
