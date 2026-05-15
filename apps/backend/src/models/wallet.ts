import { z } from 'zod';

export const Currency = z.enum(['USDC', 'AED', 'USD']);
export type Currency = z.infer<typeof Currency>;

export const WalletType = z.enum(['custody', 'external', 'smart_contract']);
export type WalletType = z.infer<typeof WalletType>;

export const WalletStatus = z.enum(['active', 'frozen', 'closed']);
export type WalletStatus = z.infer<typeof WalletStatus>;

export const WalletSchema = z.object({
  id: z.string().uuid(),
  agent_id: z.string().uuid(),
  currency: Currency,
  wallet_type: WalletType,
  balance: z.number().nonnegative(),
  daily_limit: z.number().nonnegative(),
  status: WalletStatus,
  address: z.string().optional(),
  created_at: z.string().datetime(),
  updated_at: z.string().datetime(),
});

export type Wallet = z.infer<typeof WalletSchema>;

export const CreateWalletSchema = z.object({
  agent_id: z.string().uuid(),
  currency: Currency.optional().default('USDC'),
  wallet_type: WalletType.optional().default('custody'),
});

export type CreateWallet = z.infer<typeof CreateWalletSchema>;

export const WalletBalanceResponse = z.object({
  wallet_id: z.string().uuid(),
  balance: z.number(),
  currency: Currency,
  status: WalletStatus,
  daily_limit: z.number(),
  daily_used: z.number().optional(),
});

export type WalletBalanceResponse = z.infer<typeof WalletBalanceResponse>;