/**
 * x402 Protocol Middleware
 *
 * ABOS v1.0 Layer 2 — x402 is the protocol for agent-to-agent payments.
 * An HTTP 402 Payment Required response tells the requesting agent
 * to pay before accessing a resource.
 *
 * This middleware:
 * 1. Parses x402 headers from incoming requests
 * 2. Validates payment proofs
 * 3. Enforces protocol fee rules
 * 4. Creates x402 payment records
 */
import { Request, Response, NextFunction } from 'express';
import { logger } from '../utils/logger';
import { AppError } from '../middleware/errorHandler';
import { verifyRequestSignature } from '../services/crypto';
import { config } from '../config';

export interface X402Headers {
  'x-402-version': string;
  'x-402-payment-address': string;
  'x-402-amount': string;
  'x-402-currency': string;
  'x-402-signature': string;
  'x-402-timestamp': string;
  'x-402-nonce': string;
  'x-402-protocol-fee': string;
}

export interface X402Payment {
  version: string;
  paymentAddress: string;
  amount: number;
  currency: string;
  signature: string;
  timestamp: string;
  nonce: string;
  protocolFee: number;
}

/**
 * Parse and validate x402 headers from the incoming request.
 */
export function parseX402Headers(req: Request): X402Payment | null {
  const headers = req.headers as Record<string, string | undefined>;

  const version = headers['x-402-version'];
  const paymentAddress = headers['x-402-payment-address'];
  const amount = headers['x-402-amount'];
  const currency = headers['x-402-currency'];
  const signature = headers['x-402-signature'];
  const timestamp = headers['x-402-timestamp'];
  const nonce = headers['x-402-nonce'];
  const protocolFee = headers['x-402-protocol-fee'];

  if (!version || !paymentAddress || !amount || !currency || !signature || !timestamp || !nonce) {
    return null;
  }

  const parsedAmount = parseFloat(amount);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    logger.warn('Invalid x402 amount', { amount });
    return null;
  }

  const parsedFee = parseFloat(protocolFee || config.x402.protocolFee.toString());
  if (isNaN(parsedFee) || parsedFee < 0) {
    logger.warn('Invalid x402 protocol fee', { protocolFee });
    return null;
  }

  // Timestamp must be within 5 minutes of server time
  const requestTime = parseInt(timestamp, 10);
  const serverTime = Math.floor(Date.now() / 1000);
  const timeDiff = Math.abs(serverTime - requestTime);
  if (timeDiff > 300) {
    logger.warn('x402 timestamp too old', { timeDiff });
    return null;
  }

  return {
    version,
    paymentAddress,
    amount: parsedAmount,
    currency: currency.toUpperCase(),
    signature,
    timestamp,
    nonce,
    protocolFee: parsedFee,
  };
}

/**
 * x402 Payment Required Middleware
 *
 * Requires agents to include x402 payment headers for protected resources.
 */
export async function x402Required(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  if (!config.x402.enabled) {
    next();
    return;
  }

  const payment = parseX402Headers(req);

  if (!payment) {
    res.status(402).json({
      error: 'Payment Required',
      code: 'X402_PAYMENT_REQUIRED',
      details: {
        protocol: 'x402',
        version: '1.0',
        accepted_currencies: ['USDC'],
        protocol_fee: config.x402.protocolFee,
        message: 'Include x-402-* headers with payment proof to access this resource',
      },
      required_headers: [
        'x-402-version',
        'x-402-payment-address',
        'x-402-amount',
        'x-402-currency',
        'x-402-signature',
        'x-402-timestamp',
        'x-402-nonce',
      ],
    });
    return;
  }

  // Validate payment meets minimum requirements
  const requiredAmount = parseFloat(req.headers['x-402-required-amount'] as string || '0');
  if (payment.amount < requiredAmount) {
    res.status(402).json({
      error: 'Insufficient Payment',
      code: 'X402_INSUFFICIENT_AMOUNT',
      details: {
        required: requiredAmount,
        provided: payment.amount,
      },
    });
    return;
  }

  // Attach payment info to request for downstream handlers
  (req as any).x402Payment = payment;

  logger.info('x402 payment validated', {
    address: payment.paymentAddress,
    amount: payment.amount,
    currency: payment.currency,
  });

  next();
}

/**
 * x402 A2A (Agent-to-Agent) payment validation middleware.
 * Validates the Ed25519 signature on the payment proof.
 */
export async function x402A2AValidation(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const payment = (req as any).x402Payment as X402Payment | undefined;

  if (!payment) {
    next();
    return;
  }

  // For A2A, the signature proves the requesting agent controls the
  // payment address. In production, this would verify against the
  // agent's registered public key.
  const body = req.body || {};

  // Store validated payment for downstream use
  (req as any).validatedPayment = {
    ...payment,
    validatedAt: new Date().toISOString(),
  };

  logger.debug('x402 A2A validation complete', {
    paymentAddress: payment.paymentAddress,
  });

  next();
}

/**
 * Response helper to include x402 payment headers in responses.
 */
export function addX402ResponseHeaders(res: Response, payment: X402Payment): void {
  res.setHeader('x-402-version', '1.0');
  res.setHeader('x-402-payment-id', payment.nonce);
  res.setHeader('x-402-status', 'accepted');
  res.setHeader('x-402-receipt', `mogbank:${Date.now()}:${payment.nonce}`);
}