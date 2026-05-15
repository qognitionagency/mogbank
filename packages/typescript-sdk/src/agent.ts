/**
 * Agent module — manage AI agent registration, lookup, and state.
 */
import { MogBankClient } from './client';
import { AgentInfo, ApiResponse } from './types';

/** Parameters required to register a new agent */
export interface AgentRegistrationParams {
  public_key: string;
  delegate_key: string;
  name: string;
  metadata?: Record<string, unknown>;
}

export type AgentResponse = AgentInfo;

export class AgentModule {
  constructor(private client: MogBankClient) {}

  /**
   * Register a new AI agent with MogBank.
   * Returns the agent record with KYA-7 score.
   */
  async register(params: AgentRegistrationParams): Promise<AgentInfo> {
    const result = await this.client.request<ApiResponse<AgentInfo>>(
      'POST',
      '/api/v1/agents/register',
      params,
      {
        idempotencyKey: `reg_${params.public_key.substring(0, 32)}_${Date.now()}`,
        signWithEd25519: true,
      }
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Agent registration failed');
    }
    return result.data;
  }

  /**
   * Get agent details by ID.
   */
  async get(agentId: string): Promise<AgentInfo> {
    const result = await this.client.request<ApiResponse<AgentInfo>>(
      'GET',
      `/api/v1/agents/${agentId}`
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Agent not found');
    }
    return result.data;
  }

  /**
   * Update agent metadata or name.
   */
  async update(
    agentId: string,
    updates: { name?: string; metadata?: Record<string, unknown> }
  ): Promise<AgentInfo> {
    const result = await this.client.request<ApiResponse<AgentInfo>>(
      'PATCH',
      `/api/v1/agents/${agentId}`,
      updates,
      {
        idempotencyKey: `upd_${agentId}_${Date.now()}`,
        signWithEd25519: true,
      }
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Agent update failed');
    }
    return result.data;
  }

  /**
   * Request suspension or revocation of an agent.
   */
  async setStatus(
    agentId: string,
    status: 'active' | 'suspended' | 'revoked'
  ): Promise<AgentInfo> {
    const result = await this.client.request<ApiResponse<AgentInfo>>(
      'POST',
      `/api/v1/agents/${agentId}/status`,
      { status },
      {
        idempotencyKey: `sts_${agentId}_${status}_${Date.now()}`,
        signWithEd25519: true,
      }
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Status update failed');
    }
    return result.data;
  }

  /**
   * Get all agents (admin only).
   */
  async list(): Promise<AgentInfo[]> {
    const result = await this.client.request<ApiResponse<AgentInfo[]>>(
      'GET',
      '/api/v1/admin/agents'
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to list agents');
    }
    return result.data;
  }
}