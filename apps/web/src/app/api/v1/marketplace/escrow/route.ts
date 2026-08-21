import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/db'
import { hashIdempotencyKey } from '@/lib/crypto'
import { requireVerifiedAgent } from '@/lib/auth'
import { lockEscrow, settleEscrow, withIdempotency, type LedgerFailure } from '@/lib/ledger'
import { ledgerErrorResponse, randomTxHash } from '@/lib/api'

export const dynamic = 'force-dynamic'

type Failure = { reason: LedgerFailure; detail?: Record<string, unknown> }

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
  'Access-Control-Allow-Headers':
    'Content-Type, Authorization, x-api-key, x-idempotency-key',
}

/**
 * Find, or lazily create, the agent's escrow wallet for a currency.
 *
 * Escrowed funds sit in a wallet of their own rather than a `locked_balance`
 * column so that the double-entry ledger stays honest: money in escrow has
 * visibly left the buyer's custody wallet without yet reaching the seller.
 */
async function escrowWalletFor(
  db: ReturnType<typeof createServerClient>,
  agentId: string,
  currency: string
): Promise<string | null> {
  const { data: existing } = await db
    .from('wallets')
    .select('id')
    .eq('agent_id', agentId)
    .eq('currency', currency)
    .eq('wallet_type', 'escrow')
    .single()

  if (existing?.id) return existing.id

  const { data: created } = await db
    .from('wallets')
    .insert({
      agent_id: agentId,
      currency,
      wallet_type: 'escrow',
      balance: 0,
      status: 'active',
    })
    .select()
    .single()

  return created?.id ?? null
}

/**
 * POST /api/v1/marketplace/escrow — lock funds against a service (Layer 4).
 *
 * The buyer is the authenticated agent; the seller is read from the service
 * listing. Neither is taken from the request body, which previously allowed a
 * caller to name any buyer and move that agent's money into escrow.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireVerifiedAgent(request)
    if (!auth.ok) return auth.response

    const body = await request.json()
    const { service_id, amount, currency = 'USDC' } = body

    if (!service_id) {
      return NextResponse.json(
        { error: 'service_id is required' },
        { status: 400, headers: CORS }
      )
    }

    const db = createServerClient()

    const { data: service } = await db
      .from('services')
      .select('id, seller_agent_id, price, currency, status')
      .eq('id', service_id)
      .single()

    if (!service) {
      return NextResponse.json(
        { error: 'Service not found' },
        { status: 404, headers: CORS }
      )
    }
    if (service.status !== 'active') {
      return NextResponse.json(
        { error: 'Service is not active', code: 'SERVICE_INACTIVE' },
        { status: 409, headers: CORS }
      )
    }
    if (service.seller_agent_id === auth.agent.agentId) {
      return NextResponse.json(
        { error: 'Cannot buy your own service' },
        { status: 400, headers: CORS }
      )
    }

    // The listing price is authoritative; a body amount may only agree with it.
    const escrowAmount = service.price
    if (
      amount !== undefined &&
      (typeof amount !== 'number' || amount !== escrowAmount)
    ) {
      return NextResponse.json(
        {
          error: 'amount does not match the service price',
          code: 'PRICE_MISMATCH',
          price: escrowAmount,
        },
        { status: 400, headers: CORS }
      )
    }

    const { data: buyerWallet } = await db
      .from('wallets')
      .select('id')
      .eq('agent_id', auth.agent.agentId)
      .eq('currency', currency)
      .eq('wallet_type', 'custody')
      .single()

    if (!buyerWallet) {
      return NextResponse.json(
        { error: `No ${currency} custody wallet for this agent`, code: 'WALLET_NOT_FOUND' },
        { status: 404, headers: CORS }
      )
    }

    const holdingWalletId = await escrowWalletFor(
      db,
      auth.agent.agentId,
      currency
    )
    if (!holdingWalletId) {
      return NextResponse.json(
        { error: 'Could not open an escrow wallet' },
        { status: 500, headers: CORS }
      )
    }

    const idempotencyKey = request.headers.get('x-idempotency-key')
    const outcome = await withIdempotency(
      idempotencyKey ? hashIdempotencyKey(idempotencyKey) : null,
      async () => {
        const txHash = randomTxHash()
        const locked = await lockEscrow({
          buyerWalletId: buyerWallet.id,
          escrowWalletId: holdingWalletId,
          buyerAgentId: auth.agent.agentId,
          sellerAgentId: service.seller_agent_id,
          serviceId: service.id,
          amount: escrowAmount,
          txHash,
        })

        if (!locked.ok) {
          return { failure: { reason: locked.reason, detail: locked.detail } as Failure }
        }

        return {
          success: true,
          escrow: {
            id: locked.escrowId,
            service_id: service.id,
            buyer_agent_id: auth.agent.agentId,
            seller_agent_id: service.seller_agent_id,
            amount: escrowAmount,
            currency,
            status: 'locked',
            tx_hash: txHash,
            buyer_balance: locked.buyerBalance,
          },
        }
      }
    )

    if (outcome.status === 'in_flight') {
      return NextResponse.json(
        { error: 'A request with this idempotency key is still in progress', code: 'IDEMPOTENT_REQUEST_IN_FLIGHT' },
        { status: 409, headers: CORS }
      )
    }

    const value = outcome.value as { failure?: Failure }
    if (value.failure) return ledgerErrorResponse(value.failure)

    return NextResponse.json(value, {
      status: outcome.status === 'replayed' ? 200 : 201,
      headers: CORS,
    })
  } catch (error) {
    console.error('Escrow create error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: CORS }
    )
  }
}

/**
 * PUT /api/v1/marketplace/escrow — settle a held escrow (Layer 4).
 *
 * The buyer controls the outcome: releasing pays the seller, refunding returns
 * the funds. Letting the seller release would let them pay themselves without
 * the buyer ever accepting delivery.
 *
 * The `locked` → `released`/`refunded` transition is part of the same atomic
 * statement as the money movement, so concurrent releases cannot pay twice.
 */
