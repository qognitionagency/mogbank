import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { hashIdempotencyKey } from '@/lib/crypto'
import { v4 as uuidv4 } from 'uuid'

export const dynamic = 'force-dynamic'

const FAUCET_AMOUNT = 10000 // 10,000 UNIT (in cents = 100 USD)
const CLAIM_COOLDOWN_HOURS = 24

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
    const { agent_id } = body

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

    // Check if agent exists
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .select('id, kya_score')
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
      const hoursSinceLastClaim =
        (now.getTime() - lastClaimTime.getTime()) / (1000 * 60 * 60)

      if (hoursSinceLastClaim < CLAIM_COOLDOWN_HOURS) {
        const hoursRemaining = Math.ceil(
          CLAIM_COOLDOWN_HOURS - hoursSinceLastClaim
        )
        return NextResponse.json(
          {
            error: `You must wait ${hoursRemaining} hours before claiming again`,
          },
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

    const txHash =
      '0x' +
      Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('')

    // Double-entry ledger: credit faucet funds
    const newBalance = wallet.balance + FAUCET_AMOUNT
    const { error: updateError } = await supabase
      .from('wallets')
      .update({ balance: newBalance })
      .eq('id', wallet.id)

    if (updateError) {
      return NextResponse.json(
        { error: 'Failed to add funds to wallet' },
        { status: 500 }
      )
    }

    // Record ledger entry
    await supabase.from('transactions').insert({
      wallet_id: wallet.id,
      type: 'deposit',
      amount: FAUCET_AMOUNT,
      fee: 0,
      status: 'confirmed',
      tx_hash: txHash,
      protocol: 'faucet',
      ledger_entry: 'credit',
      confirmed_at: new Date().toISOString(),
    })

    // Record faucet claim
    await supabase.from('faucet_claims').insert({
      agent_id,
      amount: FAUCET_AMOUNT,
    })

    // Audit log
    await supabase.from('audit_logs').insert({
      agent_id,
      action: 'faucet_claim',
      details: {
        amount: FAUCET_AMOUNT,
        tx_hash: txHash,
      },
      ip_address: request.headers.get('x-forwarded-for') || undefined,
      user_agent: request.headers.get('user-agent') || undefined,
    })

    const response = {
      success: true,
      claimed: FAUCET_AMOUNT,
      unit: 'UNIT',
      message: `You received ${FAUCET_AMOUNT / 100} USDC TEST tokens`,
      wallet_balance: newBalance,
      tx_hash: txHash,
    }

    if (idempotencyKey) {
      idempotencyStore.set(hashIdempotencyKey(idempotencyKey), {
        response,
        timestamp: Date.now(),
      })
    }

    return NextResponse.json(response, {
      status: 200,
      ...(idempotencyKey && {
        headers: { 'x-idempotency-key': idempotencyKey },
      }),
    })
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
      'Access-Control-Allow-Headers':
        'Content-Type, x-api-key, x-idempotency-key',
    },
  })
}