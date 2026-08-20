/**
 * MogBank Backend Server
 *
 * ABOS (Agent-Based Operating System) Protocol Backend
 * Handles agent registration, USDC transfers via double-entry ledger,
 * x402 payment protocol, KYA-7 scoring, and marketplace escrow.
 */
import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import http from 'http';
import { WebSocketServer } from 'ws';
import { Pool } from 'pg';
import { createClient } from 'redis';
import { config } from './config';
import { logger } from './utils/logger';
import routes from './api/routes';
import { errorHandler } from './middleware/errorHandler';
import { initStreaming } from './services/streaming';
import { initDatabase } from './services/database';

const app = express();
const server = http.createServer(app);

// ============================================================
// Database Pool Initialization
// ============================================================
// Production runs against Neon, which hands out a single connection string and
// serves a certificate from a public CA — so the chain is verified rather than
// waved through. Local docker-compose development has no URL and no TLS, and
// falls back to the discrete DB_* fields.
const poolConfig = config.database.url
  ? {
      connectionString: config.database.url,
      ssl: { rejectUnauthorized: true },
    }
  : {
      host: config.database.host,
      port: config.database.port,
      database: config.database.name,
      user: config.database.user,
      password: config.database.password,
      ssl: config.database.ssl ? { rejectUnauthorized: true } : undefined,
    };

const pool = new Pool({
  ...poolConfig,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Initialize database service with pool
initDatabase(pool);

// ============================================================
// Redis Client (for rate limiting, caching, streaming pub/sub)
// ============================================================
let redisClient: ReturnType<typeof createClient> | null = null;

// Redis backs rate limiting, caching and stream pub/sub, all of which degrade
// gracefully — the deployment blueprint documents it as optional. Two things
// are needed to actually make it optional:
//   1. do not dial at all unless a host is configured, and
//   2. bound the reconnect attempts. node-redis retries forever by default, so
//      `await connect()` never settles against an absent server and startup
//      hangs before `server.listen()` — the service comes up, fails its health
//      check, and gets recycled.
async function initRedis() {
  if (!config.redis.host) {
    logger.info('Redis not configured — running without cache/pub-sub');
    return;
  }
  try {
    redisClient = createClient({
      socket: {
        host: config.redis.host,
        port: config.redis.port,
        connectTimeout: 5000,
        reconnectStrategy: (retries) =>
          retries >= 3 ? new Error('Redis unreachable') : Math.min(200 * (retries + 1), 1000),
      },
      password: config.redis.password || undefined,
    });
    redisClient.on('error', (err) => logger.warn('Redis connection error', { error: err.message }));
    await redisClient.connect();
    logger.info('Redis connected', { host: config.redis.host, port: config.redis.port });
  } catch (err: any) {
    logger.warn('Redis not available — running without cache/pub-sub', { error: err.message });
    redisClient?.removeAllListeners();
    // disconnect() drops the socket without waiting to drain, which is what we
    // want for a client that never finished connecting.
    await redisClient?.disconnect().catch(() => {});
    redisClient = null;
  }
}

// ============================================================
// Middleware Setup
// ============================================================
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true }));

// Request logging
app.use((req, _res, next) => {
  logger.debug(`${req.method} ${req.path}`, {
    ip: req.ip,
    userAgent: req.get('user-agent'),
  });
  next();
});

// ============================================================
// WebSocket Server
// ============================================================
const wss = new WebSocketServer({
  server,
  path: '/ws',
  perMessageDeflate: false,
});

wss.on('connection', (ws, req) => {
  const clientId = req.headers['x-agent-id'] as string || 'anonymous';
  logger.info('WebSocket client connected', { clientId });

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(data.toString());
      logger.debug('WS message received', { clientId, msg });

      // Handle subscription messages
      if (msg.type === 'subscribe' && msg.channel) {
        (ws as any).subscriptions = (ws as any).subscriptions || new Set();
        (ws as any).subscriptions.add(msg.channel);
        ws.send(JSON.stringify({
          type: 'subscribed',
          channel: msg.channel,
          timestamp: new Date().toISOString(),
        }));
      }

      if (msg.type === 'unsubscribe' && msg.channel) {
        (ws as any).subscriptions?.delete(msg.channel);
      }
    } catch {
      ws.send(JSON.stringify({ error: 'Invalid message format' }));
    }
  });

  ws.on('close', () => {
    logger.info('WebSocket client disconnected', { clientId });
  });

  // Send welcome message
  ws.send(JSON.stringify({
    type: 'connected',
    protocol: 'ABOS v1.0',
    timestamp: new Date().toISOString(),
  }));
});

