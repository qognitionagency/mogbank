/**
 * Atomic money movement.
 *
 * The routes used to move funds with a read-modify-write:
 *
 *     const { balance } = await read(wallet)          // 100
 *     await update(wallet, { balance: balance - 30 }) // writes 70
 *
 * That is wrong in two separate ways. Two concurrent transfers both read 100
 * and both write their own answer, so one debit is silently lost and money is
 * created from nothing. And because the debit and the credit were separate
 * statements, a process that died between them destroyed the amount in flight
 * — on a serverless platform, where an invocation can be evicted at any point,
 * that is a routine event rather than a freak one. The compensating "rollback"
 * made it worse: it restored the *stale* balance read at the start, clobbering
 * any concurrent change.
 *
 * Every operation here is instead a single SQL statement, so it is one
 * transaction with no interactive round-trips — which is also what lets it run
 * over Neon's stateless HTTP driver.
 *
 * Two properties do the real work:
 *
 *   - Balances are only ever written relative to themselves (`balance - $n`),
 *     never to a value the application read earlier. Under READ COMMITTED the
 *     UPDATE takes a row lock and re-evaluates its WHERE against the committed
 *     row, so a concurrent writer cannot be lost.
 *
 *   - Later stages are gated on earlier ones (`WHERE (SELECT count(*) FROM
 *     debited) = 1`), so the statement either applies in full or matches no
 *     rows and changes nothing. There is no partial outcome to compensate for.
 *
 * The `balance >= 0` CHECK constraint on `wallets` remains the backstop: if a
 * guard here were ever wrong, the database refuses the write rather than
 * letting an account go negative.
 */

import { query } from '@/lib/db'

// ---------------------------------------------------------------------------
// Results
// ---------------------------------------------------------------------------

export type LedgerFailure =
  | 'INSUFFICIENT_FUNDS'
  | 'WALLET_NOT_FOUND'
  | 'WALLET_NOT_ACTIVE'
  | 'CURRENCY_MISMATCH'
  | 'COOLDOWN_ACTIVE'

export type LedgerResult<T> =
  | ({ ok: true } & T)
  | { ok: false; reason: LedgerFailure; detail?: Record<string, unknown> }

interface TransferRow {
  from_balance: number | null
  to_balance: number | null
  debit_tx_id: string | null
}

/**
 * Work out *why* a money statement matched nothing.
 *
 * Only runs on the failure path, so the happy path stays a single round trip.
 * The answer is advisory — by the time it is read the world may have moved on
 * — but it is what turns an opaque failure into an actionable error for the
 * calling agent.
 */
async function diagnose(
  fromWalletId: string,
  toWalletId: string | null,
  required: number,
  currency?: string
): Promise<{ reason: LedgerFailure; detail?: Record<string, unknown> }> {
  const ids = toWalletId ? [fromWalletId, toWalletId] : [fromWalletId]
  const rows = await query<{
    id: string
    balance: number
    status: string
    currency: string
  }>(
    `SELECT id, balance, status, currency FROM wallets WHERE id = ANY($1::uuid[])`,
    [ids]
  )

  const from = rows.find((r) => r.id === fromWalletId)
  const to = toWalletId ? rows.find((r) => r.id === toWalletId) : undefined

  if (!from) return { reason: 'WALLET_NOT_FOUND', detail: { wallet: 'source' } }
  if (toWalletId && !to) {
    return { reason: 'WALLET_NOT_FOUND', detail: { wallet: 'destination' } }
  }
  if (from.status !== 'active') {
    return { reason: 'WALLET_NOT_ACTIVE', detail: { wallet: 'source', status: from.status } }
  }
  if (to && to.status !== 'active') {
    return {
      reason: 'WALLET_NOT_ACTIVE',
      detail: { wallet: 'destination', status: to.status },
    }
  }
  if (currency && to && from.currency !== to.currency) {
    return {
      reason: 'CURRENCY_MISMATCH',
      detail: { from: from.currency, to: to.currency },
    }
  }
  if (from.balance < required) {
    return {
      reason: 'INSUFFICIENT_FUNDS',
      detail: { balance: from.balance, required },
    }
  }
  // Nothing explains it — the state changed underneath us. Report it as a
  // funds problem, which is the only outcome the caller can act on.
  return { reason: 'INSUFFICIENT_FUNDS', detail: { balance: from.balance, required } }
}

