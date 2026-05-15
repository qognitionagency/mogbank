/**
 * Marketplace Controller
 *
 * Manages the ABOS service marketplace where agents can discover,
 * list, and purchase services from other agents using x402.
 */
import { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, withTransaction } from '../services/database';
import { PoolClient } from 'pg';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';

/**
 * List available services in the marketplace.
 *
 * GET /api/v1/marketplace/services
 */
export async function listServices(req: Request, res: Response): Promise<void> {
  const { limit = '50', offset = '0', type, min_kya, search } = req.query;

  let sql = `SELECT s.*, a.name as agent_name, a.kya_score, a.kya_status
             FROM marketplace_services s
             JOIN agents a ON a.id = s.agent_id
             WHERE s.active = true`;
  const params: any[] = [];

  if (type) {
    params.push(type);
    sql += ` AND s.service_type = $${params.length}`;
  }

  if (min_kya) {
    params.push(parseInt(min_kya as string, 10));
    sql += ` AND a.kya_score >= $${params.length}`;
  }

  if (search) {
    params.push(`%${search}%`);
    sql += ` AND (s.name ILIKE $${params.length} OR s.description ILIKE $${params.length})`;
  }

  sql += ` ORDER BY a.kya_score DESC, s.created_at DESC
           LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
  params.push(parseInt(limit as string, 10), parseInt(offset as string, 10));

  const { rows } = await query(sql, params);

  res.json({
    success: true,
    services: rows.map((s) => ({
      id: s.id,
      agent_id: s.agent_id,
      agent_name: s.agent_name,
      agent_kya_score: s.kya_score,
      name: s.name,
      description: s.description,
      service_type: s.service_type,
      price_per_call: s.price_per_call,
      currency: s.currency || 'USDC',
      endpoint_url: s.endpoint_url,
      openapi_schema: s.openapi_schema,
      calls_completed: s.calls_completed,
      rating: s.rating,
      created_at: s.created_at,
    })),
    pagination: { limit: parseInt(limit as string), offset: parseInt(offset as string) },
  });
}

/**
 * Get a single marketplace service.
 *
 * GET /api/v1/marketplace/services/:id
 */
export async function getService(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const { rows } = await query(
    `SELECT s.*, a.name as agent_name, a.kya_score, a.kya_status, a.framework
     FROM marketplace_services s
     JOIN agents a ON a.id = s.agent_id
     WHERE s.id = $1`,
    [id]
  );

  if (rows.length === 0) {
    throw new AppError(404, 'SERVICE_NOT_FOUND', 'Marketplace service not found');
  }

  const s = rows[0];
  res.json({
    success: true,
    service: {
      id: s.id,
      agent_id: s.agent_id,
      agent: {
        name: s.agent_name,
        kya_score: s.kya_score,
        kya_status: s.kya_status,
        framework: s.framework,
      },
      name: s.name,
      description: s.description,
      service_type: s.service_type,
      price_per_call: s.price_per_call,
      currency: s.currency || 'USDC',
      endpoint_url: s.endpoint_url,
      openapi_schema: s.openapi_schema,
      calls_completed: s.calls_completed,
      rating: s.rating,
      active: s.active,
      created_at: s.created_at,
      updated_at: s.updated_at,
    },
  });
}

/**
 * Register a new service in the marketplace.
 *
 * POST /api/v1/marketplace/services
 */
export async function registerService(req: Request, res: Response): Promise<void> {
  const {
    agent_id,
    name,
    description,
    service_type,
    price_per_call,
    currency,
    endpoint_url,
    openapi_schema,
  } = req.body;

  if (!agent_id || !name || !service_type || !price_per_call || !endpoint_url) {
    throw new AppError(400, 'MISSING_REQUIRED_FIELDS', 'agent_id, name, service_type, price_per_call, and endpoint_url are required');
  }

  // Verify agent exists and is active
  const { rows: [agent] } = await query(
    `SELECT id, status FROM agents WHERE id = $1`,
    [agent_id]
  );

  if (!agent) {
    throw new AppError(404, 'AGENT_NOT_FOUND', 'Agent not found');
  }
  if (agent.status !== 'active') {
    throw new AppError(403, 'AGENT_NOT_ACTIVE', 'Agent must be active to register services');
  }

  const serviceId = uuidv4();
  const now = new Date().toISOString();

  await query(
    `INSERT INTO marketplace_services (id, agent_id, name, description, service_type, price_per_call, currency, endpoint_url, openapi_schema, active, calls_completed, rating, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, true, 0, 0.0, $10, $10)`,
    [serviceId, agent_id, name, description, service_type, price_per_call, currency || 'USDC', endpoint_url, openapi_schema || null, now]
  );

  logger.info('Marketplace service registered', { serviceId, agentId: agent_id, name });

  res.status(201).json({
    success: true,
    service: {
      id: serviceId,
      agent_id,
      name,
      service_type,
      price_per_call,
      currency: currency || 'USDC',
      endpoint_url,
      created_at: now,
    },
  });
}

/**
 * Update a marketplace service.
 *
 * PUT /api/v1/marketplace/services/:id
 */
export async function updateService(req: Request, res: Response): Promise<void> {
  const { id } = req.params;
  const { name, description, price_per_call, endpoint_url, active } = req.body;

  const { rows } = await query(`SELECT id FROM marketplace_services WHERE id = $1`, [id]);
  if (rows.length === 0) {
    throw new AppError(404, 'SERVICE_NOT_FOUND', 'Marketplace service not found');
  }

  const updates: string[] = [];
  const params: any[] = [];

  if (name !== undefined) { updates.push(`name = $${params.length + 1}`); params.push(name); }
  if (description !== undefined) { updates.push(`description = $${params.length + 1}`); params.push(description); }
  if (price_per_call !== undefined) { updates.push(`price_per_call = $${params.length + 1}`); params.push(price_per_call); }
  if (endpoint_url !== undefined) { updates.push(`endpoint_url = $${params.length + 1}`); params.push(endpoint_url); }
  if (active !== undefined) { updates.push(`active = $${params.length + 1}`); params.push(active); }

  if (updates.length > 0) {
    updates.push(`updated_at = $${params.length + 1}`);
    params.push(new Date().toISOString());
    params.push(id);
    await query(`UPDATE marketplace_services SET ${updates.join(', ')} WHERE id = $${params.length}`, params);
  }

  const { rows: [updated] } = await query(
    `SELECT * FROM marketplace_services WHERE id = $1`, [id]
  );

  logger.info('Marketplace service updated', { serviceId: id });

  res.json({ success: true, service: updated });
}

/**
 * Escrow — hold funds for a marketplace service call.
 *
 * POST /api/v1/marketplace/escrow
 */
export async function createEscrow(req: Request, res: Response): Promise<void> {
  const {
    service_id,
    buyer_wallet_id,
    amount,
    idempotency_key,
  } = req.body;

  if (!service_id || !buyer_wallet_id || !amount) {
    throw new AppError(400, 'MISSING_REQUIRED_FIELDS', 'service_id, buyer_wallet_id, and amount are required');
  }

  // Verify service exists
  const { rows: [service] } = await query(
    `SELECT s.*, w.id as seller_wallet_id
     FROM marketplace_services s
     JOIN wallets w ON w.agent_id = s.agent_id
     WHERE s.id = $1 AND s.active = true`,
    [service_id]
  );

  if (!service) {
    throw new AppError(404, 'SERVICE_NOT_FOUND', 'Marketplace service not found or inactive');
  }

  const escrowId = uuidv4();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24 hours

  await query(
    `INSERT INTO escrow (id, service_id, buyer_wallet_id, seller_wallet_id, amount, currency, status, expires_at, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, 'USDC', 'held', $6, $7, $7)`,
    [escrowId, service_id, buyer_wallet_id, service.seller_wallet_id, amount, expiresAt, now]
  );

  logger.info('Escrow created', { escrowId, serviceId: service_id, amount });

  res.status(201).json({
    success: true,
    escrow: {
      id: escrowId,
      service_id,
      buyer_wallet_id,
      seller_wallet_id: service.seller_wallet_id,
      amount,
      currency: 'USDC',
      status: 'held',
      expires_at: expiresAt,
      created_at: now,
    },
  });
}

/**
 * Release escrow after service call completion.
 *
 * POST /api/v1/marketplace/escrow/:id/release
 */
export async function releaseEscrow(req: Request, res: Response): Promise<void> {
  const { id } = req.params;

  const result = await withTransaction(async (client: PoolClient) => {
    const { rows } = await client.query(
      `SELECT * FROM escrow WHERE id = $1 FOR UPDATE`, [id]
    );

    if (rows.length === 0) {
      throw new AppError(404, 'ESCROW_NOT_FOUND', 'Escrow not found');
    }

    const escrow = rows[0];
    if (escrow.status !== 'held') {
      throw new AppError(409, 'ESCROW_INVALID_STATE', `Escrow is ${escrow.status}, not held`);
    }

    // Transfer from buyer to seller
    const now = new Date().toISOString();

    // Update wallet balances
    await client.query(
      `UPDATE wallets SET balance = balance - $1, updated_at = $3 WHERE id = $2`,
      [escrow.amount, escrow.buyer_wallet_id, now]
    );
    await client.query(
      `UPDATE wallets SET balance = balance + $1, updated_at = $3 WHERE id = $2`,
      [escrow.amount, escrow.seller_wallet_id, now]
    );

    // Update escrow status
    await client.query(
      `UPDATE escrow SET status = 'released', updated_at = $2 WHERE id = $1`,
      [id, now]
    );

    // Increment service call count
    await client.query(
      `UPDATE marketplace_services SET calls_completed = calls_completed + 1, updated_at = $2 WHERE id = $1`,
      [escrow.service_id, now]
    );

    return escrow;
  });

  logger.info('Escrow released', { escrowId: id });

  res.json({
    success: true,
    escrow: { ...result, status: 'released' },
  });
}