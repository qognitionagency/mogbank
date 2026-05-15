/**
 * MogBank TypeScript SDK
 * 
 * Official client library for the MogBank Agent Banking Infrastructure.
 * Provides type-safe access to all MogBank APIs for AI agents.
 * 
 * @packageDocumentation
 */

export { MogBankClient } from './client';
export { CryptoUtils } from './crypto';
export { StreamClient } from './stream';

export * from './types';

// Re-export sub-module types for convenience
export type {
  AgentRegistrationParams,
  AgentResponse,
} from './agent';

export type {
  WalletResponse,
  CreateWalletParams,
} from './wallet';

export type {
  TransferParams,
  TransferResponse,
  BalanceResponse,
} from './transfer';

export type {
  ServiceListing,
  ServiceListingParams,
  EscrowParams,
  EscrowResponse,
} from './marketplace';

export type {
  FaucetClaimParams,
  FaucetClaimResponse,
} from './faucet';