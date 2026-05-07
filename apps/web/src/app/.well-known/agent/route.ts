import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const agentCard = {
  schema_version: 'v1',
  agent_id: 'mogbank',
  name: 'MogBank Agent',
  capabilities: ['payments', 'wallets', 'escrow', 'credentials', 'transfer', 'mandates'],
  endpoints: {
    payment: 'https://mogbank.vercel.app/api/v1/payments',
    wallet: 'https://mogbank.vercel.app/api/v1/wallets',
    marketplace: 'https://mogbank.vercel.app/api/v1/marketplace'
  },
  authentication: {
    type: 'api_key',
    header: 'x-api-key'
  }
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