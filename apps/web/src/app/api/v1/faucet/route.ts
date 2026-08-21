import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/db'
import { requireAgent } from '@/lib/auth'
import { claimFaucet } from '@/lib/ledger'
import { ledgerErrorResponse, randomTxHash } from '@/lib/api'

export const dynamic = 'force-dynamic'

const FAUCET_AMOUNT = 10000 // 10,000 UNIT (cents = 100 USD)
const CLAIM_COOLDOWN_HOURS = 24

/**
 * POST /api/v1/faucet — claim testnet funds (ABOS testnet only).
 *
 * The claiming agent is taken from the API key, never from the request body:
 * previously any caller could name any `agent_id` and drain the faucet on its
 * behalf. The cooldown is enforced inside the same statement that credits the
 * wallet, so simultaneous claims cannot both pass the check.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAgent(request)
    if (!auth.ok) return auth.response

    const supabase = createServerClient()

    // The agent's primary custody wallet receives the funds.
    const { data: wallet } = await supabase
      .from('wallets')
      .select('id, balance, status')
      .eq('agent_id', auth.agent.agentId)
      .eq('wallet_type', 'custody')
      .eq('currency', 'USDC')
      .single()

    if (!wallet) {
      return NextResponse.json(
        { error: 'No USDC custody wallet found for this agent', code: 'WALLET_NOT_FOUND' },
        { status: 404 }
      )
    }

    const txHash = randomTxHash()
    const claimed = await claimFaucet({
      agentId: auth.agent.agentId,
      walletId: wallet.id,
      amount: FAUCET_AMOUNT,
      cooldownHours: CLAIM_COOLDOWN_HOURS,
      txHash,
    })

    if (!claimed.ok) {
      return ledgerErrorResponse({ reason: claimed.reason, detail: claimed.detail })
    }

    await supabase.from('audit_logs').insert({
      agent_id: auth.agent.agentId,
      action: 'faucet_claim',
      details: { amount: FAUCET_AMOUNT, wallet_id: wallet.id, tx_hash: txHash },
      ip_address: request.headers.get('x-forwarded-for') || undefined,
    })

    return NextResponse.json(
      {
        success: true,
        claimed: FAUCET_AMOUNT,
        unit: 'UNIT',
        message: `You received ${FAUCET_AMOUNT / 100} USDC TEST tokens`,
        wallet_id: wallet.id,
        wallet_balance: claimed.balance,
        claimed_at: claimed.claimedAt,
        next_claim_after: new Date(
          new Date(claimed.claimedAt).getTime() + CLAIM_COOLDOWN_HOURS * 3600_000
        ).toISOString(),
        tx_hash: txHash,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Faucet error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** GET /api/v1/faucet — when may this agent claim again? */
export async function GET(request: NextRequest) {
  const auth = await requireAgent(request)
  if (!auth.ok) return auth.response

  const supabase = createServerClient()
  const { data: claims } = await supabase
    .from('faucet_claims')
    .select('claimed_at')
    .eq('agent_id', auth.agent.agentId)
    .order('claimed_at', { ascending: false })
    .limit(1)

  const last = claims?.[0]?.claimed_at as string | undefined
  const nextAllowed = last
    ? new Date(new Date(last).getTime() + CLAIM_COOLDOWN_HOURS * 3600_000)
    : null

  return NextResponse.json({
    amount: FAUCET_AMOUNT,
    cooldown_hours: CLAIM_COOLDOWN_HOURS,
    last_claim: last ?? null,
    can_claim: !nextAllowed || nextAllowed <= new Date(),
    next_claim_after: nextAllowed?.toISOString() ?? null,
  })
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, x-api-key, x-idempotency-key',
    },
  })
}