// ---------------------------------------------------------------------------
// Transfer
// ---------------------------------------------------------------------------

export interface TransferParams {
  fromWalletId: string
  toWalletId: string
  /** Amount credited to the recipient, in the smallest denomination unit. */
  amount: number
  /** Protocol fee, debited from the sender on top of `amount`. */
  fee: number
  /** `transactions.protocol` — 'x402', 'a2a', … */
  protocol: string
  /** `transactions.type` — 'transfer', 'payment', … */
  type: string
  txHash: string
  metadata?: Record<string, unknown>
}

export interface TransferOutcome {
  fromBalance: number
  toBalance: number
  transactionId: string
}

/**
 * Debit the sender, credit the recipient, and write the double-entry rows —
 * all or nothing.
 *
 * The sender pays `amount + fee`; the recipient receives `amount`. The fee is
 * recorded as its own `fee_debit` row so the ledger still balances.
 */
export async function transferFunds(
  params: TransferParams
): Promise<LedgerResult<TransferOutcome>> {
  const { fromWalletId, toWalletId, amount, fee, protocol, type, txHash } = params
  const metadata = JSON.stringify(params.metadata ?? {})
  const total = amount + fee

  if (fromWalletId === toWalletId) {
    return { ok: false, reason: 'WALLET_NOT_FOUND', detail: { wallet: 'same' } }
  }

  const rows = await query<TransferRow>(
    `
    WITH target AS (
      SELECT s.id AS from_id, r.id AS to_id
        FROM wallets s
        JOIN wallets r ON r.id = $2::uuid
       WHERE s.id = $1::uuid
         AND s.status = 'active'
         AND r.status = 'active'
         AND s.currency = r.currency
    ),
    debited AS (
      UPDATE wallets w
         SET balance = w.balance - $3::bigint,
             updated_at = NOW()
        FROM target t
       WHERE w.id = t.from_id
         AND w.balance >= $3::bigint
      RETURNING w.id, w.balance
    ),
    credited AS (
      UPDATE wallets w
         SET balance = w.balance + $4::bigint,
             updated_at = NOW()
        FROM target t
       WHERE w.id = t.to_id
         AND (SELECT count(*) FROM debited) = 1
      RETURNING w.id, w.balance
    ),
    tx_debit AS (
      INSERT INTO transactions
        (wallet_id, counterparty_wallet_id, type, amount, fee, status,
         ledger_entry, tx_hash, protocol, metadata, confirmed_at)
      SELECT t.from_id, t.to_id, $5, $4::bigint, $6::bigint, 'confirmed',
             'debit', $7, $8, $9::jsonb, NOW()
        FROM target t
       WHERE (SELECT count(*) FROM credited) = 1
      RETURNING id
    ),
    tx_credit AS (
      INSERT INTO transactions
        (wallet_id, counterparty_wallet_id, type, amount, fee, status,
         ledger_entry, tx_hash, protocol, metadata, confirmed_at)
      SELECT t.to_id, t.from_id, $5, $4::bigint, 0, 'confirmed',
             'credit', $7, $8, $9::jsonb, NOW()
        FROM target t
       WHERE (SELECT count(*) FROM credited) = 1
      RETURNING id
    ),
    tx_fee AS (
      INSERT INTO transactions
        (wallet_id, counterparty_wallet_id, type, amount, fee, status,
         ledger_entry, tx_hash, protocol, metadata, confirmed_at)
      SELECT t.from_id, NULL, 'fee', 0, $6::bigint, 'confirmed',
             'fee_debit', $7, $8, $9::jsonb, NOW()
        FROM target t
       WHERE $6::bigint > 0 AND (SELECT count(*) FROM credited) = 1
      RETURNING id
    )
    SELECT (SELECT balance FROM debited)  AS from_balance,
           (SELECT balance FROM credited) AS to_balance,
           (SELECT id::text FROM tx_debit) AS debit_tx_id,
           (SELECT count(*) FROM tx_fee)   AS fee_rows
    `,
    [fromWalletId, toWalletId, total, amount, type, fee, txHash, protocol, metadata]
  )

  const row = rows[0]
  if (!row || row.from_balance === null || row.to_balance === null) {
    return { ok: false, ...(await diagnose(fromWalletId, toWalletId, total, 'check')) }
  }

  return {
    ok: true,
    fromBalance: row.from_balance,
    toBalance: row.to_balance,
    transactionId: row.debit_tx_id as string,
  }
}

