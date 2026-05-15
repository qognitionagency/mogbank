import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { hashIdempotencyKey } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

// In-memory idempotency store
const idempotencyStore = new Map<
  string,
  { response: unknown; timestamp: number }
>()

setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000
  for (const [k, v] of idempotencyStore) {
    if (v.timestamp < cutoff) idempotencyStore.delete(k)
  }
}, 60_000).unref?.()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { agent_id, currency = 'USDC', wallet_type = 'custody' } = body

    if (!agent_id) {
      return NextResponse.json(
        { error: 'Agent ID is required' },
        { status: 400 }
      )
    }

    // Idempotency key enforcement
    const idempotencyKey = request.headers.get('x-idempotency-key')
    if (idempotencyKey) {
      const hash = hashIdempotencyKey(idempotencyKey)
      const entry = idempotencyStore.get(hash)
      if (entry) {
        return NextResponse.json(entry.response, {
          status: 200,
          headers: { 'x-idempotency-key': idempotencyKey },
        })
      }
    }

    const supabase = createServerClient()

    // Verify agent exists and is KYA-verified
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, kya_score, kya_status')
      .eq('id', agent_id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    if (agent.kya_status !== 'verified') {
      return NextResponse.json(
        {
          error: 'Agent must be KYA-verified to create wallets',
          kya_status: agent.kya_status,
          kya_score: agent.kya_score,
        },
        { status: 403 }
      )
    }

    // Check if wallet already exists
    const { data: existing } = await supabase
      .from('wallets')
      .select('*')
      .eq('agent_id', agent_id)
      .eq('currency', currency)
      .eq('wallet_type', wallet_type)
      .single()

    if (existing) {
      return NextResponse.json(
        { error: 'Wallet already exists', wallet: existing },
        { status: 409 }
      )
    }

    const { data: wallet, error } = await supabase
      .from('wallets')
      .insert({
        agent_id,
        currency,
        wallet_type,
        balance: 0,
        status: 'active',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create wallet', details: error },
        { status: 500 }
      )
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      agent_id,
      action: 'wallet_created',
      details: {
        wallet_id: wallet.id,
        currency,
        wallet_type,
      },
      ip_address: request.headers.get('x-forwarded-for') || undefined,
      user_agent: request.headers.get('user-agent') || undefined,
    })

    const response = { wallet }

    if (idempotencyKey) {
      idempotencyStore.set(hashIdempotencyKey(idempotencyKey), {
        response,
        timestamp: Date.now(),
      })
    }

    return NextResponse.json(response, {
      status: 201,
      ...(idempotencyKey && {
        headers: { 'x-idempotency-key': idempotencyKey },
      }),
    })
  } catch (error) {
    console.error('Create wallet error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const agent_id = searchParams.get('agent_id')
    const currency = searchParams.get('currency')
    const wallet_type = searchParams.get('wallet_type')

    if (!agent_id) {
      return NextResponse.json(
        { error: 'Agent ID is required' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    let query = supabase
      .from('wallets')
      .select('*')
      .eq('agent_id', agent_id)

    if (currency) {
      query = query.eq('currency', currency)
    }
    if (wallet_type) {
      query = query.eq('wallet_type', wallet_type)
    }

    const { data: wallets, error } = await query

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch wallets' },
        { status: 500 }
      )
    }

    return NextResponse.json({ wallets })
  } catch (error) {
    console.error('Get wallets error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, x-api-key, x-idempotency-key',
    },
  })
}