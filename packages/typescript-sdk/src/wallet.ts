/**
 * Wallet module — manage agent wallets, balances, and deposit addresses.
 */
import { MogBankClient } from './client';
import { WalletInfo, ApiResponse } from './types';

export type WalletResponse = WalletInfo;

export interface CreateWalletParams {
  agent_id: string;
  currency?: 'USDC' | 'UNIT';
}

export class WalletModule {
  constructor(private client: MogBankClient) {}

  /**
   * Create a new wallet for an agent.
   */
  async create(params: CreateWalletParams): Promise<WalletInfo> {
    const result = await this.client.request<ApiResponse<WalletInfo>>(
      'POST',
      '/api/v1/wallets',
      params,
      {
        idempotencyKey: `wallet_create_${params.agent_id}_${Date.now()}`,
        signWithEd25519: true,
      }
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Wallet creation failed');
    }
    return result.data;
  }

  /**
   * Get all wallets for the authenticated agent.
   */
  async list(agentId: string): Promise<WalletInfo[]> {
    const result = await this.client.request<ApiResponse<WalletInfo[]>>(
      'GET',
      `/api/v1/wallets?agent_id=${encodeURIComponent(agentId)}`
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to list wallets');
    }
    return result.data;
  }

  /**
   * Get a specific wallet by ID.
   */
  async get(walletId: string): Promise<WalletInfo> {
    const result = await this.client.request<ApiResponse<WalletInfo>>(
      'GET',
      `/api/v1/wallets/${walletId}`
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Wallet not found');
    }
    return result.data;
  }

  /**
   * Get wallet balance.
   */
  async balance(walletId: string): Promise<{ balance: number; currency: string }> {
    const wallet = await this.get(walletId);
    return { balance: wallet.balance, currency: wallet.currency };
  }

  /**
   * Get all wallets across all agents (admin only).
   */
  async listAll(): Promise<WalletInfo[]> {
    const result = await this.client.request<ApiResponse<WalletInfo[]>>(
      'GET',
      '/api/v1/admin/wallets'
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to list wallets');
    }
    return result.data;
  }

  /**
   * Freeze or unfreeze a wallet (admin only).
   */
  async setStatus(walletId: string, status: 'active' | 'frozen' | 'closed'): Promise<WalletInfo> {
    const result = await this.client.request<ApiResponse<WalletInfo>>(
      'POST',
      `/api/v1/wallets/${walletId}/status`,
      { status },
      {
        idempotencyKey: `wallet_sts_${walletId}_${status}_${Date.now()}`,
        signWithEd25519: true,
      }
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Status update failed');
    }
    return result.data;
  }
}