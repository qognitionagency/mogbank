/**
 * StreamClient — real-time balance and transaction streaming via WebSocket/SSE.
 * 
 * Uses WebSocket as the primary transport with SSE as a fallback.
 * Provides live balance updates, transaction notifications, and agent status changes.
 */
import { MogBankClient } from './client';
import { WSMessage, WSMessageType } from './types';

export type StreamEventHandler = (data: unknown) => void;

export interface StreamSubscription {
  channel: string;
  handler: StreamEventHandler;
  unsubscribe: () => void;
}

export class StreamClient {
  private ws: WebSocket | null = null;
  private eventSource: EventSource | null = null;
  private subscriptions: Map<string, Set<StreamEventHandler>> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private isConnected = false;
  private pingInterval: ReturnType<typeof setInterval> | null = null;

  constructor(private client: MogBankClient) {}

  /**
   * Connect to the balance streaming endpoint.
   * Tries WebSocket first, falls back to SSE.
   */
  async connect(): Promise<void> {
    const wsUrl = this.client.config.baseUrl
      .replace(/^http/, 'ws')
      .replace(/\/$/, '');

    try {
      await this.connectWebSocket(`${wsUrl}/stream/ws`);
    } catch {
      console.warn('[MogBank SDK] WebSocket unavailable, falling back to SSE');
      this.connectSSE(`${this.client.config.baseUrl}/stream/sse`);
    }
  }

  /**
   * Connect via WebSocket with authentication.
   */
  private connectWebSocket(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Add agent ID as query param for authentication
        const authUrl = this.client.config.agentId
          ? `${url}?agent_id=${encodeURIComponent(this.client.config.agentId)}`
          : url;

        this.ws = new WebSocket(authUrl);

        this.ws.onopen = () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.reconnectDelay = 1000;
          this.resubscribeAll();
          this.startPing();
          resolve();
        };

        this.ws.onmessage = (event: MessageEvent) => {
          try {
            const message: WSMessage = JSON.parse(event.data);
            this.handleMessage(message);
          } catch {
            console.warn('[MogBank SDK] Failed to parse WebSocket message');
          }
        };

        this.ws.onerror = () => {
          this.isConnected = false;
          reject(new Error('WebSocket connection failed'));
        };

