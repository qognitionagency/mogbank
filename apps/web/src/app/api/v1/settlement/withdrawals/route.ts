import { NextRequest, NextResponse } from 'next/server'
import { requireVerifiedAgent, requireWalletOwner } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import {
  failWithdrawal,
  markWithdrawalSubmitted,
  reserveWithdrawal,
} from '@/lib/ledger'
import { ledgerErrorResponse } from '@/lib/api'
import {
  chainConfig,
  isValidAddress,
  settlementEnabled,
  submitWithdrawal,
} from '@/lib/chain'

export const dynamic = 'force-dynamic'

/**
 * POST /api/v1/settlement/withdrawals — pay USDC out to an address.
 *
 * Ordering matters and is deliberate: the wallet is debited and the intent
 * recorded in one atomic statement *before* anything is broadcast. If the
 * broadcast then fails the funds are returned; if the process dies in between,
 * a `pending` row is left to reconcile. Broadcasting first could pay real money
 * out with no record of it, which cannot be recovered from.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireVerifiedAgent(request)
    if (!auth.ok) return auth.response

    if (!settlementEnabled()) {
      return NextResponse.json(
        {
          error: 'On-chain settlement is not configured on this deployment.',
          code: 'SETTLEMENT_DISABLED',
        },
        { status: 503 }
      )
    }

    const { wallet_id, to_address, amount } = await request.json()

    if (!to_address || !isValidAddress(to_address)) {
      return NextResponse.json(
        { error: 'to_address must be a valid EVM address', code: 'INVALID_ADDRESS' },
        { status: 400 }
      )
    }
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'amount must be a positive integer in cents', code: 'INVALID_AMOUNT' },
        { status: 400 }
      )
    }

    const db = createServerClient()
    let walletId = wallet_id
    if (!walletId) {
      const { data: wallet } = await db
        .from('wallets')
        .select('id')
        .eq('agent_id', auth.agent.agentId)
        .eq('currency', 'USDC')
        .eq('wallet_type', 'custody')
        .single()
      walletId = wallet?.id
    }

    const owned = await requireWalletOwner(auth.agent, walletId)
    if (!owned.ok) return owned.response

    const config = chainConfig()
    const reserved = await reserveWithdrawal({
      agentId: auth.agent.agentId,
      walletId: owned.wallet.id,
      amount,
      toAddress: to_address,
      chainId: config.chainId,
    })

    if (!reserved.ok) {
      return ledgerErrorResponse({ reason: reserved.reason, detail: reserved.detail })
    }

    try {
      const submitted = await submitWithdrawal(to_address, amount)
      await markWithdrawalSubmitted(reserved.withdrawalId, submitted.txHash)

      return NextResponse.json(
        {
          success: true,
          withdrawal: {
            id: reserved.withdrawalId,
            status: 'submitted',
            amount,
            amount_usdc: submitted.amountUsdc,
            to_address,
            tx_hash: submitted.txHash,
            chain_id: submitted.chainId,
            explorer_url: submitted.explorerUrl,
          },
          wallet_balance: reserved.balance,
        },
        { status: 201 }
      )
    } catch (broadcastError) {
      const message =
        broadcastError instanceof Error ? broadcastError.message : String(broadcastError)
      await failWithdrawal(reserved.withdrawalId, message)
      console.error('Withdrawal broadcast failed:', message)
      return NextResponse.json(
        {
          error: 'Withdrawal could not be broadcast; your balance has been restored.',
          code: 'BROADCAST_FAILED',
          detail: message,
        },
        { status: 502 }
      )
    }
  } catch (error) {
    console.error('Withdrawal error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** GET /api/v1/settlement/withdrawals — this agent's payouts. */
export async function GET(request: NextRequest) {
  const auth = await requireVerifiedAgent(request)
  if (!auth.ok) return auth.response

  const db = createServerClient()
  const { data } = await db
    .from('onchain_withdrawals')
    .select('*')
    .eq('agent_id', auth.agent.agentId)
    .order('requested_at', { ascending: false })

  return NextResponse.json({ withdrawals: data ?? [] })
}
