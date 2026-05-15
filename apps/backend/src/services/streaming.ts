/**
 * WebSocket / SSE Balance Streaming Service
 *
 * Provides real-time balance updates to connected clients via:
 * 1. Server-Sent Events (SSE) — primary streaming protocol
 * 2. WebSocket — fallback for bidirectional communication
 *
 * Clients subscribe to wallet balance streams and receive
 * push notifications on every ledger state change.
 */
import { IncomingMessage, ServerResponse } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { Server as HTTPServer } from 'http';
import { logger } from '../utils/logger';

export interface BalanceUpdate {
  walletId: string;
  balance: number;
  currency: string;
  timestamp: string;
  ledgerEntryId?: string;
  transactionType?: string;
}

export interface StreamSubscription {
  walletId: string;
  client: SSEConnection | WSConnection;
}

interface SSEConnection {
  type: 'sse';
  response: ServerResponse;
  walletId: string;
  lastEventId: string | null;
}

interface WSConnection {
  type: 'ws';
  ws: WebSocket;
  walletId: string;
}

// Store all active subscriptions
const subscriptions = new Map<string, (SSEConnection | WSConnection)[]>();

// Track active WebSocket server
let wss: WebSocketServer | null = null;

/**
 * Initialize streaming service with an HTTP server.
 * Attaches both SSE and WebSocket handlers.
 */
export function initializeStreaming(httpServer: HTTPServer): void {
  // --- WebSocket server ---
  wss = new WebSocketServer({ server: httpServer, path: '/api/v1/stream/ws' });

  wss.on('connection', (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url!, `http://${req.headers.host}`);
    const walletId = url.searchParams.get('wallet_id');
    const authToken = url.searchParams.get('token');

    if (!walletId || !authToken) {
      ws.close(4001, 'wallet_id and token required');
      logger.warn('WebSocket connection rejected: missing params');
      return;
    }

    // TODO: Validate auth token in production
    // if (!validateAuthToken(authToken, walletId)) {
    //   ws.close(4003, 'Invalid auth token');
    //   return;
    // }

    const conn: WSConnection = { type: 'ws', ws, walletId };
    addSubscription(walletId, conn);

    logger.info('WebSocket client connected', { walletId });

    ws.on('message', (data: Buffer) => {
      try {
        const msg = JSON.parse(data.toString());
        handleWSMessage(ws, walletId, msg);
      } catch {
        // Ignore malformed messages
      }
    });

    ws.on('close', () => {
      removeSubscription(walletId, conn);
      logger.info('WebSocket client disconnected', { walletId });
    });

    ws.on('error', (error) => {
      logger.error('WebSocket error', { walletId, error });
      removeSubscription(walletId, conn);
    });

    // Send initial connection confirmation
    ws.send(JSON.stringify({
      type: 'connected',
      walletId,
      timestamp: new Date().toISOString(),
      protocol: 'ws',
    }));
  });

  logger.info('Streaming service initialized (SSE + WebSocket)');
}

/**
 * Handle SSE subscription request.
 * GET /api/v1/stream/sse?wallet_id=xxx&token=xxx
 */
export function handleSSEConnection(
  req: IncomingMessage,
  res: ServerResponse
): void {
  const url = new URL(req.url!, `http://${req.headers.host}`);
  const walletId = url.searchParams.get('wallet_id');
  const authToken = url.searchParams.get('token');
  const lastEventId = req.headers['last-event-id'] as string || null;

  if (!walletId || !authToken) {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'wallet_id and token required' }));
    return;
  }

  // TODO: Validate auth token
  // if (!validateAuthToken(authToken, walletId)) {
  //   res.writeHead(403, { 'Content-Type': 'application/json' });
  //   res.end(JSON.stringify({ error: 'Invalid auth token' }));
  //   return;
  // }

  // Set SSE headers
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no', // Disable nginx buffering
  });

  // Send initial connected event
  const initEvent = `id: ${Date.now()}\nevent: connected\ndata: ${JSON.stringify({
    walletId,
    timestamp: new Date().toISOString(),
    protocol: 'sse',
  })}\n\n`;
  res.write(initEvent);

  const conn: SSEConnection = { type: 'sse', response: res, walletId, lastEventId };
  addSubscription(walletId, conn);

  logger.info('SSE client connected', { walletId });

  // Keep-alive ping every 30 seconds
  const pingInterval = setInterval(() => {
    try {
      res.write(': ping\n\n');
    } catch {
      clearInterval(pingInterval);
    }
  }, 30000);

  // Cleanup on close
  req.on('close', () => {
    clearInterval(pingInterval);
    removeSubscription(walletId, conn);
    logger.info('SSE client disconnected', { walletId });
  });
}

