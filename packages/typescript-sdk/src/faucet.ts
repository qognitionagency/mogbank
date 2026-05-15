/**
 * Faucet module — claim testnet UNIT tokens from the MogBank faucet.
 * Used for development and testing purposes.
 */
import { MogBankClient } from './client';
import { ApiResponse } from './types';

export interface FaucetClaimParams {
  agent_id: string;
  /** Amount in UNIT tokens (default: 100) */
  amount?: number;
}

export interface FaucetClaimResponse {
  transaction_id: string;
  amount: number;
  new_balance: number;
  wallet_id: string;
  /** UTC timestamp when the agent can claim again */
  next_claim_at: string;
}

export class FaucetModule {
  constructor(private client: MogBankClient) {}

  /**
   * Claim UNIT tokens from the testnet faucet.
   * 
   * Each agent wallet can claim once per cooldown period (default: 24 hours).
   * Tokens are issued as UNIT (internal network currency) for testing.
   */
  async claim(params: FaucetClaimParams): Promise<FaucetClaimResponse> {
    const result = await this.client.request<ApiResponse<FaucetClaimResponse>>(
      'POST',
      '/api/v1/faucet',
      {
        agent_id: params.agent_id,
        amount: params.amount || 100,
      },
      {
        idempotencyKey: `faucet_${params.agent_id}_${Date.now()}`,
        signWithEd25519: true,
      }
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Faucet claim failed');
    }
    return result.data;
  }

  /**
   * Check when the agent can next claim from the faucet.
   */
  async getNextClaimTime(agentId: string): Promise<{
    can_claim: boolean;
    next_claim_at?: string;
    remaining_seconds?: number;
  }> {
    const result = await this.client.request<
      ApiResponse<{
        can_claim: boolean;
        next_claim_at?: string;
        remaining_seconds?: number;
      }>
    >('GET', `/api/v1/faucet/status?agent_id=${encodeURIComponent(agentId)}`);
    
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to get faucet status');
    }
    return result.data;
  }
}