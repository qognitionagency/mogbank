import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const status = searchParams.get('status') || 'active'

    const supabase = createServerClient()

    const { data: services, error } = await supabase
      .from('services')
      .select('*, agents: seller_agent_id(wallet_address, agent_type)')
      .eq('status', status)
      .order('created_at', { ascending: false })

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
    const { seller_agent_id, name, description, price, currency = 'USDC' } = body

    if (!seller_agent_id || !name || !price) {
      return NextResponse.json(
        { error: 'seller_agent_id, name, and price are required' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    const { data: service, error } = await supabase
      .from('services')
      .insert({
        seller_agent_id,
        name,
        description: description || '',
        price,
        currency,
        status: 'active'
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create service', details: error },
        { status: 500 }
      )
    }

    return NextResponse.json({ service }, { status: 201 })

  } catch (error) {
    console.error('Create service error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}