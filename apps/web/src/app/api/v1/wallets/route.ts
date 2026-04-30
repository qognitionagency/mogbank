import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

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

    const supabase = createServerClient()

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
        status: 'active'
      })
      .select()
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'Failed to create wallet', details: error },
        { status: 500 }
      )
    }

    return NextResponse.json({ wallet }, { status: 201 })

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

    if (!agent_id) {
      return NextResponse.json(
        { error: 'Agent ID is required' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    const { data: wallets, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('agent_id', agent_id)

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