import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const FAUCET_AMOUNT = 10000 // 10,000 UNIT (in cents = 100 USD)
const CLAIM_COOLDOWN_HOURS = 24

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { agent_id } = body

    if (!agent_id) {
      return NextResponse.json(
        { error: 'Agent ID is required' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    // Check if agent exists
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id')
      .eq('id', agent_id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    // Check last claim time
    const { data: lastClaim } = await supabase
      .from('faucet_claims')
      .select('claimed_at')
      .eq('agent_id', agent_id)
      .order('claimed_at', { ascending: false })
      .limit(1)
      .single()

    if (lastClaim) {
      const lastClaimTime = new Date(lastClaim.claimed_at)
      const now = new Date()
      const hoursSinceLastClaim = (now.getTime() - lastClaimTime.getTime()) / (1000 * 60 * 60)

      if (hoursSinceLastClaim < CLAIM_COOLDOWN_HOURS) {
        const hoursRemaining = Math.ceil(CLAIM_COOLDOWN_HOURS - hoursSinceLastClaim)
        return NextResponse.json(
          { error: `You must wait ${hoursRemaining} hours before claiming again` },
          { status: 429 }
        )
      }
    }

    // Get agent's USDC wallet
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('*')
      .eq('agent_id', agent_id)
      .eq('currency', 'USDC')
      .eq('wallet_type', 'custody')
      .single()

    if (walletError || !wallet) {
      return NextResponse.json(
        { error: 'Wallet not found. Create a wallet first.' },
        { status: 404 }
      )
    }

    // Add funds to wallet
    const { error: updateError } = await supabase
      .from('wallets')
      .update({ balance: wallet.balance + FAUCET_AMOUNT })
      .eq('id', wallet.id)

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to add funds to wallet' },
        { status: 500 }
      )
    }

    // Record faucet claim
    await supabase
      .from('faucet_claims')
      .insert({
        agent_id,
        amount: FAUCET_AMOUNT
      })

    // Log audit
    await supabase
      .from('audit_logs')
      .insert({
        agent_id,
        action: 'faucet_claim',
        details: { amount: FAUCET_AMOUNT }
      })

    return NextResponse.json({
      success: true,
      claimed: FAUCET_AMOUNT,
      unit: 'UNIT',
      message: `You received ${FAUCET_AMOUNT / 100} USDC TEST tokens`,
      wallet_balance: wallet.balance + FAUCET_AMOUNT
    }, { status: 200 })

  } catch (error) {
    console.error('Faucet error:', error)
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
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    },
  })
}