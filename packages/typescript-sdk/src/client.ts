/**
 * MogBankClient — the main entry point for the MogBank TypeScript SDK.
 *
 * Provides a type-safe HTTP client that handles:
 * - Ed25519 request signing (x402 protocol)
 * - Idempotency key generation
 * - Automatic retry with exponential backoff
 * - Error normalization
 */
import { MogBankConfig, ApiError, AgentInfo, Mandate } from './types';
import { CryptoUtils } from './crypto';
import { AgentModule } from './agent';
import { WalletModule } from './wallet';
import { TransferModule } from './transfer';
import { MarketplaceModule } from './marketplace';
import { FaucetModule } from './faucet';
import { StreamClient } from './stream';

export class MogBankClient {
  readonly config: Required<MogBankConfig>;
  readonly agents: AgentModule;
  readonly wallets: WalletModule;
  readonly transfers: TransferModule;
  readonly marketplace: MarketplaceModule;
  readonly faucet: FaucetModule;
  readonly stream: StreamClient;

  private registeredAgent: AgentInfo | null = null;

  constructor(config: MogBankConfig) {
    this.config = {
      timeout: 30000,
      retries: 3,
      apiKey: '',
      agentId: '',
      ed25519SecretKey: '',
      ed25519PublicKey: '',
      ...config,
    };

    const baseClient = this;
    this.agents = new AgentModule(baseClient);
    this.wallets = new WalletModule(baseClient);
    this.transfers = new TransferModule(baseClient);
    this.marketplace = new MarketplaceModule(baseClient);
    this.faucet = new FaucetModule(baseClient);
    this.stream = new StreamClient(baseClient);
  }

  /**
   * Register this agent with MogBank and set up credentials.
   * Generates Ed25519 keypair if not provided.
   */
  async register(publicKeyBase64: string, name?: string): Promise<AgentInfo> {
    const publicKeyHash = await CryptoUtils.hashPublicKey(publicKeyBase64);
    const result = await this.agents.register({
      public_key: publicKeyBase64,
      delegate_key: publicKeyBase64,
      name: name || `Agent_${publicKeyHash.substring(0, 8)}`,
      metadata: {},
    });

    this.registeredAgent = result;
    (this.config as { agentId: string }).agentId = result.id;
    return result;
  }

  /**
   * Set a registered agent for subsequent requests.
   */
  setAgent(agent: AgentInfo): void {
    this.registeredAgent = agent;
    (this.config as { agentId: string }).agentId = agent.id;
  }

  /**
   * Get the currently active agent info.
   */
  getAgent(): AgentInfo | null {
    return this.registeredAgent;
  }

  /**
   * Make an authenticated HTTP request to the MogBank API.
   */
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    options?: {
      idempotencyKey?: string;
      signWithEd25519?: boolean;
      extraHeaders?: Record<string, string>;
    }
  ): Promise<T> {
    const url = `${this.config.baseUrl}${path}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options?.extraHeaders,
    };

    // Add x402 protocol headers for agent authentication
    if (this.config.agentId) {
      headers['X-Agent-ID'] = this.config.agentId;
    }

    if (this.config.apiKey) {
      headers['Authorization'] = `Bearer ${this.config.apiKey}`;
    }

    // Add idempotency key for mutations
    if (['POST', 'PUT', 'PATCH'].includes(method) && options?.idempotencyKey) {
      headers['Idempotency-Key'] = options.idempotencyKey;
    }

    // Sign request body with Ed25519 if configured
    if (options?.signWithEd25519 && this.config.ed25519SecretKey && body) {
      const signature = await CryptoUtils.signMessage(
        JSON.stringify(body),
        this.config.ed25519SecretKey
      );
      headers['X-Ed25519-Signature'] = signature;
    }

    let lastError: Error | null = null;
    const maxRetries = this.config.retries;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

        const response = await fetch(url, {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        const responseBody = await response.json();

        if (!response.ok) {
          const apiError = responseBody as ApiError;
          throw new MogBankError(
            apiError.error || `HTTP ${response.status}`,
            response.status,
            apiError
          );
        }

        return responseBody as T;
      } catch (error: any) {
        lastError = error;

        // Don't retry on 4xx errors (except 429)
        if (error instanceof MogBankError && error.status >= 400 && error.status < 500 && error.status !== 429) {
          throw error;
        }

        // Don't retry on network abort
        if (error.name === 'AbortError') {
          throw new MogBankError('Request timed out', 408);
        }

        // Last attempt — throw
        if (attempt === maxRetries) {
          throw error;
        }

        // Exponential backoff
        const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    throw lastError || new Error('Request failed');
  }
}

export class MogBankError extends Error {
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'MogBankError';
    this.status = status;
    this.details = details;
  }
}