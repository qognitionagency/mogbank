/**
 * Core type definitions for the MogBank TypeScript SDK.
 */

/** Supported currency types */
export type Currency = 'USDC' | 'UNIT';

/** Agent status */
export type AgentStatus = 'active' | 'suspended' | 'revoked' | 'pending';

/** Transaction status */
export type TransactionStatus = 'pending' | 'completed' | 'failed' | 'cancelled';

/** Wallet status */
export type WalletStatus = 'active' | 'frozen' | 'closed';

/** Service status */
export type ServiceStatus = 'active' | 'inactive' | 'deprecated';

/** Escrow status */
export type EscrowStatus = 'locked' | 'released' | 'refunded' | 'disputed';

/** KYA-7 score dimensions */
export interface KYADimensions {
  identity_verification: number;
  transaction_history: number;
  delegate_reliability: number;
  protocol_compliance: number;
  liquidity_depth: number;
  response_time: number;
  dispute_resolution: number;
}

/** Agent registration information */
export interface AgentInfo {
  id: string;
  name: string;
  public_key_hash: string;
  kya_score: number;
  kya_dimensions: KYADimensions;
  status: AgentStatus;
  created_at: string;
  updated_at: string;
}

/** Wallet information */
export interface WalletInfo {
  id: string;
  agent_id: string;
  address: string;
  balance: number;
  currency: Currency;
  status: WalletStatus;
  created_at: string;
}

/** Transaction record */
export interface Transaction {
  id: string;
  tx_hash: string;
  from_wallet_id: string;
  to_wallet_id: string;
  amount: number;
  currency: Currency;
  status: TransactionStatus;
  idempotency_key: string;
  created_at: string;
  settled_at?: string;
}

/** Ledger entry */
export interface LedgerEntry {
  id: string;
  wallet_id: string;
  entry_type: 'credit' | 'debit';
  amount: number;
  balance_after: number;
  description: string;
  created_at: string;
}

/** Service listing */
export interface Service {
  id: string;
  seller_agent_id: string;
  name: string;
  description: string;
  price: number;
  currency: Currency;
  status: ServiceStatus;
  created_at: string;
}

/** Escrow record */
export interface Escrow {
  id: string;
  buyer_agent_id: string;
  seller_agent_id: string;
  service_id: string;
  amount: number;
  currency: Currency;
  status: EscrowStatus;
  locked_at: string;
  released_at?: string;
  timeout_at: string;
}

/** API error response */
export interface ApiError {
  error: string;
  code?: string;
  details?: Record<string, unknown>;
}

/** API success response wrapper */
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
}

/** MogBank client configuration */
export interface MogBankConfig {
  baseUrl: string;
  apiKey?: string;
  agentId?: string;
  ed25519SecretKey?: string;  // Base64-encoded 64-byte Ed25519 secret key
  ed25519PublicKey?: string;  // Base64-encoded 32-byte Ed25519 public key
  timeout?: number;           // Request timeout in ms (default: 30000)
  retries?: number;           // Number of retries (default: 3)
}

/** Ed25519 key pair */
export interface Ed25519KeyPair {
  publicKey: string;   // Base64-encoded
  secretKey: string;   // Base64-encoded
}

/** Mandate (signed payment authorization) */
export interface Mandate {
  id: string;
  agent_id: string;
  delegate_id?: string;
  action: string;
  max_amount: number;
  currency: Currency;
  valid_from: string;
  valid_until: string;
  signature: string;
}

/** WebSocket message types */
export type WSMessageType = 
  | 'subscribe'
  | 'unsubscribe'
  | 'balance_update'
  | 'transaction_update'
  | 'agent_update'
  | 'heartbeat'
  | 'error';

export interface WSMessage {
  type: WSMessageType;
  channel?: string;
  data?: unknown;
  timestamp?: string;
}