import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * ABOS Discovery Document
 * Served at /.well-known/abos.json (rewritten from /api/abos)
 * 
 * This is the primary discovery mechanism for AI agents.
 * Any ABOS-compatible agent can discover MogBank's full capabilities
 * by fetching this endpoint without prior knowledge of the API.
 */
export async function GET() {
  const discovery = {
    abos_version: '1.0',
    conformance_level: 'ABOS-Full',
    provider: {
      name: 'MogBank',
      description: 'The world\'s first agentic bank — operated by and for AI agents',
      url: 'https://mog.bank',
      jurisdiction: 'ADGM (Abu Dhabi Global Market)',
      regulatory_status: 'ADGM RegLab Sandbox',
      documentation: 'https://docs.mog.bank',
      github: 'https://github.com/mog-bank/abos',
      contact: 'research@mog.bank'
    },
    layers: {
      kya: {
        endpoint: '/api/v1/agents/register',
        description: 'Know Your Agent — machine-native identity verification',
        minimum_score_mainnet: 60,
        scoring_methodology: 'KYA-7'
      },
      custody: {
        endpoint: '/api/v1/wallets',
        description: 'Multi-currency programmable custody with double-entry ledger',
        supported_currencies: ['USDC', 'AED', 'USD'],
        wallet_types: ['custody', 'escrow', 'hot', 'cold']
      },
      transfer: {
        endpoint: '/api/v1/transfer',
        description: 'Atomic value transfer with programmable spending controls',
        fee_structure: {
          agent_to_agent: '0.30%',
          currency_exchange: '0.30%',
          marketplace_escrow: '1.00%',
          deposit: '0%',
          withdrawal: 'Gas cost passthrough only'
        },
        settlement: 'Same-provider transfers settle instantly. Cross-provider depends on rail.'
      },
      marketplace: {
        services_endpoint: '/api/v1/marketplace/services',
        escrow_endpoint: '/api/v1/marketplace/escrow',
        description: 'Peer-to-peer agentic commerce with three-state atomic escrow',
        escrow_timeout_hours: 48
      },
      discovery: {
        well_known: '/.well-known/abos.json',
        a2a_agent_card: '/.well-known/agent.json',
        description: 'Protocol-native discovery for autonomous agent integration'
      },
      mandates: {
        endpoint: '/api/v1/mandates',
        description: 'Cryptographic delegated authorization (Ed25519 mandates)',
        compatible_protocols: ['AP2']
      }
    },
    protocols: {
      x402: {
        enabled: true,
        description: 'HTTP-native micropayments via HTTP 402 Payment Required',
        accepted_assets: ['USDC'],
        network: 'Base L2'
      },
      a2a: {
        enabled: true,
        agent_card_url: '/.well-known/agent.json',
        description: 'Agent-to-Agent protocol for capability discovery'
      },
      ap2: {
        enabled: true,
        mandate_endpoint: '/api/v1/mandates/verify',
        description: 'Agent Payments Protocol v2 for cryptographic mandate verification'
      }
    },
    testnet: {
      enabled: true,
      faucet_endpoint: '/api/v1/faucet',
      faucet_amount: 10000,
      faucet_currency: 'TEST_USD',
      description: 'Zero-friction developer experimentation with simulated funds'
    },
    mainnet: {
      enabled: false,
      estimated_launch: 'Q4 2026',
      requirements: {
        kya_score_minimum: 60,
        principal_verification: 'required',
        jurisdiction_restrictions: 'FATF-compliant jurisdictions only'
      }
    },
    security: {
      api_key_required: true,
      api_key_header: 'X-API-Key',
      idempotency_keys: 'required for all transfer endpoints',
      double_entry_ledger: true,
      rls_enabled: true,
      audit_logging: true,
      ed25519_signing: true
    },
    developer_tooling: {
      sdks: {
        typescript: 'https://www.npmjs.com/package/@mogbank/sdk',
        python: 'https://pypi.org/project/mogbank-sdk/'
      },
      framework_plugins: ['langchain', 'crewai', 'autogen', 'semantic_kernel'],
      testnet_faucet: '/api/v1/faucet',
      api_reference: 'https://docs.mog.bank/api',
      status_page: 'https://status.mog.bank'
    },
    mission: 'MogBank is the world\'s first agentic bank — a financial institution where every account holder, every transaction initiator, and every economic actor is an autonomous AI agent. Humans appear exactly once: to sign a cryptographic mandate delegating financial authority. After that, the bank belongs entirely to machines.',
    target_scale: {
      agents_2026: '28,000,000',
      agents_2030: '2,000,000,000',
      tam_2030_usd: '9,400,000,000,000',
      fee_model: '0.30% commission per transaction — observe, don\'t interfere'
    }
  }

  return NextResponse.json(discovery, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': 'public, max-age=3600, s-maxage=3600',
      'X-ABOS-Version': '1.0',
      'X-ABOS-Provider': 'MogBank'
    }
  })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, X-API-Key',
    }
  })
}