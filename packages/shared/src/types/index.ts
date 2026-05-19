// MogBank Shared Types
// Core type definitions used across the MogBank ecosystem

/** Agent registration status */
export type AgentStatus = 'active' | 'inactive' | 'suspended';

/** Agent identifying information */
export interface AgentInfo {
  id: string;
  name: string;
  owner: string;
  status: AgentStatus;
  createdAt: string;
  updatedAt: string;
}

/** Wallet balance structure */
export interface WalletBalance {
  walletId: string;
  balance: number;
  currency: string;
  updatedAt: string;
}

/** Transaction record */
export interface Transaction {
  id: string;
  from: string;
  to: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed';
  timestamp: string;
}

/** KYA-7 scoring dimensions */
export interface KyaScore {
  identityVerification: number;
  transactionHistory: number;
  delegateReliability: number;
  protocolCompliance: number;
  liquidityDepth: number;
  responseTime: number;
  disputeResolution: number;
  overall: number;
}