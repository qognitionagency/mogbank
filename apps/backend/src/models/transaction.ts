import { z } from 'zod';

export const TransactionType = z.enum(['transfer', 'payment', 'escrow', 'credit', 'fee', 'faucet_claim']);
export type TransactionType = z.infer<typeof TransactionType>;

export const TransactionStatus = z.enum(['pending', 'confirmed', 'failed', 'reversed']);
export type TransactionStatus = z.infer<typeof TransactionStatus>;

export const Protocol = z.enum(['x402', 'a2a', 'ap2']);
export type Protocol = z.infer<typeof Protocol>;

export const TransactionSchema = z.object({
  id: z.string().uuid(),
  wallet_id: z.string().uuid(),
  counterparty_wallet_id: z.string().uuid().optional(),
  type: TransactionType,
  amount: z.number().nonnegative(),
  fee: z.number().nonnegative().default(0),
  status: TransactionStatus,
  protocol: Protocol.optional(),
  tx_hash: z.string().optional(),
  idempotency_key: z.string().optional(),
  mandate_signature: z.string().optional(),
  mandate_payload: z.record(z.unknown()).optional(),
  confirmed_at: z.string().datetime().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Transaction = z.infer<typeof TransactionSchema>;

export const CreateTransferSchema = z.object({
  from_wallet_id: z.string().uuid(),
  to_wallet_id: z.string().uuid(),
  amount: z.number().positive(),
  protocol: Protocol.optional().default('x402'),
  idempotency_key: z.string().optional(),
  mandate_signature: z.string().optional(),
  mandate_payload: z.record(z.unknown()).optional(),
});

export type CreateTransfer = z.infer<typeof CreateTransferSchema>;

export const TransferResponse = z.object({
  success: z.boolean(),
  transaction: z.object({
    tx_hash: z.string(),
    amount: z.number(),
    fee: z.number(),
    from_wallet: z.string().uuid(),
    to_wallet: z.string().uuid(),
    status: TransactionStatus,
  }),
});

export type TransferResponse = z.infer<typeof TransferResponse>;