// ---------------------------------------------------------------------------
// Faucet
// ---------------------------------------------------------------------------

export interface FaucetParams {
  agentId: string
  walletId: string
  amount: number
  cooldownHours: number
  txHash: string
}

export interface FaucetOutcome {
  balance: number
  claimedAt: string
}

/**
 * Credit testnet funds, enforcing the cooldown inside the same statement.
 *
 * Checking the last claim in application code and then inserting left a window
 * where two simultaneous requests both passed the check and both paid out. The
 * `NOT EXISTS` guard here is evaluated as part of the write, so the second
 * request matches no rows.
 */
export async function claimFaucet(
  params: FaucetParams
): Promise<LedgerResult<FaucetOutcome>> {
  const { agentId, walletId, amount, cooldownHours, txHash } = params

  const rows = await query<{
    balance: number | null
    claimed_at: string | null
    blocked_until: string | null
  }>(
    `
    WITH last_claim AS (
      SELECT claimed_at + ($4::int * INTERVAL '1 hour') AS next_allowed
        FROM faucet_claims
       WHERE agent_id = $1::uuid
       ORDER BY claimed_at DESC
       LIMIT 1
    ),
    eligible AS (
      SELECT $2::uuid AS wallet_id
       WHERE EXISTS (
               SELECT 1 FROM wallets
                WHERE id = $2::uuid AND agent_id = $1::uuid AND status = 'active'
             )
         AND NOT EXISTS (SELECT 1 FROM last_claim WHERE next_allowed > NOW())
    ),
    credited AS (
      UPDATE wallets w
         SET balance = w.balance + $3::bigint,
             updated_at = NOW()
        FROM eligible e
       WHERE w.id = e.wallet_id
      RETURNING w.balance
    ),
    claim AS (
      INSERT INTO faucet_claims (agent_id, amount)
      SELECT $1::uuid, $3::bigint
        FROM eligible
       WHERE (SELECT count(*) FROM credited) = 1
      RETURNING claimed_at
    ),
    tx AS (
      INSERT INTO transactions
        (wallet_id, type, amount, fee, status, ledger_entry, tx_hash, protocol, confirmed_at)
      SELECT $2::uuid, 'deposit', $3::bigint, 0, 'confirmed', 'credit', $5, 'faucet', NOW()
       WHERE (SELECT count(*) FROM credited) = 1
      RETURNING id
    )
    SELECT (SELECT balance FROM credited)          AS balance,
           (SELECT claimed_at::text FROM claim)    AS claimed_at,
           (SELECT next_allowed::text FROM last_claim) AS blocked_until
    `,
    [agentId, walletId, amount, cooldownHours, txHash]
  )

  const row = rows[0]
  if (!row || row.balance === null) {
    if (row?.blocked_until && new Date(row.blocked_until) > new Date()) {
      return {
        ok: false,
        reason: 'COOLDOWN_ACTIVE',
        detail: { retry_after: row.blocked_until },
      }
    }
    return { ok: false, ...(await diagnose(walletId, null, 0)) }
  }

  return { ok: true, balance: row.balance, claimedAt: row.claimed_at as string }
}

