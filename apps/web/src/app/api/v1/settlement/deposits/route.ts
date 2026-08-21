import { NextRequest, NextResponse } from 'next/server'
import { requireAgent } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import { creditDeposit } from '@/lib/ledger'
import { ledgerErrorResponse } from '@/lib/api'
import { chainConfig, settlementEnabled, verifyDeposit } from '@/lib/chain'

export const dynamic = 'force-dynamic'

const REJECTION_STATUS: Record<string, number> = {
  SETTLEMENT_DISABLED: 503,
  TX_NOT_FOUND: 404,
  TX_NOT_CONFIRMED: 202,
  TX_FAILED: 400,
  NOT_A_USDC_TRANSFER: 400,
  WRONG_RECIPIENT: 400,
  DUST_AMOUNT: 400,
}

/**
 * POST /api/v1/settlement/deposits — credit an on-chain USDC deposit.
 *
 * The agent sends USDC to the treasury address, then submits only the
 * transaction hash. Amount, sender and token are all read back from the chain:
 * nothing the caller asserts about the deposit is believed, because a caller
 * that could assert an amount could mint itself a balance.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAgent(request)
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

    const { tx_hash } = await request.json()
    if (typeof tx_hash !== 'string' || !/^0x[0-9a-fA-F]{64}$/.test(tx_hash)) {
      return NextResponse.json(
        { error: 'tx_hash must be a 32-byte hex transaction hash', code: 'INVALID_TX_HASH' },
        { status: 400 }
      )
    }

    const verified = await verifyDeposit(tx_hash)
    if (!verified.ok) {
      return NextResponse.json(
        {
          error: 'Deposit could not be verified on-chain',
          code: verified.reason,
          ...(verified.detail ?? {}),
        },
        { status: REJECTION_STATUS[verified.reason] ?? 400 }
      )
    }

    const db = createServerClient()
    const { data: wallet } = await db
      .from('wallets')
      .select('id')
      .eq('agent_id', auth.agent.agentId)
      .eq('currency', 'USDC')
      .eq('wallet_type', 'custody')
      .single()

    if (!wallet) {
      return NextResponse.json(
        { error: 'No USDC custody wallet for this agent', code: 'WALLET_NOT_FOUND' },
        { status: 404 }
      )
    }

    const config = chainConfig()
    const credited = await creditDeposit({
      agentId: auth.agent.agentId,
      walletId: wallet.id,
      amount: verified.deposit.amountCents,
      txHash: verified.deposit.txHash,
      chainId: verified.deposit.chainId,
      tokenAddress: config.usdcAddress,
      fromAddress: verified.deposit.from,
      confirmations: verified.deposit.confirmations,
    })

    if (!credited.ok) {
      return ledgerErrorResponse({ reason: credited.reason, detail: credited.detail })
    }

    return NextResponse.json(
      {
        success: true,
        deposit: {
          id: credited.depositId,
          amount: verified.deposit.amountCents,
          amount_usdc: verified.deposit.amountUsdc,
          from: verified.deposit.from,
          tx_hash: verified.deposit.txHash,
          chain_id: verified.deposit.chainId,
          explorer_url: verified.deposit.explorerUrl,
        },
        wallet_balance: credited.balance,
      },
      { status: 201 }
    )
  } catch (error) {
    console.error('Deposit error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

/** GET /api/v1/settlement/deposits — this agent's credited deposits. */
export async function GET(request: NextRequest) {
  const auth = await requireAgent(request)
  if (!auth.ok) return auth.response

  const db = createServerClient()
  const { data } = await db
    .from('onchain_deposits')
    .select('*')
    .eq('agent_id', auth.agent.agentId)
    .order('credited_at', { ascending: false })

  return NextResponse.json({ deposits: data ?? [] })
}
