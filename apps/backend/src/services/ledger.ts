/**
 * Double-Entry Ledger Service
 *
 * Implements proper double-entry accounting for all agent financial operations.
 * Every transaction creates at least two ledger entries (debit + credit).
 * Uses PostgreSQL transactions for atomicity.
 */
import { v4 as uuidv4 } from 'uuid';
import { withTransaction, checkIdempotencyKey, storeIdempotencyKey } from './database';
import { hashIdempotencyKey } from './crypto';
import { logger } from '../utils/logger';
import { PoolClient } from 'pg';

export interface LedgerEntry {
  id: string;
  transaction_id: string;
  wallet_id: string;
  entry_type: 'debit' | 'credit';
  amount: number;
  currency: string;
  description: string;
  balance_after: number;
  created_at: string;
}

export interface TransferParams {
  fromWalletId: string;
  toWalletId: string;
  amount: number;
  fee: number;
  protocol: string;
  txHash: string;
  idempotencyKey?: string;
  mandateSignature?: string;
  mandatePayload?: Record<string, unknown>;
}

export interface TransferResult {
  success: boolean;
  txHash: string;
  fromEntry: LedgerEntry;
  toEntry: LedgerEntry;
  feeEntry?: LedgerEntry;
  isDuplicate: boolean;
}

/**
 * Execute a double-entry transfer within a database transaction.
 *
 * Entries created:
 * 1. DEBIT sender wallet (balance decreases)
 * 2. CREDIT recipient wallet (balance increases)
 * 3. DEBIT sender wallet for fee (if fee > 0)
 */
