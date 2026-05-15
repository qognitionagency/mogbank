/**
 * Transfer Controller
 *
 * Handles USDC transfers between agent wallets using the
 * double-entry ledger system with Ed25519 mandate verification.
 */
import { Request, Response } from 'express';
import { executeDoubleEntryTransfer } from '../services/ledger';
import { verifyMandateSignature } from '../services/crypto';
import { broadcastBalanceUpdate } from '../services/streaming';
import { query } from '../services/database';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

/**
 * Transfer USDC between two agent wallets.
 *
 * POST /api/v1/transfer
 */
export async function transferUsdc(req: Request, res: Response): Promise<void> {
  const {
    from_wallet_id,
    to_wallet_id,
    amount,
    idempotency_key,
    mandate,
  } = req.body;

  // Validate required fields
  if (!from_wallet_id || !to_wallet_id || !amount) {
    throw new AppError(400, 'MISSING_REQUIRED_FIELDS', 'from_wallet_id, to_wallet_id, and amount are required');
  }

  if (typeof amount !== 'number' || amount <= 0) {
    throw new AppError(400, 'INVALID_AMOUNT', 'Amount must be a positive number');
  }

  if (from_wallet_id === to_wallet_id) {
    throw new AppError(400, 'SAME_WALLET', 'Cannot transfer to the same wallet');
  }

  // Verify mandate if provided
  if (mandate) {
    const { mandate_id, signature, payload } = mandate;
    if (mandate_id && signature && payload) {
      const payloadBytes = new TextEncoder().encode(JSON.stringify(payload));
      const valid = await verifyMandateSignature(
        payloadBytes,
        signature,
        from_wallet_id
      );
      if (!valid) {
        throw new AppError(401, 'INVALID_MANDATE', 'Mandate signature verification failed');
      }
    }
  }

  // Calculate protocol fee (0.25% for x402, 0.1% default)
  const x402Payment = (req as any).x402Payment;
  const feeRate = x402Payment ? 0.0025 : 0.001;
  const fee = Math.round(amount * feeRate * 1_000_000) / 1_000_000; // 6 decimal precision

  // Execute double-entry transfer
  const result = await executeDoubleEntryTransfer({
    fromWalletId: from_wallet_id,
    toWalletId: to_wallet_id,
    amount,
    fee,
    protocol: x402Payment ? 'x402' : 'standard',
    txHash: `mogbank:${Date.now()}:${from_wallet_id.substring(0, 8)}`,
    idempotencyKey: idempotency_key,
    mandateSignature: mandate?.signature,
    mandatePayload: mandate?.payload,
  });

  // Broadcast balance updates to subscribed clients
  broadcastBalanceUpdate({
    walletId: from_wallet_id,
    balance: result.fromEntry.balance_after,
    currency: 'USDC',
    timestamp: new Date().toISOString(),
    ledgerEntryId: result.fromEntry.id,
    transactionType: 'transfer_sent',
  });

  broadcastBalanceUpdate({
    walletId: to_wallet_id,
    balance: result.toEntry.balance_after,
    currency: 'USDC',
    timestamp: new Date().toISOString(),
    ledgerEntryId: result.toEntry.id,
    transactionType: 'transfer_received',
  });

  logger.info('Transfer completed', {
    from: from_wallet_id,
    to: to_wallet_id,
    amount,
    fee,
    txHash: result.txHash,
    isDuplicate: result.isDuplicate,
  });

  res.status(result.isDuplicate ? 200 : 201).json({
    success: true,
    transfer: {
      tx_hash: result.txHash,
      from_wallet_id,
      to_wallet_id,
      amount,
      fee,
      currency: 'USDC',
      is_duplicate: result.isDuplicate,
      from_balance: result.fromEntry.balance_after,
      to_balance: result.toEntry.balance_after,
      created_at: new Date().toISOString(),
    },
  });
}

/**
 * Get transfer status by transaction hash.
 *
 * GET /api/v1/transfer/:txHash
 */
export async function getTransferStatus(req: Request, res: Response): Promise<void> {
  const { txHash } = req.params;

  const { rows } = await query(
    `SELECT * FROM transactions WHERE tx_hash = $1`,
    [txHash]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'TRANSFER_NOT_FOUND', 'Transfer not found');
  }

  const tx = rows[0];

  // Get associated ledger entries
  const { rows: ledgerEntries } = await query(
    `SELECT * FROM ledger_entries WHERE transaction_id = $1`,
    [tx.id]
  );

  res.json({
    success: true,
    transfer: {
      id: tx.id,
      tx_hash: tx.tx_hash,
      wallet_id: tx.wallet_id,
      counterparty_wallet_id: tx.counterparty_wallet_id,
      type: tx.type,
      amount: tx.amount,
      fee: tx.fee,
      status: tx.status,
      protocol: tx.protocol,
      confirmed_at: tx.confirmed_at,
      created_at: tx.created_at,
      ledger_entries: ledgerEntries,
    },
  });
}