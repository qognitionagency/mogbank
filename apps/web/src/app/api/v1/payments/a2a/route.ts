import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/db'
import { hashIdempotencyKey } from '@/lib/crypto'
import { requireVerifiedAgent } from '@/lib/auth'
import { transferFunds, withIdempotency, type LedgerFailure } from '@/lib/ledger'
import { ledgerErrorResponse, randomTxHash } from '@/lib/api'

export const dynamic = 'force-dynamic'

const A2A_FEE_RATE = 0.001

type Failure = { reason: LedgerFailure; detail?: Record<string, unknown> }

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, x-api-key, x-idempotency-key',
    },
  })
}

/**
 * POST /api/v1/payments/a2a — agent-to-agent payment (A2A v1.0).
 *
 * The sender is the authenticated agent. `sender_agent_id` in the body is
 * still accepted for compatibility but must match the key's owner: it used to
 * be taken on trust, which let any caller spend from any agent's wallet.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireVerifiedAgent(request)
    if (!auth.ok) return auth.response

    const body = await request.json()
    const {
      sender_agent_id,
      receiver_agent_id,
      amount,
      currency = 'USDC',
      memo,
      metadata = {},
    } = body

    if (!receiver_agent_id || !amount) {
      return NextResponse.json(
        { error: 'receiver_agent_id and amount are required' },
        { status: 400 }
      )
    }

    if (sender_agent_id && sender_agent_id !== auth.agent.agentId) {
      return NextResponse.json(
        {
          error: 'sender_agent_id does not match the authenticated agent',
          code: 'SENDER_MISMATCH',
        },
        { status: 403 }
      )
    }

    const senderAgentId = auth.agent.agentId

    if (typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount)) {
      return NextResponse.json(
        { error: 'amount must be a positive integer (USDC cents)', code: 'INVALID_AMOUNT' },
        { status: 400 }
      )
    }

    if (senderAgentId === receiver_agent_id) {
      return NextResponse.json(
        { error: 'sender and receiver must be different agents' },
        { status: 400 }
      )
    }

    const db = createServerClient()

    const { data: receiverAgent } = await db
      .from('agents')
      .select('id, status')
      .eq('id', receiver_agent_id)
      .single()

    if (!receiverAgent) {
      return NextResponse.json({ error: 'Receiver agent not found' }, { status: 404 })
    }
    if (receiverAgent.status !== 'active') {
      return NextResponse.json({ error: 'Receiver agent is not active' }, { status: 403 })
    }

    const { data: senderWallet } = await db
      .from('wallets')
      .select('id')
      .eq('agent_id', senderAgentId)
      .eq('currency', currency)
      .eq('wallet_type', 'custody')
      .single()

    if (!senderWallet) {
      return NextResponse.json(
        { error: `Sender has no ${currency} custody wallet`, code: 'WALLET_NOT_FOUND' },
        { status: 404 }
      )
    }

    const { data: receiverWallet } = await db
      .from('wallets')
      .select('id')
      .eq('agent_id', receiver_agent_id)
      .eq('currency', currency)
      .eq('wallet_type', 'custody')
      .single()

    if (!receiverWallet) {
      return NextResponse.json(
        { error: `Receiver has no ${currency} custody wallet`, code: 'WALLET_NOT_FOUND' },
        { status: 404 }
      )
    }

    const fee = Math.ceil(amount * A2A_FEE_RATE)
    const idempotencyKey = request.headers.get('x-idempotency-key')

    const outcome = await withIdempotency(
      idempotencyKey ? hashIdempotencyKey(idempotencyKey) : null,
      async () => {
        const txHash = randomTxHash()
        const moved = await transferFunds({
          fromWalletId: senderWallet.id,
          toWalletId: receiverWallet.id,
          amount,
          fee,
          protocol: 'a2a',
          type: 'payment',
          txHash,
          metadata: {
            memo: memo ?? null,
            a2a_version: '1.0',
            sender_agent_id: senderAgentId,
            receiver_agent_id,
            ...metadata,
          },
        })

        if (!moved.ok) {
          return { failure: { reason: moved.reason, detail: moved.detail } as Failure }
        }

        return {
          payment_id: moved.transactionId,
          protocol: 'a2a',
          a2a_version: '1.0',
          status: 'confirmed',
          sender_agent_id: senderAgentId,
          receiver_agent_id,
          amount,
          fee,
          total_debited: amount + fee,
          currency,
          memo: memo ?? null,
          tx_hash: txHash,
          confirmed_at: new Date().toISOString(),
          sender_balance_after: moved.fromBalance,
          receiver_balance_after: moved.toBalance,
        }
      }
    )

    if (outcome.status === 'in_flight') {
      return NextResponse.json(
        {
          error: 'A request with this idempotency key is still in progress',
          code: 'IDEMPOTENT_REQUEST_IN_FLIGHT',
        },
        { status: 409 }
      )
    }

    const value = outcome.value as { failure?: Failure }
    if (value.failure) return ledgerErrorResponse(value.failure)

    await db.from('audit_logs').insert({
      agent_id: senderAgentId,
      action: 'a2a_payment',
      details: { receiver_agent_id, amount, fee, currency },
      ip_address: request.headers.get('x-forwarded-for') || undefined,
    })

    return NextResponse.json(value, {
      status: outcome.status === 'replayed' ? 200 : 201,
      headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {},
    })
  } catch (error) {
    console.error('A2A payment error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
