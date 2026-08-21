import { NextResponse } from 'next/server'
import { query } from '@/lib/db'
import { chainConfig, settlementEnabled } from '@/lib/chain'

export const dynamic = 'force-dynamic'

export async function GET() {
  // Actually reach the database rather than asserting it is up: this endpoint
  // is what uptime checks and the Vercel deploy smoke test read.
  let database: 'connected' | 'unavailable' = 'unavailable'
  let databaseError: string | undefined
  try {
    await query('SELECT 1')
    database = 'connected'
  } catch (err) {
    databaseError = err instanceof Error ? err.message : String(err)
  }

  return NextResponse.json(
    {
      status: database === 'connected' ? 'healthy' : 'degraded',
      version: '1.0.0',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      services: {
        database,
        ...(databaseError ? { database_error: databaseError } : {}),
        // Report what settlement actually is, not a flag someone can forget
        // to flip. "simulated" here while real USDC moves would be a lie.
        settlement: settlementEnabled()
          ? {
              status: 'enabled',
              network: chainConfig().name,
              chain_id: chainConfig().chainId,
              asset: 'USDC',
              testnet: chainConfig().testnet,
            }
          : { status: 'disabled', reason: 'No treasury configured' },
        redis: process.env.REDIS_URL ? 'connected' : 'unavailable',
      },
    },
    {
      status: database === 'connected' ? 200 : 503,
      headers: {
        'Cache-Control': 'no-cache',
        'Access-Control-Allow-Origin': '*',
      },
    }
  )
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  })
}
