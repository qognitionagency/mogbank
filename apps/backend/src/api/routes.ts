/**
 * API Routes
 *
 * Wires all controllers to Express router paths.
 * Applies appropriate middleware to each route group.
 */
import { Router } from 'express';
import { rateLimiter } from '../middleware/rateLimiter';
import { x402Required, x402A2AValidation } from '../protocols/x402';
import { errorHandler } from '../middleware/errorHandler';

// Controllers
import { registerAgent, getAgent, listAgents, revokeAgent } from '../controllers/agentController';
import { getWallet, getWalletByAgent, getWalletBalance, getWalletTransactions, getWalletLedger, listWallets } from '../controllers/walletController';
import { transferUsdc, getTransferStatus } from '../controllers/transferController';
import { listServices, getService, registerService, updateService, createEscrow, releaseEscrow } from '../controllers/marketplaceController';
import { claimFaucet, getFaucetStatus } from '../controllers/faucetController';

const router = Router();

// ============================================================
// Agent Routes
// ============================================================

// Register new agent (public endpoint with rate limiting)
router.post('/v1/agents/register', rateLimiter, registerAgent);

// Get agent by ID
router.get('/v1/agents/:id', getAgent);

// Revoke agent registration
router.post('/v1/agents/:id/revoke', revokeAgent);

// ============================================================
// Wallet Routes
// ============================================================

// Get wallet by agent ID
router.get('/v1/wallets/agent/:agentId', getWalletByAgent);

// Get wallet details
router.get('/v1/wallets/:id', getWallet);

// Get wallet balance
router.get('/v1/wallets/:id/balance', getWalletBalance);

// Get wallet transaction history
router.get('/v1/wallets/:id/transactions', getWalletTransactions);

// Get wallet ledger entries
router.get('/v1/wallets/:id/ledger', getWalletLedger);

// ============================================================
// Transfer Routes (x402: Payment Required)
// ============================================================

// Transfer USDC between wallets
router.post(
  '/v1/transfer',
  x402Required,
  x402A2AValidation,
  transferUsdc
);

// Get transfer status
router.get('/v1/transfer/:txHash', getTransferStatus);

// ============================================================
// Marketplace Routes
// ============================================================

// List marketplace services (public)
router.get('/v1/marketplace/services', listServices);

// Get single service
router.get('/v1/marketplace/services/:id', getService);

// Register a service
router.post('/v1/marketplace/services', rateLimiter, registerService);

// Update a service
router.put('/v1/marketplace/services/:id', updateService);

// Create escrow for service
router.post(
  '/v1/marketplace/escrow',
  x402Required,
  x402A2AValidation,
  createEscrow
);

// Release escrow
router.post('/v1/marketplace/escrow/:id/release', releaseEscrow);

// ============================================================
// Faucet Routes
// ============================================================

// Claim faucet
router.post('/v1/faucet', rateLimiter, claimFaucet);

// Get faucet status
router.get('/v1/faucet/status/:walletId', getFaucetStatus);

// ============================================================
// Admin Routes
// ============================================================

// List all agents (admin)
router.get('/v1/admin/agents', listAgents);

// List all wallets (admin)
router.get('/v1/admin/wallets', listWallets);

// Get agent transactions
// router.get('/v1/admin/transactions', listTransactions);

// ============================================================
// Health / ABOS Discovery
// ============================================================

router.get('/v1/health', (_req, res) => {
  res.json({
    status: 'ok',
    protocol: 'ABOS v1.0',
    x402_supported: true,
    timestamp: new Date().toISOString(),
  });
});

export default router;