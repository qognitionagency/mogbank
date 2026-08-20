/**
 * Database Service
 *
 * PostgreSQL connection pool and query helpers.
 * Provides transactional support for double-entry ledger operations.
 */
import { Pool, PoolClient, QueryResult, QueryResultRow, types as pgTypes } from 'pg';
import { config } from '../config';
import { logger } from '../utils/logger';

// ------------------------------------------------------------------
// Numeric type parsing
// ------------------------------------------------------------------
// node-postgres returns BIGINT and NUMERIC as strings, because either can
// exceed what a JS number represents exactly. Every balance column in this
// schema is BIGINT, and the ledger does arithmetic directly on what it reads
// back — so a string turns `balance + amount` into string CONCATENATION.
// A credit of 999999999 onto a balance of 97227 produced 97227999999999.
//
// Balances are held in the smallest denomination unit (cents), so the safe
// integer range covers ~90 trillion dollars — far beyond anything this ledger
// will hold. Parsing to numbers is therefore correct here, and it matches what
// the web app's data layer does, keeping both halves of the system consistent.
const asNumber = (value: string | null) => (value === null ? null : Number(value));
pgTypes.setTypeParser(pgTypes.builtins.INT8, asNumber);
pgTypes.setTypeParser(pgTypes.builtins.NUMERIC, asNumber);

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

export async function query<T extends QueryResultRow = any>(
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
 * Record the final response against an idempotency key.
 *
 * The caller reserves the key first, inserting a placeholder row inside the
 * same transaction to serialise concurrent retries. This call then has to
 * overwrite that placeholder — `ON CONFLICT DO NOTHING` left the reserved
 * `'{}'` in place, so a retry replayed an empty object instead of the original
 * result and the caller could not tell whether the transfer had happened.
 */
export async function storeIdempotencyKey(
  client: PoolClient,
  keyHash: string,
  response: any
): Promise<void> {
  await client.query(
    `INSERT INTO idempotency_keys (key_hash, response, expires_at)
     VALUES ($1, $2, NOW() + INTERVAL '24 hours')
     ON CONFLICT (key_hash) DO UPDATE
       SET response   = EXCLUDED.response,
           expires_at = EXCLUDED.expires_at`,
    [keyHash, JSON.stringify(response)]
  );
}

export { pool };
export type { PoolClient };