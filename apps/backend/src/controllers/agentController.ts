/**
 * Agent Controller
 *
 * Manages agent registration, KYA-7 scoring, and wallet provisioning.
 * Implements the full ABOS v1.0 agent lifecycle.
 */
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '../services/database';
import { calculateKYAScore } from '../services/kya';
import { verifyAgentSignature } from '../services/crypto';
import { PoolClient } from 'pg';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { config } from '../config';

/**
 * Register a new AI agent with KYA-7 scoring.
 *
 * POST /api/v1/agents/register
 */
export async function registerAgent(req: Request, res: Response): Promise<void> {
  const {
    name,
    email,
    company_name,
    jurisdiction,
    framework,
    capabilities,
    endpoint_url,
    openapi_schema,
    principal_address,
    agent_type,
    public_key,
    signature,
    signed_payload,
  } = req.body;

  // Validate signature over registration request
  if (public_key && signature && signed_payload) {
    const payloadBytes = new TextEncoder().encode(JSON.stringify(signed_payload));
    const valid = await verifyAgentSignature(payloadBytes, signature, public_key);
    if (!valid) {
      throw new AppError(401, 'AUTH_INVALID_SIGNATURE', 'Registration signature verification failed');
    }
  }

  // Compute KYA-7 score
  const kyaResult = calculateKYAScore({
    email,
    company_name,
    jurisdiction,
    framework,
    capabilities,
    endpoint_url,
    openapi_schema,
    principal_address,
    agent_type,
  });

  // Create agent and wallet in a transaction
  const result = await withTransaction(async (client: PoolClient) => {
    const agentId = uuidv4();
    const walletId = uuidv4();
    const now = new Date().toISOString();

    // Check if an agent with this public key already exists
    if (public_key) {
      const { rows: existing } = await client.query(
        `SELECT id FROM agents WHERE public_key = $1`,
        [public_key]
      );
      if (existing.length > 0) {
        throw new AppError(409, 'AGENT_ALREADY_REGISTERED', 'Agent with this public key already exists');
      }
    }

    // Insert agent
    await client.query(
      `INSERT INTO agents (id, name, email, company_name, jurisdiction, framework, 
       capabilities, endpoint_url, openapi_schema, agent_type, public_key,
       kya_score, kya_status, kya_breakdown, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)`,
      [
        agentId, name, email, company_name, jurisdiction, framework,
        JSON.stringify(capabilities || []), endpoint_url, openapi_schema,
        agent_type || 'custom', public_key || null,
        kyaResult.score, kyaResult.status, JSON.stringify(kyaResult.breakdown),
        kyaResult.status === 'suspended' ? 'suspended' : 'active',
        now,
      ]
    );

    // Create default wallet with faucet funding
    const faucetAmount = config.faucet.defaultAmount;
    await client.query(
      `INSERT INTO wallets (id, agent_id, address, balance, currency, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'USDC', 'active', $5, $5)`,
      [walletId, agentId, walletId, faucetAmount, now]
    );

    // Credit ledger entry for faucet
    const ledgerId = uuidv4();
    await client.query(
      `INSERT INTO ledger_entries (id, transaction_id, wallet_id, entry_type, amount, currency, description, balance_after, created_at)
       VALUES ($1, $2, $3, 'credit', $4, 'USDC', 'Faucet initial funding', $4, $5)`,
      [ledgerId, uuidv4(), walletId, faucetAmount, now]
    );

    // Record faucet transaction
    await client.query(
      `INSERT INTO transactions (id, wallet_id, type, amount, fee, status, confirmed_at, created_at, updated_at)
       VALUES ($1, $2, 'faucet_claim', $3, 0, 'confirmed', $4, $4, $4)`,
      [uuidv4(), walletId, faucetAmount, now]
    );

    return { agentId, walletId, kyaResult, faucetAmount };
  });

  logger.info('Agent registered', {
    agentId: result.agentId,
    walletId: result.walletId,
    kyaScore: result.kyaResult.score,
    kyaStatus: result.kyaResult.status,
  });

  res.status(201).json({
    success: true,
    agent: {
      id: result.agentId,
      name,
      wallet_id: result.walletId,
      kya_score: result.kyaResult.score,
      kya_status: result.kyaResult.status,
      kya_breakdown: result.kyaResult.breakdown,
      balance: result.faucetAmount,
      currency: 'USDC',
    },
  });
}

/**
 * Get agent by ID.
 *
 * GET /api/v1/agents/:id
 */
export async function getAgent(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const { rows } = await query(
    `SELECT a.*, w.id as wallet_id, w.balance, w.address as wallet_address
     FROM agents a
     LEFT JOIN wallets w ON w.agent_id = a.id
     WHERE a.id = $1`,
    [id]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'AGENT_NOT_FOUND', 'Agent not found');
  }

  const agent = rows[0];
  res.json({
    success: true,
    agent: {
      id: agent.id,
      name: agent.name,
      email: agent.email,
      framework: agent.framework,
      capabilities: agent.capabilities,
      kya_score: agent.kya_score,
      kya_status: agent.kya_status,
      kya_breakdown: agent.kya_breakdown,
      status: agent.status,
      wallet: {
        id: agent.wallet_id,
        address: agent.wallet_address,
        balance: agent.balance,
        currency: 'USDC',
      },
      created_at: agent.created_at,
    },
  });
}

/**
 * List all agents (admin).
 *
 * GET /api/v1/admin/agents
 */
export async function listAgents(req: Request, res: Response): Promise<void> {
  const { limit = '50', offset = '0', status } = req.query;

  let sql = `SELECT a.*, w.id as wallet_id, w.balance 
             FROM agents a LEFT JOIN wallets w ON w.agent_id = a.id`;
  const params: any[] = [];

  if (status) {
    params.push(status);
    sql += ` WHERE a.status = $${params.length}`;
  }

  sql += ` ORDER BY a.created_at DESC LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

  const { rows } = await query(sql, params);

  res.json({
    success: true,
    agents: rows.map((a) => ({
      id: a.id,
      name: a.name,
      email: a.email,
      framework: a.framework,
      kya_score: a.kya_score,
      kya_status: a.kya_status,
      status: a.status,
      wallet_balance: a.balance,
      created_at: a.created_at,
    })),
    pagination: { limit: parseInt(limit as string), offset: parseInt(offset as string) },
  });
}

/**
 * Revoke agent registration.
 *
 * POST /api/v1/agents/:id/revoke
 */
export async function revokeAgent(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const { rows } = await query(`SELECT id FROM agents WHERE id = $1`, [id]);
  if (rows.length === 0) {
    throw new AppError(404, 'AGENT_NOT_FOUND', 'Agent not found');
  }

  await query(
    `UPDATE agents SET status = 'revoked', updated_at = $2 WHERE id = $1`,
    [id, new Date().toISOString()]
  );

  logger.info('Agent revoked', { agentId: id });

  res.json({ success: true, message: 'Agent revoked' });
}