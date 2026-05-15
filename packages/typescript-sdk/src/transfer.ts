/**
 * Transfer module — send and track payments between AI agents.
 * Supports both off-chain ledger transfers and on-chain Base L2 USDC settlement.
 */
import { MogBankClient } from './client';
import { Transaction, LedgerEntry, ApiResponse } from './types';

export interface TransferParams {
  from_wallet_id: string;
  to_wallet_id?: string;
  to_agent_id?: string;
  amount: number;
  currency?: 'USDC' | 'UNIT';
  description?: string;
  idempotency_key?: string;
  /** If true, forces on-chain settlement via Base L2 instead of off-chain ledger */
  on_chain?: boolean;
  /** Ed25519-signed mandate authorizing the transfer */
  mandate?: {
    id: string;
    agent_id: string;
    delegate_id?: string;
    action: string;
    max_amount: number;
    valid_until: string;
    signature: string;
  };
}

export interface TransferResponse {
  transaction: Transaction;
  ledger_entries: LedgerEntry[];
  on_chain_tx_hash?: string;
}

export interface BalanceResponse {
  wallet_id: string;
  balance: number;
  currency: string;
  ledger_history: LedgerEntry[];
}

export class TransferModule {
  constructor(private client: MogBankClient) {}

  /**
   * Transfer funds from one agent wallet to another.
   * 
   * Transfers are automatically routed:
   * - Off-chain: double-entry ledger (instant)
   * - On-chain: Base L2 USDC (if `on_chain: true`)
   * 
   * Requires an Ed25519-signed mandate for authentication.
   */
  async send(params: TransferParams): Promise<TransferResponse> {
    const idempotencyKey = params.idempotency_key || 
      `txfr_${params.from_wallet_id}_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;

    const result = await this.client.request<ApiResponse<TransferResponse>>(
      'POST',
      '/api/v1/transfer',
      { ...params, idempotency_key: idempotencyKey },
      {
        idempotencyKey,
        signWithEd25519: true,
      }
    );

    if (!result.success || !result.data) {
      throw new Error(result.error || 'Transfer failed');
    }

    return result.data;
  }

  /**
   * Get transaction details by ID.
   */
  async getTransaction(transactionId: string): Promise<Transaction> {
    const result = await this.client.request<ApiResponse<Transaction>>(
      'GET',
      `/api/v1/transfer/${transactionId}`
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Transaction not found');
    }
    return result.data;
  }

  /**
   * Get wallet balance and ledger history.
   */
  async getBalance(walletId: string): Promise<BalanceResponse> {
    const result = await this.client.request<ApiResponse<BalanceResponse>>(
      'GET',
      `/api/v1/wallets/${walletId}/balance`
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to get balance');
    }
    return result.data;
  }

  /**
   * Get ledger entries for a wallet (paginated).
   */
  async getLedger(
    walletId: string,
    options?: { limit?: number; offset?: number }
  ): Promise<LedgerEntry[]> {
    const params = new URLSearchParams();
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));

    const result = await this.client.request<ApiResponse<LedgerEntry[]>>(
      'GET',
      `/api/v1/wallets/${walletId}/ledger?${params.toString()}`
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to get ledger');
    }
    return result.data;
  }

  /**
   * Get all transactions for an agent (admin view).
   */
  async listTransactions(options?: {
    agent_id?: string;
    status?: string;
    limit?: number;
    offset?: number;
  }): Promise<Transaction[]> {
    const params = new URLSearchParams();
    if (options?.agent_id) params.set('agent_id', options.agent_id);
    if (options?.status) params.set('status', options.status);
    if (options?.limit) params.set('limit', String(options.limit));
    if (options?.offset) params.set('offset', String(options.offset));

    const result = await this.client.request<ApiResponse<Transaction[]>>(
      'GET',
      `/api/v1/admin/transactions?${params.toString()}`
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to list transactions');
    }
    return result.data;
  }

  /**
   * Check the on-chain settlement status of a transaction on Base L2.
   */
  async getSettlementStatus(transactionId: string): Promise<{
    transaction_id: string;
    on_chain: boolean;
    tx_hash?: string;
    block_number?: number;
    confirmations?: number;
    settled_at?: string;
  }> {
    const result = await this.client.request<
      ApiResponse<{
        transaction_id: string;
        on_chain: boolean;
        tx_hash?: string;
        block_number?: number;
        confirmations?: number;
        settled_at?: string;
      }>
    >('GET', `/api/v1/transfer/${transactionId}/settlement`);
    
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to get settlement status');
    }
    return result.data;
  }
}