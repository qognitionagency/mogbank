/**
 * Marketplace module — list, discover, and purchase AI agent services.
 * Supports escrow-based payments between agents.
 */
import { MogBankClient } from './client';
import { Service, Escrow, ApiResponse, Currency } from './types';

export type ServiceListing = Service;

export interface ServiceListingParams {
  seller_agent_id: string;
  name: string;
  description: string;
  price: number;
  currency?: Currency;
}

export interface EscrowParams {
  buyer_agent_id: string;
  seller_agent_id: string;
  service_id: string;
  amount: number;
  currency?: Currency;
  /** Timeout in hours before escrow auto-refunds (default: 72) */
  timeout_hours?: number;
}

export interface EscrowResponse {
  escrow: Escrow;
  transaction_id: string;
}

export class MarketplaceModule {
  constructor(private client: MogBankClient) {}

  /**
   * List a new service for sale on the marketplace.
   */
  async listService(params: ServiceListingParams): Promise<Service> {
    const result = await this.client.request<ApiResponse<Service>>(
      'POST',
      '/api/v1/marketplace/services',
      params,
      {
        idempotencyKey: `svc_${params.seller_agent_id}_${Date.now()}`,
        signWithEd25519: true,
      }
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to list service');
    }
    return result.data;
  }

  /**
   * Search for available services.
   */
  async searchServices(query?: {
    name?: string;
    seller_agent_id?: string;
    min_price?: number;
    max_price?: number;
    status?: 'active' | 'inactive';
    limit?: number;
    offset?: number;
  }): Promise<Service[]> {
    const params = new URLSearchParams();
    if (query?.name) params.set('name', query.name);
    if (query?.seller_agent_id) params.set('seller_agent_id', query.seller_agent_id);
    if (query?.min_price !== undefined) params.set('min_price', String(query.min_price));
    if (query?.max_price !== undefined) params.set('max_price', String(query.max_price));
    if (query?.status) params.set('status', query.status);
    if (query?.limit) params.set('limit', String(query.limit));
    if (query?.offset) params.set('offset', String(query.offset));

    const result = await this.client.request<ApiResponse<Service[]>>(
      'GET',
      `/api/v1/marketplace/services?${params.toString()}`
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to search services');
    }
    return result.data;
  }

  /**
   * Get a specific service listing.
   */
  async getService(serviceId: string): Promise<Service> {
    const result = await this.client.request<ApiResponse<Service>>(
      'GET',
      `/api/v1/marketplace/services/${serviceId}`
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Service not found');
    }
    return result.data;
  }

  /**
   * Update a service listing (by seller).
   */
  async updateService(
    serviceId: string,
    updates: {
      name?: string;
      description?: string;
      price?: number;
      status?: 'active' | 'inactive' | 'deprecated';
    }
  ): Promise<Service> {
    const result = await this.client.request<ApiResponse<Service>>(
      'PATCH',
      `/api/v1/marketplace/services/${serviceId}`,
      updates,
      {
        idempotencyKey: `svc_upd_${serviceId}_${Date.now()}`,
        signWithEd25519: true,
      }
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to update service');
    }
    return result.data;
  }

  /**
   * Lock funds into escrow to purchase a service.
   * 
   * This creates an escrow agreement between buyer and seller.
   * Funds are held until the buyer releases them or the timeout expires.
   */
  async createEscrow(params: EscrowParams): Promise<EscrowResponse> {
    const result = await this.client.request<ApiResponse<EscrowResponse>>(
      'POST',
      '/api/v1/marketplace/escrow',
      params,
      {
        idempotencyKey: `esc_${params.buyer_agent_id}_${params.service_id}_${Date.now()}`,
        signWithEd25519: true,
      }
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to create escrow');
    }
    return result.data;
  }

  /**
   * Release escrow funds to the seller (buyer confirms delivery).
   */
  async releaseEscrow(escrowId: string): Promise<EscrowResponse> {
    const result = await this.client.request<ApiResponse<EscrowResponse>>(
      'POST',
      `/api/v1/marketplace/escrow/${escrowId}/release`,
      {},
      {
        idempotencyKey: `esc_rel_${escrowId}_${Date.now()}`,
        signWithEd25519: true,
      }
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to release escrow');
    }
    return result.data;
  }

  /**
   * Refund escrow back to buyer (e.g., dispute resolved, timeout).
   */
  async refundEscrow(escrowId: string): Promise<EscrowResponse> {
    const result = await this.client.request<ApiResponse<EscrowResponse>>(
      'POST',
      `/api/v1/marketplace/escrow/${escrowId}/refund`,
      {},
      {
        idempotencyKey: `esc_ref_${escrowId}_${Date.now()}`,
        signWithEd25519: true,
      }
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Failed to refund escrow');
    }
    return result.data;
  }

  /**
   * Get escrow details.
   */
  async getEscrow(escrowId: string): Promise<Escrow> {
    const result = await this.client.request<ApiResponse<Escrow>>(
      'GET',
      `/api/v1/marketplace/escrow/${escrowId}`
    );
    if (!result.success || !result.data) {
      throw new Error(result.error || 'Escrow not found');
    }
    return result.data;
  }
}