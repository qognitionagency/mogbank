import { z } from 'zod';

export const MandateStatus = z.enum(['active', 'revoked', 'expired']);
export type MandateStatus = z.infer<typeof MandateStatus>;

export const SpendingLimitInterval = z.enum(['daily', 'weekly', 'monthly', 'per_transaction']);
export type SpendingLimitInterval = z.infer<typeof SpendingLimitInterval>;

export const SpendingLimit = z.object({
  amount: z.number().positive(),
  currency: z.string().default('USDC'),
  interval: SpendingLimitInterval,
});

export type SpendingLimit = z.infer<typeof SpendingLimit>;

export const MandateSchema = z.object({
  id: z.string().uuid(),
  principal_agent_id: z.string().uuid(),
  delegated_agent_id: z.string().uuid(),
  status: MandateStatus,
  spending_limits: z.array(SpendingLimit),
  allowed_counterparties: z.array(z.string()).optional(),
  blocked_counterparties: z.array(z.string()).optional(),
  allowed_protocols: z.array(z.enum(['x402', 'a2a', 'ap2'])).optional(),
  max_single_transfer: z.number().positive().optional(),
  valid_from: z.string().datetime(),
  valid_until: z.string().datetime(),
  signature: z.string(),
  signed_at: z.string().datetime(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Mandate = z.infer<typeof MandateSchema>;

export const CreateMandateSchema = z.object({
  principal_agent_id: z.string().uuid(),
  delegated_agent_id: z.string().uuid(),
  spending_limits: z.array(SpendingLimit),
  allowed_counterparties: z.array(z.string()).optional(),
  blocked_counterparties: z.array(z.string()).optional(),
  allowed_protocols: z.array(z.enum(['x402', 'a2a', 'ap2'])).optional(),
  max_single_transfer: z.number().positive().optional(),
  valid_days: z.number().int().positive().default(90),
  signature: z.string(),
});

export type CreateMandate = z.infer<typeof CreateMandateSchema>;