export async function PUT(request: NextRequest) {
  try {
    const auth = await requireVerifiedAgent(request)
    if (!auth.ok) return auth.response

    const body = await request.json()
    const { escrow_id, action, currency = 'USDC' } = body

    if (!escrow_id || !action) {
      return NextResponse.json(
        { error: 'escrow_id and action (release/refund) are required' },
        { status: 400, headers: CORS }
      )
    }
    if (action !== 'release' && action !== 'refund') {
      return NextResponse.json(
        { error: "action must be 'release' or 'refund'" },
        { status: 400, headers: CORS }
      )
    }

    const db = createServerClient()

    const { data: escrow } = await db
      .from('escrow_orders')
      .select('id, buyer_agent_id, seller_agent_id, amount, status')
      .eq('id', escrow_id)
      .single()

    if (!escrow) {
      return NextResponse.json(
        { error: 'Escrow not found' },
        { status: 404, headers: CORS }
      )
    }

    // Report someone else's escrow as absent rather than forbidden.
    if (escrow.buyer_agent_id !== auth.agent.agentId) {
      return NextResponse.json(
        { error: 'Escrow not found' },
        { status: 404, headers: CORS }
      )
    }
    if (escrow.status !== 'locked') {
      return NextResponse.json(
        { error: `Escrow is already ${escrow.status}`, code: 'ESCROW_NOT_LOCKED' },
        { status: 409, headers: CORS }
      )
    }

    const holdingWalletId = await escrowWalletFor(
      db,
      escrow.buyer_agent_id,
      currency
    )

    const destinationAgentId =
      action === 'release' ? escrow.seller_agent_id : escrow.buyer_agent_id

    const { data: destination } = await db
      .from('wallets')
      .select('id')
      .eq('agent_id', destinationAgentId)
      .eq('currency', currency)
      .eq('wallet_type', 'custody')
      .single()

    if (!holdingWalletId || !destination) {
      return NextResponse.json(
        { error: 'Settlement wallet not found', code: 'WALLET_NOT_FOUND' },
        { status: 404, headers: CORS }
      )
    }

    const idempotencyKey = request.headers.get('x-idempotency-key')
    const outcome = await withIdempotency(
      idempotencyKey ? hashIdempotencyKey(idempotencyKey) : null,
      async () => {
        const txHash = randomTxHash()
        const settled = await settleEscrow({
          escrowId: escrow.id,
          escrowWalletId: holdingWalletId,
          destinationWalletId: destination.id,
          amount: escrow.amount,
          txHash,
          outcome: action === 'release' ? 'released' : 'refunded',
        })

        if (!settled.ok) {
          return { failure: { reason: settled.reason, detail: settled.detail } as Failure }
        }

        return {
          success: true,
          escrow_id: escrow.id,
          status: action === 'release' ? 'released' : 'refunded',
          amount: escrow.amount,
          currency,
          paid_to: destinationAgentId,
          destination_balance: settled.destinationBalance,
          tx_hash: txHash,
        }
      }
    )

    if (outcome.status === 'in_flight') {
      return NextResponse.json(
        { error: 'A request with this idempotency key is still in progress', code: 'IDEMPOTENT_REQUEST_IN_FLIGHT' },
        { status: 409, headers: CORS }
      )
    }

    const value = outcome.value as { failure?: Failure }
    if (value.failure) return ledgerErrorResponse(value.failure)

    await db.from('audit_logs').insert({
      agent_id: auth.agent.agentId,
      action: `escrow_${action}`,
      details: { escrow_id: escrow.id, amount: escrow.amount },
      ip_address: request.headers.get('x-forwarded-for') || undefined,
    })

    return NextResponse.json(value, { status: 200, headers: CORS })
  } catch (error) {
    console.error('Escrow settle error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: CORS }
    )
  }
}

/** GET /api/v1/marketplace/escrow — the caller's escrow orders. */
export async function GET(request: NextRequest) {
  const auth = await requireVerifiedAgent(request)
  if (!auth.ok) return auth.response

  const db = createServerClient()
  const { data: asBuyer } = await db
    .from('escrow_orders')
    .select('*')
    .eq('buyer_agent_id', auth.agent.agentId)
    .order('created_at', { ascending: false })

  const { data: asSeller } = await db
    .from('escrow_orders')
    .select('*')
    .eq('seller_agent_id', auth.agent.agentId)
    .order('created_at', { ascending: false })

  return NextResponse.json(
    { buying: asBuyer ?? [], selling: asSeller ?? [] },
    { headers: CORS }
  )
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS })
}
