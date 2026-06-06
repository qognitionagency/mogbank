import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { hashIdempotencyKey } from '@/lib/crypto'
import { v4 as uuidv4 } from 'uuid'

export const dynamic = 'force-dynamic'

// A2A (Agent-to-Agent) protocol fee: 0.10%
const A2A_FEE_RATE = 0.001

const idempotencyStore = new Map<string, { response: unknown; timestamp: number }>()

setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000
  for (const [k, v] of idempotencyStore) {
    if (v.timestamp < cutoff) idempotencyStore.delete(k)
  }
}, 60_000).unref?.()

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-idempotency-key',
    },
  })
}

// POST /api/v1/payments/a2a
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      sender_agent_id,
      receiver_agent_id,
      amount,
      currency = 'USDC',
      memo,
      metadata = {},
    } = body

    if (!sender_agent_id || !receiver_agent_id || !amount) {
      return NextResponse.json(
        { error: 'sender_agent_id, receiver_agent_id, and amount are required' },
        { status: 400 }
      )
    }

    if (typeof amount !== 'number' || amount <= 0 || !Number.isInteger(amount)) {
      return NextResponse.json(
        { error: 'amount must be a positive integer (USDC cents)' },
        { status: 400 }
      )
    }

    if (sender_agent_id === receiver_agent_id) {
      return NextResponse.json(
        { error: 'sender and receiver must be different agents' },
        { status: 400 }
      )
    }

    // Idempotency
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

    // Verify sender agent and get wallet
    const { data: senderAgent } = await supabase
      .from('agents')
      .select('id, kya_status, status')
      .eq('id', sender_agent_id)
      .single()

    if (!senderAgent) {
      return NextResponse.json({ error: 'Sender agent not found' }, { status: 404 })
    }
    if (senderAgent.status !== 'active') {
      return NextResponse.json({ error: 'Sender agent is not active' }, { status: 403 })
    }
    if (senderAgent.kya_status !== 'verified') {
      return NextResponse.json(
        { error: 'Sender agent must be KYA-verified to initiate A2A payments' },
        { status: 403 }
      )
    }

    // Verify receiver agent
    const { data: receiverAgent } = await supabase
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

    // Get sender wallet
    const { data: senderWallet } = await supabase
      .from('wallets')
      .select('id, balance, status')
      .eq('agent_id', sender_agent_id)
      .eq('currency', currency)
      .eq('wallet_type', 'custody')
      .single()

    if (!senderWallet) {
      return NextResponse.json(
        { error: `Sender has no ${currency} custody wallet` },
        { status: 404 }
      )
    }
    if (senderWallet.status !== 'active') {
      return NextResponse.json({ error: 'Sender wallet is frozen' }, { status: 403 })
    }

    // Get receiver wallet
    const { data: receiverWallet } = await supabase
      .from('wallets')
      .select('id, balance, status')
      .eq('agent_id', receiver_agent_id)
      .eq('currency', currency)
      .eq('wallet_type', 'custody')
      .single()

    if (!receiverWallet) {
      return NextResponse.json(
        { error: `Receiver has no ${currency} custody wallet` },
        { status: 404 }
      )
    }

    const fee = Math.ceil(amount * A2A_FEE_RATE)
    const totalDebit = amount + fee

    if (senderWallet.balance < totalDebit) {
      return NextResponse.json(
        {
          error: 'Insufficient balance',
          required: totalDebit,
          available: senderWallet.balance,
          fee,
        },
        { status: 422 }
      )
    }

    // Check spending controls
    const { data: controls } = await supabase
      .from('spending_controls')
      .select('daily_limit, session_limit, allowed_currencies, counterparty_blocklist')
      .eq('agent_id', sender_agent_id)
      .single()

    if (controls) {
      if (!controls.allowed_currencies.includes(currency)) {
        return NextResponse.json(
          { error: `Currency ${currency} not permitted by spending controls` },
          { status: 403 }
        )
      }
      if (controls.counterparty_blocklist?.includes(receiver_agent_id)) {
        return NextResponse.json(
          { error: 'Receiver agent is on sender blocklist' },
          { status: 403 }
        )
      }
      if (amount > (controls.session_limit ?? Infinity)) {
        return NextResponse.json(
          { error: 'Amount exceeds session limit', session_limit: controls.session_limit },
          { status: 422 }
        )
      }
    }

    const paymentId = uuidv4()
    const now = new Date().toISOString()

    // Debit sender
    await supabase
      .from('wallets')
      .update({ balance: senderWallet.balance - totalDebit, updated_at: now })
      .eq('id', senderWallet.id)

    // Credit receiver
    await supabase
      .from('wallets')
      .update({ balance: receiverWallet.balance + amount, updated_at: now })
      .eq('id', receiverWallet.id)

    // Record transactions
    await supabase.from('transactions').insert([
      {
        id: paymentId,
        wallet_id: senderWallet.id,
        counterparty_wallet_id: receiverWallet.id,
        type: 'payment',
        amount,
        fee,
        status: 'confirmed',
        ledger_entry: 'debit',
        protocol: 'a2a',
        confirmed_at: now,
        metadata: {
          payment_id: paymentId,
          memo,
          a2a_version: '1.0',
          sender_agent_id,
          receiver_agent_id,
          ...metadata,
        },
      },
      {
        wallet_id: receiverWallet.id,
        counterparty_wallet_id: senderWallet.id,
        type: 'payment',
        amount,
        fee: 0,
        status: 'confirmed',
        ledger_entry: 'credit',
        protocol: 'a2a',
        confirmed_at: now,
        metadata: {
          payment_id: paymentId,
          memo,
          a2a_version: '1.0',
          sender_agent_id,
          receiver_agent_id,
          ...metadata,
        },
      },
    ])

    // Audit log
    await supabase.from('audit_logs').insert({
      agent_id: sender_agent_id,
      action: 'a2a_payment',
      details: {
        payment_id: paymentId,
        receiver_agent_id,
        amount,
        fee,
        currency,
      },
      ip_address: request.headers.get('x-forwarded-for') ?? undefined,
      user_agent: request.headers.get('user-agent') ?? undefined,
    })

    const response = {
      payment_id: paymentId,
      protocol: 'a2a',
      a2a_version: '1.0',
      status: 'confirmed',
      sender_agent_id,
      receiver_agent_id,
      amount,
      fee,
      total_debited: totalDebit,
      currency,
      memo: memo ?? null,
      confirmed_at: now,
      sender_balance_after: senderWallet.balance - totalDebit,
      receiver_balance_after: receiverWallet.balance + amount,
    }

    if (idempotencyKey) {
      const hash = hashIdempotencyKey(idempotencyKey)
      idempotencyStore.set(hash, { response, timestamp: Date.now() })
    }

    return NextResponse.json(response, { status: 201 })
  } catch (err) {
    console.error('A2A payment error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
