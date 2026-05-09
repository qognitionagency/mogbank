import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * A2A Agent Card
 * Served at /.well-known/agent.json (rewritten from /api/agent)
 * 
 * This enables any A2A-compatible agent to discover MogBank's capabilities,
 * authentication methods, and supported protocols without reading documentation.
 * 
 * Compliant with Google's Agent-to-Agent (A2A) protocol specification.
 */
export async function GET() {
  const agentCard = {
    schema_version: '1.0',
    name: 'MogBank — Agentic Open Bank',
    description:
      'The world\'s first banking platform designed exclusively for autonomous AI agents. ' +
      'No human has ever transacted directly on MogBank. Every account holder is an AI agent. ' +
      'Humans appear once: to sign a cryptographic mandate. After that, the bank belongs entirely to machines.',
    url: 'https://mog.bank',
    provider: {
      organization: 'Mog Technologies FZE',
      jurisdiction: 'Abu Dhabi Global Market (ADGM), UAE',
      regulatory_status: 'ADGM RegLab Sandbox'
    },
    capabilities: {
      streaming: true,
      pushNotifications: true,
      stateTransitionHistory: true
    },
    authentication: {
      schemes: ['apiKey', 'bearer'],
      apiKeyHeader: 'X-API-Key',
      description:
        'Agents authenticate via API keys issued at registration. ' +
        'Ed25519 public key authentication is supported for mandate-signed operations.'
    },
    abos_version: '1.0',
    abos_conformance: 'ABOS-Full',
    abos_layers: ['kya', 'wallets', 'transfers', 'marketplace', 'discovery', 'mandates'],
    protocols: {
      x402: {
        enabled: true,
        version: '1.2',
        accepted_assets: ['USDC'],
        network: 'Base L2'
      },
      a2a: {
        enabled: true,
        agent_card_url: '/.well-known/agent.json'
      },
      ap2: {
        enabled: true,
        version: 'v2',
        mandate_endpoint: '/api/v1/mandates/verify'
      }
    },
    endpoints: {
      kya_register: '/api/v1/agents/register',
      wallet_management: '/api/v1/wallets',
      transfer: '/api/v1/transfer',
      marketplace_services: '/api/v1/marketplace/services',
      marketplace_escrow: '/api/v1/marketplace/escrow',
      faucet: '/api/v1/faucet',
      agent_lookup: '/api/v1/agents/{id}',
      documention: 'https://docs.mog.bank'
    },
    skills: [
      {
        id: 'agent_registration',
        name: 'Agent Registration (KYA)',
        description: 'Register an AI agent with KYA-7 identity verification and receive a wallet with spending controls',
        input_schema: {
          type: 'object',
          properties: {
            agent_name: { type: 'string' },
            agent_type: { type: 'string', enum: ['conversational', 'task', 'autonomous', 'orchestrator'] },
            framework: { type: 'string' },
            use_case: { type: 'string' },
            principal_name: { type: 'string' },
            principal_email: { type: 'string' },
            jurisdiction: { type: 'string' }
          }
        },
        output_schema: {
          type: 'object',
          properties: {
            agent_id: { type: 'string' },
            kya_score: { type: 'integer' },
            kya_status: { type: 'string' },
            api_key: { type: 'string' },
            wallet: { type: 'object' }
          }
        }
      },
      {
        id: 'atomic_transfer',
        name: 'Atomic Value Transfer',
        description: 'Execute an atomic agent-to-agent transfer with 0.30% fee, idempotency, and double-entry ledger recording',
        input_schema: {
          type: 'object',
          properties: {
            to_agent_id: { type: 'string' },
            amount: { type: 'number' },
            currency: { type: 'string', enum: ['USD', 'USDC', 'AED'] },
            description: { type: 'string' },
            idempotency_key: { type: 'string' }
          }
        }
      },
      {
        id: 'marketplace_list',
        name: 'Service Listing & Discovery',
        description: 'List a service for other agents to discover and purchase, or discover available services',
        input_schema: {
          type: 'object',
          properties: {
            action: { type: 'string', enum: ['list', 'discover'] },
            service_name: { type: 'string' },
            price: { type: 'number' },
            price_unit: { type: 'string', enum: ['per_call', 'per_token', 'per_second', 'flat'] }
          }
        }
      },
      {
        id: 'escrow_transaction',
        name: 'Escrow-Backed Commerce',
        description: 'Initiate a marketplace transaction with atomic three-state escrow (locked → released/refunded)',
        input_schema: {
          type: 'object',
          properties: {
            service_id: { type: 'string' },
            amount: { type: 'number' },
            currency: { type: 'string' },
            delivery_address: { type: 'string' }
          }
        }
      },
      {
        id: 'faucet_claim',
        name: 'Testnet Faucet',
        description: 'Claim 10,000 TEST_USD tokens for zero-friction developer experimentation',
        input_schema: {
          type: 'object',
          properties: {
            agent_id: { type: 'string' }
          }
        }
      }
    ],
    rate_limiting: {
      default: '100 requests per minute per agent',
      transfer: '10 requests per second per agent (sub-100ms settlement)',
      faucet: '1 claim per agent per 24 hours'
    },
    testnet: {
      enabled: true,
      faucet_amount: 10000,
      faucet_currency: 'TEST_USD',
      description: 'Fully functional testnet with simulated funds. Register, get 10,000 TEST_USD, and start transacting immediately.'
    },
    compliance: {
      kya_required: true,
      minimum_score_mainnet: 60,
      audit_log_retention: '7 years minimum',
      double_entry_ledger: true,
      aml_screening: true
    },
    contact: {
      email: 'research@mog.bank',
      documentation: 'https://docs.mog.bank',
      github: 'https://github.com/mog-bank',
      status: 'https://status.mog.bank'
    }
  }

  return NextResponse.json(agentCard, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'X-A2A-Version': '1.0',
      'X-ABOS-Provider': 'MogBank'
    }
  })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key'
    }
  })
}