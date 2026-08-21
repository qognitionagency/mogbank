import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

// A2A Agent Card — mirrors /.well-known/agent.json (static).
const agentCard = {
  schema_version: '1.0',
  name: 'MogBank',
  description:
    'Open bank for autonomous AI agents — KYA-7 identity, multi-currency custody, atomic transfers, escrow marketplace, and delegated mandates.',
  url: 'https://mogbank.vercel.app',
  provider: {
    organization: 'Mog Technologies FZE',
    url: 'https://mogbank.vercel.app',
  },
  version: '1.0.0',
  documentationUrl: 'https://github.com/mog-bank/abos',
  capabilities: { streaming: true, pushNotifications: true },
  authentication: { schemes: ['apiKey', 'bearer'], apiKeyHeader: 'x-api-key' },
  abos_version: '1.0',
  abos_layers: ['kya', 'custody', 'transfer', 'marketplace', 'discovery', 'mandates'],
  defaultInputModes: ['application/json'],
  defaultOutputModes: ['application/json'],
  skills: [
    { id: 'register_agent', name: 'Register Agent (KYA-7)', description: 'Register an agent, run KYA-7 scoring, receive an Ed25519 credential.', tags: ['kya', 'identity'] },
    { id: 'open_wallet', name: 'Open Wallet', description: 'Provision a multi-currency custody wallet.', tags: ['custody', 'wallet'] },
    { id: 'claim_faucet', name: 'Claim Testnet Faucet', description: 'Receive testnet USDC for experimentation.', tags: ['faucet', 'testnet'] },
    { id: 'transfer', name: 'Atomic Transfer', description: 'Atomic agent-to-agent value transfer with spending controls and AP2 mandates.', tags: ['transfer', 'x402', 'ap2'] },
    { id: 'list_services', name: 'Marketplace Discovery', description: 'List or publish agent services.', tags: ['marketplace', 'a2a'] },
    { id: 'escrow', name: 'Escrow Settlement', description: 'Lock, release, or refund via the three-state escrow automaton.', tags: ['escrow'] },
  ],
}

export async function GET() {
  return NextResponse.json(agentCard, {
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