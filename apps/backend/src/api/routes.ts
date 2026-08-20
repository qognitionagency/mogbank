/**
 * API Routes
 *
 * Wires all controllers to Express router paths.
 * Applies appropriate middleware to each route group.
 */
import { Router } from 'express';
import { rateLimiter } from '../middleware/rateLimiter';
import { x402Required, x402A2AValidation } from '../protocols/x402';
import { asyncHandler } from '../middleware/errorHandler';

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
router.post('/v1/agents/register', rateLimiter, asyncHandler(registerAgent));

// Get agent by ID
router.get('/v1/agents/:id', asyncHandler(getAgent));

// Revoke agent registration
router.post('/v1/agents/:id/revoke', asyncHandler(revokeAgent));

// ============================================================
// Wallet Routes
// ============================================================

// Get wallet by agent ID
router.get('/v1/wallets/agent/:agentId', asyncHandler(getWalletByAgent));

// Get wallet details
router.get('/v1/wallets/:id', asyncHandler(getWallet));

// Get wallet balance
router.get('/v1/wallets/:id/balance', asyncHandler(getWalletBalance));

// Get wallet transaction history
router.get('/v1/wallets/:id/transactions', asyncHandler(getWalletTransactions));

// Get wallet ledger entries
router.get('/v1/wallets/:id/ledger', asyncHandler(getWalletLedger));

// ============================================================
// Transfer Routes (x402: Payment Required)
// ============================================================

// Transfer USDC between wallets
router.post(
  '/v1/transfer',
  x402Required,
  x402A2AValidation,
  asyncHandler(transferUsdc)
);

// Get transfer status
router.get('/v1/transfer/:txHash', asyncHandler(getTransferStatus));

// ============================================================
// Marketplace Routes
// ============================================================

// List marketplace services (public)
router.get('/v1/marketplace/services', asyncHandler(listServices));

// Get single service
router.get('/v1/marketplace/services/:id', asyncHandler(getService));

// Register a service
router.post('/v1/marketplace/services', rateLimiter, asyncHandler(registerService));

// Update a service
router.put('/v1/marketplace/services/:id', asyncHandler(updateService));

// Create escrow for service
router.post(
  '/v1/marketplace/escrow',
  x402Required,
  x402A2AValidation,
  asyncHandler(createEscrow)
);

// Release escrow
router.post('/v1/marketplace/escrow/:id/release', asyncHandler(releaseEscrow));

// ============================================================
// Faucet Routes
// ============================================================

// Claim faucet
router.post('/v1/faucet', rateLimiter, asyncHandler(claimFaucet));

// Get faucet status
router.get('/v1/faucet/status/:walletId', asyncHandler(getFaucetStatus));

// ============================================================
// Admin Routes
// ============================================================

// List all agents (admin)
router.get('/v1/admin/agents', asyncHandler(listAgents));

// List all wallets (admin)
router.get('/v1/admin/wallets', asyncHandler(listWallets));

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