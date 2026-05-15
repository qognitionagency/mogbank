/**
 * Faucet Controller
 *
 * Distributes testnet USDC to newly registered agents and developers
 * for testing the ABOS protocol. Rate-limited by wallet address.
 */
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '../services/database';
import { PoolClient } from 'pg';
import { broadcastBalanceUpdate } from '../services/streaming';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { config } from '../config';

/**
 * Claim faucet USDC for a wallet.
 *
 * POST /api/v1/faucet
 */
export async function claimFaucet(req: Request, res: Response): Promise<void> {
  const { wallet_id, amount } = req.body;

  if (!wallet_id) {
    throw new AppError(400, 'MISSING_WALLET_ID', 'wallet_id is required');
  }

  const claimAmount = Math.min(
    typeof amount === 'number' && amount > 0 ? amount : config.faucet.defaultAmount,
    config.faucet.defaultAmount
  );

  const result = await withTransaction(async (client: PoolClient) => {
    // Verify wallet exists
    const { rows: [wallet] } = await client.query(
      `SELECT id, agent_id, balance, status FROM wallets WHERE id = $1 FOR UPDATE`,
      [wallet_id]
    );

    if (!wallet) {
      throw new AppError(404, 'WALLET_NOT_FOUND', 'Wallet not found');
    }
    if (wallet.status !== 'active') {
      throw new AppError(403, 'WALLET_INACTIVE', `Wallet is ${wallet.status}`);
    }

    // Check daily limit per wallet
    const today = new Date().toISOString().split('T')[0];
    const { rows: dailyClaims } = await client.query(
      `SELECT COALESCE(SUM(amount), 0) as total_claimed
       FROM transactions
       WHERE wallet_id = $1
         AND type = 'faucet_claim'
         AND confirmed_at::date = $2`,
      [wallet_id, today]
    );

    const claimedToday = parseFloat(dailyClaims[0]?.total_claimed || '0');
    if (claimedToday + claimAmount > config.faucet.dailyLimit) {
      throw new AppError(429, 'FAUCET_DAILY_LIMIT', `Daily faucet limit of ${config.faucet.dailyLimit} USDC exceeded`);
    }

    // Update wallet balance
    const newBalance = wallet.balance + claimAmount;
    const now = new Date().toISOString();

    await client.query(
      `UPDATE wallets SET balance = $1, updated_at = $2 WHERE id = $3`,
      [newBalance, now, wallet_id]
    );

    // Create ledger entry
    const ledgerId = uuidv4();
    const txId = uuidv4();
    await client.query(
      `INSERT INTO ledger_entries (id, transaction_id, wallet_id, entry_type, amount, currency, description, balance_after, created_at)
       VALUES ($1, $2, $3, 'credit', $4, 'USDC', 'Faucet claim', $5, $6)`,
      [ledgerId, txId, wallet_id, claimAmount, newBalance, now]
    );

    // Record transaction
    await client.query(
      `INSERT INTO transactions (id, wallet_id, type, amount, fee, status, confirmed_at, created_at, updated_at)
       VALUES ($1, $2, 'faucet_claim', $3, 0, 'confirmed', $4, $4, $4)`,
      [txId, wallet_id, claimAmount, now]
    );

    return { newBalance, txId, claimAmount };
  });

  // Broadcast balance update
  broadcastBalanceUpdate({
    walletId: wallet_id,
    balance: result.newBalance,
    currency: 'USDC',
    timestamp: new Date().toISOString(),
    transactionType: 'faucet_claim',
  });

  logger.info('Faucet claimed', {
    walletId: wallet_id,
    amount: result.claimAmount,
    newBalance: result.newBalance,
  });

  res.status(201).json({
    success: true,
    claim: {
      tx_id: result.txId,
      wallet_id,
      amount: result.claimAmount,
      currency: 'USDC',
      new_balance: result.newBalance,
      created_at: new Date().toISOString(),
    },
  });
}

/**
 * Get faucet status for a wallet (daily remaining).
 *
 * GET /api/v1/faucet/status/:walletId
 */
export async function getFaucetStatus(req: Request, res: Response): Promise<void> {
  const { walletId } = req.params;

  const { rows: [wallet] } = await query(
    `SELECT id, status FROM wallets WHERE id = $1`,
    [walletId]
  );

  if (!wallet) {
    throw new AppError(404, 'WALLET_NOT_FOUND', 'Wallet not found');
  }

  const today = new Date().toISOString().split('T')[0];
  const { rows: dailyClaims } = await query(
    `SELECT COALESCE(SUM(amount), 0) as total_claimed
     FROM transactions
     WHERE wallet_id = $1
       AND type = 'faucet_claim'
       AND confirmed_at::date = $2`,
    [walletId, today]
  );

  const claimedToday = parseFloat(dailyClaims[0]?.total_claimed || '0');
  const remaining = Math.max(0, config.faucet.dailyLimit - claimedToday);

  res.json({
    success: true,
    faucet_status: {
      wallet_id: walletId,
      daily_limit: config.faucet.dailyLimit,
      claimed_today: claimedToday,
      remaining_today: remaining,
      max_per_claim: config.faucet.defaultAmount,
    },
  });
}