export async function executeDoubleEntryTransfer(
  params: TransferParams
): Promise<TransferResult> {
  const {
    fromWalletId,
    toWalletId,
    amount,
    fee,
    protocol,
    txHash,
    idempotencyKey,
  } = params;

  return withTransaction(async (client: PoolClient) => {
    // --- Idempotency check ---
    if (idempotencyKey) {
      const keyHash = hashIdempotencyKey(idempotencyKey);
      const existing = await checkIdempotencyKey(client, keyHash);
      if (existing) {
        logger.info('Duplicate idempotency key detected', { idempotencyKey: keyHash });
        return {
          ...JSON.parse(existing.response),
          isDuplicate: true,
        } as TransferResult;
      }

      // Lock the idempotency key row to prevent race conditions
      await client.query(
        `INSERT INTO idempotency_keys (key_hash, response, expires_at)
         VALUES ($1, '{}', NOW() + INTERVAL '24 hours')`,
        [keyHash]
      );
    }

    // --- Lock sender wallet row ---
    const { rows: [sender] } = await client.query(
      `SELECT id, balance, status FROM wallets WHERE id = $1 FOR UPDATE`,
      [fromWalletId]
    );

    if (!sender) {
      throw new Error(`Sender wallet ${fromWalletId} not found`);
    }
    if (sender.status !== 'active') {
      throw new Error(`Sender wallet ${fromWalletId} is ${sender.status}`);
    }

    // Check balance (including fee)
    const totalDeduction = amount + fee;
    if (sender.balance < totalDeduction) {
      throw new Error(
        `Insufficient balance: ${sender.balance} < ${totalDeduction}`
      );
    }

    // --- Lock recipient wallet row ---
    const { rows: [recipient] } = await client.query(
      `SELECT id, balance, status FROM wallets WHERE id = $1 FOR UPDATE`,
      [toWalletId]
    );

    if (!recipient) {
      throw new Error(`Recipient wallet ${toWalletId} not found`);
    }
    if (recipient.status !== 'active') {
      throw new Error(`Recipient wallet ${toWalletId} is ${recipient.status}`);
    }

    // --- Calculate new balances ---
    const senderNewBalance = sender.balance - totalDeduction;
    const recipientNewBalance = recipient.balance + amount;

    const transactionId = uuidv4();
    const now = new Date().toISOString();

    // --- Update wallet balances ---
    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = $2 WHERE id = $3`,
      [senderNewBalance, now, fromWalletId]
    );

    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = $2 WHERE id = $3`,
      [recipientNewBalance, now, toWalletId]
    );

    // --- Create ledger entries ---
    const debitEntry: LedgerEntry = {
      id: uuidv4(),
      transaction_id: transactionId,
      wallet_id: fromWalletId,
      entry_type: 'debit',
      amount: totalDeduction,
      currency: 'USDC',
      description: `Transfer to ${toWalletId} (${protocol})`,
      balance_after: senderNewBalance,
      created_at: now,
    };

    const creditEntry: LedgerEntry = {
      id: uuidv4(),
      transaction_id: transactionId,
      wallet_id: toWalletId,
      entry_type: 'credit',
      amount,
      currency: 'USDC',
      description: `Transfer from ${fromWalletId} (${protocol})`,
      balance_after: recipientNewBalance,
      created_at: now,
    };

    await client.query(
      `INSERT INTO ledger_entries (id, transaction_id, wallet_id, entry_type, amount, currency, description, balance_after, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [debitEntry.id, transactionId, fromWalletId, 'debit', totalDeduction, 'USDC', debitEntry.description, senderNewBalance, now]
    );

    await client.query(
      `INSERT INTO ledger_entries (id, transaction_id, wallet_id, entry_type, amount, currency, description, balance_after, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
      [creditEntry.id, transactionId, toWalletId, 'credit', amount, 'USDC', creditEntry.description, recipientNewBalance, now]
    );

    // Fee entry (if applicable)
    let feeEntry: LedgerEntry | undefined;
    if (fee > 0) {
      feeEntry = {
        id: uuidv4(),
        transaction_id: transactionId,
        wallet_id: fromWalletId,
        entry_type: 'debit',
        amount: fee,
        currency: 'USDC',
        description: `Transaction fee for transfer ${transactionId}`,
        balance_after: senderNewBalance,
        created_at: now,
      };

      await client.query(
        `INSERT INTO ledger_entries (id, transaction_id, wallet_id, entry_type, amount, currency, description, balance_after, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [feeEntry.id, transactionId, fromWalletId, 'debit', fee, 'USDC', feeEntry.description, senderNewBalance, now]
      );
    }

    // --- Record transaction ---
    await client.query(
      `INSERT INTO transactions (id, wallet_id, counterparty_wallet_id, type, amount, fee, status, protocol, tx_hash, confirmed_at, created_at, updated_at)
       VALUES ($1, $2, $3, 'transfer', $4, $5, 'confirmed', $6, $7, $8, $9, $9)`,
      [transactionId, fromWalletId, toWalletId, amount, fee, protocol, txHash, now, now]
    );

    // --- Store idempotency response ---
    const result: TransferResult = {
      success: true,
      txHash,
      fromEntry: debitEntry,
      toEntry: creditEntry,
      feeEntry,
      isDuplicate: false,
    };

    if (idempotencyKey) {
      const keyHash = hashIdempotencyKey(idempotencyKey);
      await storeIdempotencyKey(client, keyHash, result);
    }

    logger.info('Double-entry transfer completed', {
      transactionId,
      fromWalletId,
      toWalletId,
      amount,
      fee,
    });

    return result;
  });
}

/**
 * Get the current balance for a wallet from the ledger.
 * Balance = SUM(credits) - SUM(debits).
 */
export async function getLedgerBalance(
  client: PoolClient,
  walletId: string
): Promise<number> {
  const { rows } = await client.query(
    `SELECT
       COALESCE(SUM(CASE WHEN entry_type = 'credit' THEN amount ELSE 0 END), 0) -
       COALESCE(SUM(CASE WHEN entry_type = 'debit' THEN amount ELSE 0 END), 0) AS balance
     FROM ledger_entries
     WHERE wallet_id = $1`,
    [walletId]
  );
  return parseFloat(rows[0]?.balance || '0');
}

/**
 * Get all ledger entries for a wallet.
 */
export async function getLedgerEntries(
  walletId: string,
  limit: number = 50,
  offset: number = 0
): Promise<LedgerEntry[]> {
  const { query } = require('./database');
  const { rows } = await query(
    `SELECT * FROM ledger_entries
     WHERE wallet_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [walletId, limit, offset]
  );
  return rows;
}