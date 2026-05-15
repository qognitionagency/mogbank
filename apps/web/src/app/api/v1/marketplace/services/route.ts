import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { hashIdempotencyKey } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

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

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'active'
    const seller_agent_id = searchParams.get('seller_agent_id')

    const supabase = createServerClient()

    let query = supabase
      .from('services')
      .select('*, agents:seller_agent_id(wallet_address, agent_type)')
      .eq('status', status)
      .order('created_at', { ascending: false })

    if (seller_agent_id) {
      query = query.eq('seller_agent_id', seller_agent_id)
    }

    const { data: services, error } = await query

    if (error) {
      return NextResponse.json(
        { error: 'Failed to fetch services' },
        { status: 500 }
      )
    }

    return NextResponse.json({ services })
  } catch (error) {
    console.error('Get services error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      seller_agent_id,
      name,
      description,
      price,
      currency = 'USDC',
    } = body

    if (!seller_agent_id || !name || !price) {
      return NextResponse.json(
        { error: 'seller_agent_id, name, and price are required' },
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

    // Verify seller agent exists and is KYA-verified
    const { data: agent } = await supabase
      .from('agents')
      .select('id, kya_status')
      .eq('id', seller_agent_id)
      .single()

    if (!agent) {
      return NextResponse.json(
        { error: 'Seller agent not found' },
        { status: 404 }
      )
    }

    if (agent.kya_status !== 'verified') {
      return NextResponse.json(
        {
          error: 'Agent must be KYA-verified to list services',
          kya_status: agent.kya_status,
        },
        { status: 403 }
      )
    }

    const { data: service, error } = await supabase
      .from('services')
      .insert({
        seller_agent_id,
        name,
        description: description || '',
        price,
        currency,
        status: 'active',
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create service', details: error },
        { status: 500 }
      )
    }

    // Audit log
    await supabase.from('audit_logs').insert({
      agent_id: seller_agent_id,
      action: 'service_listed',
      details: {
        service_id: service.id,
        name,
        price,
        currency,
      },
      ip_address: request.headers.get('x-forwarded-for') || undefined,
      user_agent: request.headers.get('user-agent') || undefined,
    })

    const response = { service }

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
    console.error('Create service error:', error)
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