/**
 * Add a subscription for a wallet.
 */
function addSubscription(walletId: string, conn: SSEConnection | WSConnection): void {
  const existing = subscriptions.get(walletId) || [];
  existing.push(conn);
  subscriptions.set(walletId, existing);
}

/**
 * Remove a subscription for a wallet.
 */
function removeSubscription(walletId: string, conn: SSEConnection | WSConnection): void {
  const existing = subscriptions.get(walletId);
  if (!existing) return;

  const filtered = existing.filter((c) => c !== conn);
  if (filtered.length === 0) {
    subscriptions.delete(walletId);
  } else {
    subscriptions.set(walletId, filtered);
  }
}

/**
 * Handle WebSocket messages from client.
 */
function handleWSMessage(ws: WebSocket, walletId: string, msg: any): void {
  switch (msg.type) {
    case 'subscribe':
      if (msg.walletId) {
        logger.debug('WebSocket subscribe', { walletId, subscribeTo: msg.walletId });
      }
      break;

    case 'unsubscribe':
      logger.debug('WebSocket unsubscribe', { walletId });
      break;

    case 'ping':
      ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
      break;

    default:
      break;
  }
}

/**
 * Broadcast a balance update to all subscribed clients for a wallet.
 */
export function broadcastBalanceUpdate(update: BalanceUpdate): void {
  const subs = subscriptions.get(update.walletId);
  if (!subs || subs.length === 0) return;

  const eventId = Date.now().toString();
  const sseData = `id: ${eventId}\nevent: balance_update\ndata: ${JSON.stringify(update)}\n\n`;
  const wsData = JSON.stringify({
    type: 'balance_update',
    id: eventId,
    data: update,
  });

  const deadConnections: (SSEConnection | WSConnection)[] = [];

  for (const conn of subs) {
    try {
      if (conn.type === 'sse') {
        conn.response.write(sseData);
      } else if (conn.type === 'ws' && conn.ws.readyState === WebSocket.OPEN) {
        conn.ws.send(wsData);
      }
    } catch (error) {
      logger.error('Error broadcasting to client', { walletId: update.walletId, error });
      deadConnections.push(conn);
    }
  }

  // Clean up dead connections
  for (const dead of deadConnections) {
    removeSubscription(update.walletId, dead);
  }
}

/**
 * Broadcast a generic event to all subscribed clients for a wallet.
 */
export function broadcastEvent(
  walletId: string,
  eventType: string,
  data: any
): void {
  broadcastBalanceUpdate({
    walletId,
    balance: 0,
    currency: 'USDC',
    timestamp: new Date().toISOString(),
    ledgerEntryId: eventType,
    transactionType: eventType,
  });
}

/**
 * Get count of active subscriptions.
 */
export function getSubscriptionStats(): { walletId: string; count: number }[] {
  return Array.from(subscriptions.entries()).map(([walletId, conns]) => ({
    walletId,
    count: conns.length,
  }));
}

/**
 * Broadcast a wallet status change to all connected clients.
 */
export function broadcastWalletStatusChange(
  walletId: string,
  status: string,
  balance: number
): void {
  broadcastBalanceUpdate({
    walletId,
    balance,
    currency: 'USDC',
    timestamp: new Date().toISOString(),
    transactionType: `wallet_${status}`,
  });
}