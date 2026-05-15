/**
 * Wallet Controller
 *
 * Manages agent wallets, balance queries, and ledger entry retrieval.
 */
import { Request, Response } from 'express';
import { query } from '../services/database';
import { getLedgerEntries } from '../services/ledger';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

/**
 * Get wallet details by ID.
 *
 * GET /api/v1/wallets/:id
 */
export async function getWallet(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const { rows } = await query(
    `SELECT w.*, a.name as agent_name, a.kya_score, a.kya_status
     FROM wallets w
     LEFT JOIN agents a ON a.id = w.agent_id
     WHERE w.id = $1`,
    [id]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'WALLET_NOT_FOUND', 'Wallet not found');
  }

  const wallet = rows[0];
  res.json({
    success: true,
    wallet: {
      id: wallet.id,
      agent_id: wallet.agent_id,
      agent_name: wallet.agent_name,
      address: wallet.address,
      balance: wallet.balance,
      currency: wallet.currency,
      status: wallet.status,
      kya_score: wallet.kya_score,
      created_at: wallet.created_at,
    },
  });
}

/**
 * Get wallet by agent ID.
 *
 * GET /api/v1/wallets/agent/:agentId
 */
export async function getWalletByAgent(req: Request, res: Response): Promise<void> {
  const { agentId } = req.params;

  const { rows } = await query(
    `SELECT w.*, a.name as agent_name
     FROM wallets w
     LEFT JOIN agents a ON a.id = w.agent_id
     WHERE w.agent_id = $1`,
    [agentId]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'WALLET_NOT_FOUND', 'No wallet found for this agent');
  }

  res.json({
    success: true,
    wallets: rows.map((w) => ({
      id: w.id,
      agent_id: w.agent_id,
      agent_name: w.agent_name,
      address: w.address,
      balance: w.balance,
      currency: w.currency,
      status: w.status,
      created_at: w.created_at,
    })),
  });
}

/**
 * Get wallet balance.
 *
 * GET /api/v1/wallets/:id/balance
 */
export async function getWalletBalance(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const { rows } = await query(
    `SELECT id, balance, currency, status FROM wallets WHERE id = $1`,
    [id]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'WALLET_NOT_FOUND', 'Wallet not found');
  }

  res.json({
    success: true,
    wallet_id: id,
    balance: rows[0].balance,
    currency: rows[0].currency,
    status: rows[0].status,
  });
}

/**
 * Get wallet transaction history.
 *
 * GET /api/v1/wallets/:id/transactions
 */
export async function getWalletTransactions(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { limit = '50', offset = '0' } = req.query;

  // Verify wallet exists
  const { rows: [wallet] } = await query(
    `SELECT id FROM wallets WHERE id = $1`,
    [id]
  );

  if (!wallet) {
    throw new AppError(404, 'WALLET_NOT_FOUND', 'Wallet not found');
  }

  const { rows } = await query(
    `SELECT * FROM transactions
     WHERE wallet_id = $1 OR counterparty_wallet_id = $1
     ORDER BY created_at DESC
     LIMIT $2 OFFSET $3`,
    [id, parseInt(limit as string, 10), parseInt(offset as string, 10)]
  );

  res.json({
    success: true,
    transactions: rows,
    pagination: { limit: parseInt(limit as string), offset: parseInt(offset as string) },
  });
}

/**
 * Get wallet ledger entries.
 *
 * GET /api/v1/wallets/:id/ledger
 */
export async function getWalletLedger(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { limit = '50', offset = '0' } = req.query;

  const { rows: [wallet] } = await query(
    `SELECT id FROM wallets WHERE id = $1`,
    [id]
  );

  if (!wallet) {
    throw new AppError(404, 'WALLET_NOT_FOUND', 'Wallet not found');
  }

  const entries = await getLedgerEntries(id, parseInt(limit as string, 10), parseInt(offset as string, 10));

  res.json({
    success: true,
    ledger_entries: entries,
    pagination: { limit: parseInt(limit as string), offset: parseInt(offset as string) },
  });
}

/**
 * List all wallets (admin).
 *
 * GET /api/v1/admin/wallets
 */
export async function listWallets(req: Request, res: Response): Promise<void> {
  const { limit = '50', offset = '0', status } = req.query;

  let sql = `SELECT w.*, a.name as agent_name 
             FROM wallets w LEFT JOIN agents a ON a.id = w.agent_id`;
  const params: any[] = [];

  if (status) {
    params.push(status);
    sql += ` WHERE w.status = $${params.length}`;
  }

  sql += ` ORDER BY w.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

  const { rows } = await query(sql, params);

  res.json({
    success: true,
    wallets: rows.map((w) => ({
      id: w.id,
      agent_id: w.agent_id,
      agent_name: w.agent_name,
      address: w.address,
      balance: w.balance,
      currency: w.currency,
      status: w.status,
      created_at: w.created_at,
    })),
    pagination: { limit: parseInt(limit as string), offset: parseInt(offset as string) },
  });
}