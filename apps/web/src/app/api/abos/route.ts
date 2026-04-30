import { NextResponse } from 'next/server'
import type { ABOSDiscovery } from '@/types'

export const dynamic = 'force-dynamic'

const abosDiscovery: ABOSDiscovery = {
  abos_version: '1.0',
  provider: 'MogBank',
  currencies: ['USDC'],
  x402_enabled: true,
  a2a_card_url: 'https://mogbank.vercel.app/.well-known/agent.json',
  ap2_mandate_endpoint: 'https://mogbank.vercel.app/api/v1/mandates',
  layers: {
    kya: 'https://mogbank.vercel.app/api/v1/agents',
    custody: 'https://mogbank.vercel.app/api/v1/wallets',
    transfer: 'https://mogbank.vercel.app/api/v1/transfer',
    marketplace: 'https://mogbank.vercel.app/api/v1/marketplace',
    mandates: 'https://mogbank.vercel.app/api/v1/mandates'
  },
  testnet_faucet: 'https://mogbank.vercel.app/api/v1/faucet'
}

export async function GET() {
  return NextResponse.json(abosDiscovery, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
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