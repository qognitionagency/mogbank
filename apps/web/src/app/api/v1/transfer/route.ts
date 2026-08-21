import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/db'
import { hashIdempotencyKey, verifyMandateSignature } from '@/lib/crypto'
import { requireVerifiedAgent, requireWalletOwner } from '@/lib/auth'
import { transferFunds, withIdempotency, type LedgerFailure } from '@/lib/ledger'
import { ledgerErrorResponse, randomTxHash } from '@/lib/api'

export const dynamic = 'force-dynamic'

const X402_FEE_RATE = 0.0015 // 0.15% x402 protocol fee

type Failure = { reason: LedgerFailure; detail?: Record<string, unknown> }

/**
 * POST /api/v1/transfer — move funds between wallets (ABOS Layer 3).
 *
 * The caller must present the API key of the agent that owns the *sending*
 * wallet. Ownership is re-derived from the database rather than taken from the
 * request body, so knowing a wallet id is never enough to spend from it.
 *
 * The movement itself is one atomic statement (see `@/lib/ledger`); this
 * handler only decides whether it is allowed.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireVerifiedAgent(request)
    if (!auth.ok) return auth.response

    const body = await request.json()
    const {
      from_wallet_id,
      to_wallet_id,
      amount,
      protocol = 'x402',
      mandate_signature,
      mandate_payload,
    } = body

    if (!from_wallet_id || !to_wallet_id || !amount) {
      return NextResponse.json(
        { error: 'from_wallet_id, to_wallet_id, and amount are required' },
        { status: 400 }
      )
    }

    // Balances are BIGINT in the smallest denomination unit, so a fractional
    // amount has no representation.
    if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive integer in USDC cents', code: 'INVALID_AMOUNT' },
        { status: 400 }
      )
    }

    const owned = await requireWalletOwner(auth.agent, from_wallet_id)
    if (!owned.ok) return owned.response

    // Mandate verification (ABOS Layer 6): a delegated authorisation signed by
    // the agent's Ed25519 key.
    const db = createServerClient()
    if (mandate_signature && mandate_payload) {
      const { data: agentRow } = await db
        .from('agents')
        .select('public_key')
        .eq('id', auth.agent.agentId)
        .single()

      const valid = agentRow?.public_key
        ? await verifyMandateSignature(mandate_payload, mandate_signature, agentRow.public_key)
        : false

      if (!valid) {
        return NextResponse.json(
          { error: 'Invalid mandate signature — authorization denied', code: 'INVALID_MANDATE' },
          { status: 403 }
        )
      }
    }

    const fee = Math.round(amount * X402_FEE_RATE)

    // --- Spending controls (ABOS Layer 3) ---
    const { data: controls } = await db
      .from('spending_controls')
      .select('daily_limit, session_limit, allowed_currencies, counterparty_blocklist')
      .eq('agent_id', auth.agent.agentId)
      .single()

    if (controls) {
      const allowed = controls.allowed_currencies
      if (Array.isArray(allowed) && allowed.length > 0 && !allowed.includes(owned.wallet.currency)) {
        return NextResponse.json(
          { error: 'Currency not permitted for this agent', code: 'CURRENCY_NOT_ALLOWED', currency: owned.wallet.currency },
          { status: 403 }
        )
      }

      const blocked = controls.counterparty_blocklist
      if (Array.isArray(blocked) && blocked.includes(to_wallet_id)) {
        return NextResponse.json(
          { error: 'Counterparty is blocked', code: 'COUNTERPARTY_BLOCKED' },
          { status: 403 }
        )
      }

      if (controls.session_limit && amount > controls.session_limit) {
        return NextResponse.json(
          { error: 'Amount exceeds per-transaction limit', code: 'SESSION_LIMIT_EXCEEDED', session_limit: controls.session_limit, attempted: amount },
          { status: 403 }
        )
      }

      const midnight = new Date()
      midnight.setHours(0, 0, 0, 0)
      const { data: todaysDebits } = await db
        .from('transactions')
        .select('amount')
        .eq('wallet_id', from_wallet_id)
        .eq('ledger_entry', 'debit')
        .eq('status', 'confirmed')
        .gte('created_at', midnight.toISOString())

      const spentToday = (todaysDebits ?? []).reduce(
        (sum: number, t: { amount: number }) => sum + t.amount,
        0
      )

      if (controls.daily_limit && spentToday + amount > controls.daily_limit) {
        return NextResponse.json(
          { error: 'Daily limit exceeded', code: 'DAILY_LIMIT_EXCEEDED', daily_limit: controls.daily_limit, spent_today: spentToday, attempted: amount },
          { status: 403 }
        )
      }
    }

    // --- Execute ---
    const idempotencyKey = request.headers.get('x-idempotency-key')
    const outcome = await withIdempotency(
      idempotencyKey ? hashIdempotencyKey(idempotencyKey) : null,
      async () => {
        const txHash = randomTxHash()
        const moved = await transferFunds({
          fromWalletId: from_wallet_id,
          toWalletId: to_wallet_id,
          amount,
          fee,
          protocol,
          type: 'transfer',
          txHash,
          metadata: { initiated_by: auth.agent.agentId },
        })

        if (!moved.ok) {
          return { failure: { reason: moved.reason, detail: moved.detail } as Failure }
        }

        return {
          success: true,
          transaction: {
            id: moved.transactionId,
            tx_hash: txHash,
            amount,
            fee,
            protocol,
            from_wallet: from_wallet_id,
            to_wallet: to_wallet_id,
            status: 'confirmed',
            ledger_entries: {
              debit: { wallet: from_wallet_id, amount: amount + fee },
              credit: { wallet: to_wallet_id, amount },
              fee: { amount: fee, rate: X402_FEE_RATE },
            },
            balances: { from: moved.fromBalance, to: moved.toBalance },
          },
        }
      }
    )

    if (outcome.status === 'in_flight') {
      return NextResponse.json(
        { error: 'A request with this idempotency key is still in progress', code: 'IDEMPOTENT_REQUEST_IN_FLIGHT' },
        { status: 409 }
      )
    }

    const value = outcome.value as { failure?: Failure }
    if (value.failure) return ledgerErrorResponse(value.failure)

    return NextResponse.json(value, {
      status: outcome.status === 'replayed' ? 200 : 201,
      headers: idempotencyKey ? { 'x-idempotency-key': idempotencyKey } : {},
    })
  } catch (error) {
    console.error('Transfer error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, Authorization, x-api-key, x-idempotency-key, x-mandate-signature',
    },
  })
}
