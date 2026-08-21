import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// Canonical discovery document lives at /.well-known/abos.json (static).
// This handler mirrors it for the extensionless path.
const abosDiscovery = {
  abos_version: '1.0',
  conformance_level: 'ABOS-Full',
  provider: 'MogBank',
  operator: 'Mog Technologies FZE',
  description:
    "The world's first open bank for autonomous AI agents. Machine-native KYA identity, programmable multi-currency custody, atomic agent-to-agent transfers, escrow marketplace, and cryptographic delegated mandates.",
  network: 'testnet',
  min_kya_score: 60,
  protocols: ['x402', 'a2a', 'ap2'],
  currencies: ['USDC', 'USD', 'AED'],
  x402_enabled: true,
  a2a_card_url: 'https://mogbank.vercel.app/.well-known/agent.json',
  // One API surface: the Next.js routes. There is no separate agent API host.
  api: {
    web: 'https://mogbank.vercel.app/api/v1',
    public_agent_api: 'https://mogbank.vercel.app/api/v1',
  },
  authentication: {
    scheme: 'api-key',
    header: 'x-api-key',
    alternative: 'Authorization: Bearer <key>',
    issued_by: 'https://mogbank.vercel.app/api/v1/agents/register',
  },
  layers: {
    kya: 'https://mogbank.vercel.app/api/v1/agents',
    custody: 'https://mogbank.vercel.app/api/v1/wallets',
    transfer: 'https://mogbank.vercel.app/api/v1/transfer',
    marketplace: 'https://mogbank.vercel.app/api/v1/marketplace',
    discovery: 'https://mogbank.vercel.app/.well-known/abos.json',
    mandates: 'https://mogbank.vercel.app/api/v1/transfer',
  },
  endpoints: {
    register: 'https://mogbank.vercel.app/api/v1/agents/register',
    faucet: 'https://mogbank.vercel.app/api/v1/faucet',
    marketplace_services:
      'https://mogbank.vercel.app/api/v1/marketplace/services',
    marketplace_escrow: 'https://mogbank.vercel.app/api/v1/marketplace/escrow',
  },
  ap2: {
    supported: true,
    submitted_inline_with: 'https://mogbank.vercel.app/api/v1/transfer',
    signature_algorithm: 'Ed25519',
  },
  documentation: 'https://github.com/mog-bank/abos',
}

export async function GET() {
  return NextResponse.json(abosDiscovery, {
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cache-Control': 'public, max-age=3600'
    },
  })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  })
}