// ---------------------------------------------------------------------------
// Escrow
// ---------------------------------------------------------------------------

export interface EscrowLockParams {
  buyerWalletId: string
  escrowWalletId: string
  buyerAgentId: string
  sellerAgentId: string
  serviceId: string
  amount: number
  txHash: string
}

/** Move funds from the buyer's custody wallet into their escrow wallet. */
export async function lockEscrow(
  params: EscrowLockParams
): Promise<LedgerResult<{ escrowId: string; buyerBalance: number }>> {
  const {
    buyerWalletId,
    escrowWalletId,
    buyerAgentId,
    sellerAgentId,
    serviceId,
    amount,
    txHash,
  } = params

  const rows = await query<{
    escrow_id: string | null
    buyer_balance: number | null
  }>(
    `
    WITH debited AS (
      UPDATE wallets w
         SET balance = w.balance - $3::bigint, updated_at = NOW()
       WHERE w.id = $1::uuid
         AND w.status = 'active'
         AND w.balance >= $3::bigint
      RETURNING w.balance
    ),
    held AS (
      UPDATE wallets w
         SET balance = w.balance + $3::bigint, updated_at = NOW()
       WHERE w.id = $2::uuid
         AND (SELECT count(*) FROM debited) = 1
      RETURNING w.balance
    ),
    order_row AS (
      INSERT INTO escrow_orders
        (buyer_agent_id, seller_agent_id, service_id, amount, status)
      SELECT $4::uuid, $5::uuid, $6::uuid, $3::bigint, 'locked'
       WHERE (SELECT count(*) FROM held) = 1
      RETURNING id
    ),
    tx AS (
      INSERT INTO transactions
        (wallet_id, counterparty_wallet_id, type, amount, fee, status,
         ledger_entry, tx_hash, protocol, confirmed_at)
      SELECT $1::uuid, $2::uuid, 'escrow', $3::bigint, 0, 'confirmed',
             'debit', $7, 'escrow', NOW()
       WHERE (SELECT count(*) FROM order_row) = 1
      RETURNING id
    )
    SELECT (SELECT id::text FROM order_row) AS escrow_id,
           (SELECT balance FROM debited)    AS buyer_balance
    `,
    [
      buyerWalletId,
      escrowWalletId,
      amount,
      buyerAgentId,
      sellerAgentId,
      serviceId,
      txHash,
    ]
  )

  const row = rows[0]
  if (!row || row.escrow_id === null || row.buyer_balance === null) {
    return { ok: false, ...(await diagnose(buyerWalletId, escrowWalletId, amount)) }
  }
  return { ok: true, escrowId: row.escrow_id, buyerBalance: row.buyer_balance }
}

export interface EscrowSettleParams {
  escrowId: string
  escrowWalletId: string
  destinationWalletId: string
  amount: number
  txHash: string
  /** 'released' pays the seller; 'refunded' returns funds to the buyer. */
  outcome: 'released' | 'refunded'
}

/**
 * Settle a held escrow.
 *
 * The status transition is part of the guard: the UPDATE only matches an order
 * still in `locked`, so a double release cannot pay out twice however many
 * requests arrive at once.
 */
