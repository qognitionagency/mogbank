/**
 * Database Service
 *
 * PostgreSQL connection pool and query helpers.
 * Provides transactional support for double-entry ledger operations.
 */
import { Pool, PoolClient, QueryResult } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

let pool: Pool;

/**
 * Initialize the database service with a PostgreSQL pool.
 * Called from index.ts during server startup.
 */
export function initDatabase(externalPool: Pool): void {
  pool = externalPool;
  pool.on('error', (err) => {
    logger.error('Unexpected database pool error', err);
  });
  logger.info('Database service initialized');
}

export async function query<T = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  const start = Date.now();
  try {
    const result = await pool.query<T>(text, params);
    const duration = Date.now() - start;
    logger.debug('Database query', { text: text.substring(0, 100), duration, rows: result.rowCount });
    return result;
  } catch (error) {
    logger.error('Database query failed', { text: text.substring(0, 100), error });
    throw error;
  }
}

/**
 * Execute multiple queries within a single database transaction.
 * Used for double-entry ledger entries — all entries must succeed or none.
 */
export async function withTransaction<T>(
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Transaction rolled back', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Check if an idempotency key has already been processed.
 * Returns the existing response if found, null otherwise.
 */
export async function checkIdempotencyKey(
  client: PoolClient,
  idempotencyKey: string
): Promise<{ response: any; created_at: string } | null> {
  const result = await client.query(
    `SELECT response, created_at FROM idempotency_keys 
     WHERE key_hash = $1 AND expires_at > NOW()`,
    [idempotencyKey]
  );
  if (result.rows.length > 0) {
    return result.rows[0];
  }
  return null;
}

/**
 * Store an idempotency key with its response.
 */
export async function storeIdempotencyKey(
  client: PoolClient,
  keyHash: string,
  response: any
): Promise<void> {
  await client.query(
    `INSERT INTO idempotency_keys (key_hash, response, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '24 hours')
     ON CONFLICT (key_hash) DO NOTHING`,
    [keyHash, JSON.stringify(response)]
  );
}

export { pool };
export type { PoolClient };