        this.ws.onclose = () => {
          this.isConnected = false;
          this.stopPing();
          this.attemptReconnect(() => this.connectWebSocket(url));
        };
      } catch (error) {
        reject(error);
      }
    });
  }

  /**
   * Connect via SSE (Server-Sent Events) as a fallback.
   */
  private connectSSE(url: string): void {
    const authUrl = this.client.config.agentId
      ? `${url}?agent_id=${encodeURIComponent(this.client.config.agentId)}`
      : url;

    this.eventSource = new EventSource(authUrl);

    this.eventSource.onopen = () => {
      this.isConnected = true;
      this.reconnectAttempts = 0;
      this.reconnectDelay = 1000;
      this.resubscribeAll();
    };

    // SSE channels map to custom event types
    const channels = ['balance_update', 'transaction_update', 'agent_update'];
    for (const channel of channels) {
      this.eventSource.addEventListener(channel, (event: MessageEvent) => {
        try {
          const data = JSON.parse(event.data);
          this.dispatchToHandlers(channel, data);
        } catch {
          console.warn(`[MogBank SDK] Failed to parse SSE message for ${channel}`);
        }
      });
    }

    this.eventSource.onerror = () => {
      this.isConnected = false;
      this.attemptReconnect(() => this.connectSSE(url));
    };
  }

  /**
   * Handle incoming WebSocket messages and dispatch to subscribers.
   */
  private handleMessage(message: WSMessage): void {
    if (message.type === 'heartbeat') {
      return; // Silently acknowledge heartbeats
    }

    if (message.channel) {
      this.dispatchToHandlers(message.channel, message.data);
    }

    // Also dispatch to generic message type handler
    this.dispatchToHandlers(message.type, message.data);
  }

  /**
   * Dispatch data to all handlers subscribed to a channel.
   */
  private dispatchToHandlers(channel: string, data: unknown): void {
    const handlers = this.subscriptions.get(channel);
    if (handlers) {
      for (const handler of handlers) {
        try {
          handler(data);
        } catch (error) {
          console.error(`[MogBank SDK] Error in stream handler for ${channel}:`, error);
        }
      }
    }
  }

  /**
   * Subscribe to real-time updates for a channel.
   * 
   * Available channels:
   * - `balance_update` — fired when the agent's wallet balance changes
   * - `transaction_update` — fired when a transaction status changes
   * - `agent_update` — fired when agent KYA score or status changes
   * 
   * Returns an object with an `unsubscribe()` method.
   */
  subscribe(channel: WSMessageType | string, handler: StreamEventHandler): StreamSubscription {
    if (!this.subscriptions.has(channel)) {
      this.subscriptions.set(channel, new Set());
    }
    this.subscriptions.get(channel)!.add(handler);

    // If connected, send subscribe message over WebSocket
    if (this.isConnected && this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'subscribe',
        channel,
      }));
    }

    return {
      channel,
      handler,
      unsubscribe: () => this.unsubscribe(channel, handler),
    };
  }

  /**
   * Unsubscribe a specific handler from a channel.
   */
  unsubscribe(channel: string, handler: StreamEventHandler): void {
    const handlers = this.subscriptions.get(channel);
    if (handlers) {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.subscriptions.delete(channel);
      }
    }

    // If connected and no more handlers for this channel, send unsubscribe
    if (
      this.isConnected &&
      this.ws &&
      this.ws.readyState === WebSocket.OPEN &&
      !this.subscriptions.has(channel)
    ) {
      this.ws.send(JSON.stringify({
        type: 'unsubscribe',
        channel,
      }));
    }
  }

  /**
   * Subscribe to balance updates for a specific wallet.
   */
  onBalanceUpdate(handler: (data: { wallet_id: string; balance: number; currency: string }) => void): StreamSubscription {
    return this.subscribe('balance_update', handler as StreamEventHandler);
  }

  /**
   * Subscribe to transaction updates for the authenticated agent.
   */
  onTransactionUpdate(handler: (data: {
    transaction_id: string;
    status: string;
    tx_hash?: string;
    settled_at?: string;
  }) => void): StreamSubscription {
    return this.subscribe('transaction_update', handler as StreamEventHandler);
  }

  /**
   * Resubscribe all channels after reconnect.
   */
  private resubscribeAll(): void {
    for (const channel of this.subscriptions.keys()) {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'subscribe',
          channel,
        }));
      }
    }
  }

  /**
   * Start sending ping/heartbeat messages to keep the connection alive.
   */
  private startPing(): void {
    this.pingInterval = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({ type: 'heartbeat', timestamp: new Date().toISOString() }));
      }
    }, 30000);
  }

  /**
   * Stop the ping interval.
   */
  private stopPing(): void {
    if (this.pingInterval) {
      clearInterval(this.pingInterval);
      this.pingInterval = null;
    }
  }

  /**
   * Attempt to reconnect with exponential backoff.
   */
  private attemptReconnect(connectFn: () => void | Promise<void>): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[MogBank SDK] Max reconnect attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(1.5, this.reconnectAttempts - 1);
    console.log(`[MogBank SDK] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      connectFn();
    }, delay);
  }

  /**
   * Disconnect from the streaming endpoint and clean up.
   */
  disconnect(): void {
    this.stopPing();

    if (this.ws) {
      this.ws.close(1000, 'Client disconnect');
      this.ws = null;
    }

    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    this.isConnected = false;
    this.reconnectAttempts = this.maxReconnectAttempts; // Prevent reconnect
  }

  /**
   * Check if the stream is currently connected.
   */
  get connected(): boolean {
    return this.isConnected;
  }
}