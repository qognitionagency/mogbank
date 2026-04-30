// ABOS Types - Agent Banking Open Standard v1.0

export type AgentType = 'langchain' | 'crewai' | 'autogen' | 'custom' | 'semantic_kernel'
export type KYAStatus = 'pending' | 'in_review' | 'verified' | 'suspended'
export type WalletType = 'custody' | 'escrow' | 'hot' | 'cold'
export type Currency = 'USDC' | 'AED' | 'USD'
export type TransactionType = 'transfer' | 'payment' | 'escrow' | 'credit'
export type TransactionStatus = 'pending' | 'confirmed' | 'failed'
export type Protocol = 'x402' | 'a2a' | 'ap2'
export type EscrowStatus = 'locked' | 'released' | 'refunded'
export type ServiceStatus = 'active' | 'paused' | 'closed'

export interface Agent {
  id: string
  wallet_address: string
  public_key: string
  principal_address: string
  agent_type: AgentType
  kya_score: number
  kya_status: KYAStatus
  metadata: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Wallet {
  id: string
  agent_id: string
  currency: Currency
  balance: number
  wallet_type: WalletType
  daily_limit: number | null
  session_limit: number | null
  status: 'active' | 'frozen' | 'closed'
  created_at: string
  updated_at: string
}

export interface Transaction {
  id: string
  wallet_id: string
  counterparty_wallet_id: string | null
  type: TransactionType
  amount: number
  fee: number
  status: TransactionStatus
  tx_hash: string | null
  protocol: Protocol | null
  metadata: Record<string, unknown>
  created_at: string
  confirmed_at: string | null
}

export interface SpendingControls {
  id: string
  agent_id: string
  daily_limit: number
  session_limit: number
  allowed_currencies: Currency[]
  counterparty_allowlist: string[]
  counterparty_blocklist: string[]
}

export interface Service {
  id: string
  seller_agent_id: string
  name: string
  description: string
  price: number
  currency: Currency
  status: ServiceStatus
  created_at: string
}

export interface EscrowOrder {
  id: string
  buyer_agent_id: string
  seller_agent_id: string
  service_id: string
  amount: number
  status: EscrowStatus
  created_at: string
}

export interface Mandate {
  id: string
  agent_id: string
  principal_address: string
  scope: {
    allowed_operations: string[]
    allowed_currencies: Currency[]
  }
  constraints: {
    max_amount: number
    max_transactions: number
    valid_from: string
    valid_until: string
  }
  signature: string
  revoked: boolean
  created_at: string
}

export interface ApiKey {
  id: string
  agent_id: string
  key_hash: string
  name: string
  last_used_at: string | null
  expires_at: string | null
  created_at: string
}

// KYA-7 Score Breakdown
export interface KYAScoreBreakdown {
  principal_identity: number
  email_domain: number
  agent_metadata: number
  use_case: number
  jurisdiction_risk: number
  technical_capability: number
  verification_mode: number
  total: number
}

// ABOS Discovery Document
export interface ABOSDiscovery {
  abos_version: string
  provider: string
  currencies: Currency[]
  x402_enabled: boolean
  a2a_card_url: string
  ap2_mandate_endpoint: string
  layers: {
    kya: string
    custody: string
    transfer: string
    marketplace: string
    mandates: string
  }
  testnet_faucet: string
}

// A2A Agent Card
export interface A2AAgentCard {
  schema_version: string
  agent_id: string
  name: string
  capabilities: string[]
  endpoints: {
    payment: string
    wallet: string
    marketplace: string
  }
  authentication: {
    type: string
    header: string
  }
}