// Initialize streaming service with WSS
initStreaming(wss);

// ============================================================
// SSE (Server-Sent Events) endpoint for balance streaming
// ============================================================
app.get('/api/v1/stream/balance/:walletId', (req, res) => {
  const { walletId } = req.params;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Stream-Protocol': 'ABOS-SSE-1.0',
  });

  res.write(`data: ${JSON.stringify({ type: 'connected', walletId, timestamp: new Date().toISOString() })}\n\n`);

  // Keep-alive ping every 30 seconds
  const pingInterval = setInterval(() => {
    res.write(`: ping ${new Date().toISOString()}\n\n`);
  }, 30000);

  // Store the response for balance broadcasts
  const clients = (app as any)._sseClients || new Map<string, Set<express.Response>>();
  if (!clients.has(walletId)) clients.set(walletId, new Set());
  clients.get(walletId)!.add(res);
  (app as any)._sseClients = clients;

  req.on('close', () => {
    clearInterval(pingInterval);
    const walletClients = (app as any)._sseClients?.get(walletId);
    if (walletClients) {
      walletClients.delete(res);
      if (walletClients.size === 0) (app as any)._sseClients.delete(walletId);
    }
  });
});

// Attach SSE clients to app for broadcast
export function getSseClients(): Map<string, Set<express.Response>> {
  return (app as any)._sseClients || new Map();
}

// ============================================================
// API Routes
// ============================================================
app.use('/api', routes);

// ============================================================
// ABOS Discovery endpoint
// ============================================================
app.get('/abos', (_req, res) => {
  res.json({
    protocol: 'ABOS v1.0',
    version: '1.0.0',
    x402_supported: config.x402.enabled,
    kya_scoring: 'KYA-7',
    currencies: ['USDC'],
    blockchain: 'Base L2',
    chainId: config.blockchain.chainId,
    ws_endpoint: '/ws',
    sse_endpoint: '/api/v1/stream/balance/:walletId',
    timestamp: new Date().toISOString(),
  });
});

// Render polls this as the service health check. An API that cannot reach its
// ledger is not healthy, so the database is actually queried rather than
// assumed up — a 503 here is the correct signal to stop routing traffic.
app.get('/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({
      status: 'ok',
      database: 'connected',
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    logger.error('Health check failed to reach the database', { error: err.message });
    res.status(503).json({
      status: 'degraded',
      database: 'unavailable',
      error: err.message,
      timestamp: new Date().toISOString(),
    });
  }
});

app.get('/.well-known/abos', (_req, res) => {
  res.json({
    protocol: 'ABOS v1.0',
    transfer_fee_percent: 0.1,
    x402_fee_percent: 0.25,
    min_kya_threshold: 30,
    required_scoring_dimensions: [
      'identity_verification',
      'transaction_history',
      'delegate_reliability',
      'protocol_compliance',
      'liquidity_depth',
      'response_time',
      'dispute_resolution',
    ],
  });
});

// ============================================================
// Error Handler
// ============================================================
app.use(errorHandler);

// ============================================================
// Server Startup
// ============================================================
async function start() {
  try {
    // Test database connection
    const client = await pool.connect();
    const { rows } = await client.query(
      'SELECT current_database() AS database, inet_server_addr()::text AS server'
    );
    logger.info('Database connected', {
      database: rows[0]?.database,
      via: config.database.url ? 'DATABASE_URL' : `${config.database.host}:${config.database.port}`,
    });
    client.release();

    // Initialize Redis
    await initRedis();

    // Start HTTP + WS server
    server.listen(config.port, () => {
      logger.info(`MogBank backend running on port ${config.port}`, {
        environment: config.nodeEnv,
        x402: config.x402.enabled ? 'enabled' : 'disabled',
        ddsc: config.ddsc.enabled ? 'enabled' : 'disabled',
        wsPath: '/ws',
        ssePath: '/api/v1/stream/balance/:walletId',
      });
    });
  } catch (err: any) {
    logger.error('Failed to start server', { error: err.message });
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received — shutting down gracefully');
  wss.close();
  await pool.end();
  if (redisClient) await redisClient.quit();
  server.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received — shutting down');
  wss.close();
  await pool.end();
  if (redisClient) await redisClient.quit();
  server.close();
  process.exit(0);
});

start();

export { app, pool, redisClient, wss };