export async function settleEscrow(
  params: EscrowSettleParams
): Promise<LedgerResult<{ destinationBalance: number }>> {
  const { escrowId, escrowWalletId, destinationWalletId, amount, txHash, outcome } =
    params
  const timestampColumn = outcome === 'released' ? 'released_at' : 'refunded_at'

  const rows = await query<{ destination_balance: number | null }>(
    `
    WITH settled AS (
      UPDATE escrow_orders
         SET status = $5, ${timestampColumn} = NOW()
       WHERE id = $1::uuid AND status = 'locked'
      RETURNING id, amount
    ),
    debited AS (
      UPDATE wallets w
         SET balance = w.balance - $4::bigint, updated_at = NOW()
       WHERE w.id = $2::uuid
         AND w.balance >= $4::bigint
         AND (SELECT count(*) FROM settled) = 1
      RETURNING w.balance
    ),
    credited AS (
      UPDATE wallets w
         SET balance = w.balance + $4::bigint, updated_at = NOW()
       WHERE w.id = $3::uuid
         AND (SELECT count(*) FROM debited) = 1
      RETURNING w.balance
    ),
    tx AS (
      INSERT INTO transactions
        (wallet_id, counterparty_wallet_id, type, amount, fee, status,
         ledger_entry, tx_hash, protocol, confirmed_at)
      SELECT $3::uuid, $2::uuid,
             CASE WHEN $5 = 'released' THEN 'escrow_release' ELSE 'escrow_refund' END,
             $4::bigint, 0, 'confirmed', 'credit', $6, 'escrow', NOW()
       WHERE (SELECT count(*) FROM credited) = 1
      RETURNING id
    )
    SELECT (SELECT balance FROM credited) AS destination_balance
    `,
    [escrowId, escrowWalletId, destinationWalletId, amount, outcome, txHash]
  )

  const row = rows[0]
  if (!row || row.destination_balance === null) {
    return {
      ok: false,
      ...(await diagnose(escrowWalletId, destinationWalletId, amount)),
    }
  }
  return { ok: true, destinationBalance: row.destination_balance }
}

// ---------------------------------------------------------------------------
// Idempotency
// ---------------------------------------------------------------------------

export type IdempotentOutcome<T> =
  | { status: 'executed'; value: T }
  | { status: 'replayed'; value: T }
  | { status: 'in_flight' }

/**
 * Run a money operation at most once per idempotency key.
 *
 * The routes previously kept replayed responses in a module-level Map. On
 * Vercel that is worthless: each invocation may be a fresh process, so the map
 * is almost always empty and a retried request simply executes the transfer
 * again — the exact double-spend the header exists to prevent. State has to
 * live in the database.
 *
 * The reservation is an `ON CONFLICT DO NOTHING ... RETURNING`, so exactly one
 * caller can win it. A second request arriving while the first is still
 * running gets `in_flight` rather than a stale or empty response; retrying
 * after the first completes returns the stored result.
 */
export async function withIdempotency<T>(
  keyHash: string | null,
  operation: () => Promise<T>
): Promise<IdempotentOutcome<T>> {
  if (!keyHash) {
    return { status: 'executed', value: await operation() }
  }

  const reserved = await query<{ key_hash: string }>(
    `INSERT INTO idempotency_keys (key_hash, response, expires_at)
     VALUES ($1, '', NOW() + INTERVAL '24 hours')
     ON CONFLICT (key_hash) DO NOTHING
     RETURNING key_hash`,
    [keyHash]
  )

  if (reserved.length === 0) {
    const stored = await query<{ response: string }>(
      `SELECT response FROM idempotency_keys
        WHERE key_hash = $1 AND expires_at > NOW()`,
      [keyHash]
    )
    const response = stored[0]?.response
    if (!response) return { status: 'in_flight' }
    return { status: 'replayed', value: JSON.parse(response) as T }
  }

  try {
    const value = await operation()
    await query(
      `UPDATE idempotency_keys SET response = $2 WHERE key_hash = $1`,
      [keyHash, JSON.stringify(value)]
    )
    return { status: 'executed', value }
  } catch (err) {
    // Release the reservation so a retry is not permanently wedged behind a
    // key whose operation never produced a result.
    await query(`DELETE FROM idempotency_keys WHERE key_hash = $1`, [
      keyHash,
    ]).catch(() => {})
    throw err
  }
}
