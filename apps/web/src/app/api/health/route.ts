import { NextResponse } from 'next/server'
import { query } from '@/lib/db'

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
        blockchain:
          process.env.NEXT_PUBLIC_BLOCKCHAIN_ENABLED === 'true'
            ? 'connected'
            : 'simulated',
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
