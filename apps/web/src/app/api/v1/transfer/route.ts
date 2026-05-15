import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { hashIdempotencyKey } from '@/lib/crypto'
import { v4 as uuidv4 } from 'uuid'

export const dynamic = 'force-dynamic'

const X402_FEE_RATE = 0.0015 // 0.15% x402 protocol fee

// In-memory idempotency & ledger store
const idempotencyStore = new Map<
  string,
  { response: unknown; timestamp: number }
>()
// Storage for pending ledger entries (keyed by idempotency hash)
const pendingLedgerStore = new Map<
  string,
  {
    agentId: string
    fromWalletId: string
    toWalletId: string
    amount: number
    fee: number
    timestamp: number
  }
>()

setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000
  for (const [k, v] of idempotencyStore) {
    if (v.timestamp < cutoff) idempotencyStore.delete(k)
  }
  for (const [k, v] of pendingLedgerStore) {
    if (v.timestamp < cutoff) pendingLedgerStore.delete(k)
  }
}, 60_000).unref?.()

export async function POST(request: NextRequest) {
  try {
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

    if (typeof amount !== 'number' || amount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number (in USDC cents)' },
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

    // Get sender wallet with agent info
    const { data: fromWallet, error: fromError } = await supabase
      .from('wallets')
      .select('*, agents!inner(*)')
      .eq('id', from_wallet_id)
      .single()

    if (fromError || !fromWallet) {
      return NextResponse.json(
        { error: 'Sender wallet not found' },
        { status: 404 }
      )
    }

    // Verify mandate signature if provided (x402 Layer 6 compliance)
    if (mandate_signature && mandate_payload) {
      const { data: agentData } = await supabase
        .from('agents')
        .select('public_key')
        .eq('id', fromWallet.agents?.id || fromWallet.agent_id)
        .single()

      if (agentData?.public_key) {
        const { verifyMandateSignature } = await import('@/lib/crypto')
        const isValid = await verifyMandateSignature(
          mandate_payload,
          mandate_signature,
          agentData.public_key
        )
        if (!isValid) {
          return NextResponse.json(
            { error: 'Invalid mandate signature — authorization denied' },
            { status: 403 }
          )
        }
      }
    }

    const agentId = fromWallet.agents?.id || fromWallet.agent_id

    // Get spending controls
    const { data: controls } = await supabase
      .from('spending_controls')
      .select('*')
      .eq('agent_id', agentId)
      .single()

    // Check daily limit
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data: todayTransactions } = await supabase
      .from('transactions')
      .select('amount')
      .eq('wallet_id', from_wallet_id)
      .gte('created_at', today.toISOString())
      .eq('status', 'confirmed')

    const todayTotal =
      todayTransactions?.reduce(
        (sum: number, t: { amount: number }) => sum + t.amount,
        0
      ) || 0

    if (controls && todayTotal + amount > controls.daily_limit) {
      return NextResponse.json(
        {
          error: 'Daily limit exceeded',
          daily_limit: controls.daily_limit,
          spent_today: todayTotal,
          attempted: amount,
        },
        { status: 403 }
      )
    }

    // Check sender balance
    const fee = Math.floor(amount * X402_FEE_RATE)
    const totalDeduction = amount + fee

    if (fromWallet.balance < totalDeduction) {
      return NextResponse.json(
        {
          error: 'Insufficient balance',
          balance: fromWallet.balance,
          required: totalDeduction,
        },
        { status: 400 }
      )
    }

    // Get recipient wallet
    const { data: toWallet, error: toError } = await supabase
      .from('wallets')
      .select('*')
      .eq('id', to_wallet_id)
      .single()

    if (toError || !toWallet) {
      return NextResponse.json(
        { error: 'Recipient wallet not found' },
        { status: 404 }
      )
    }

    const txHash =
      '0x' +
      Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('')
    const txId = uuidv4()

    // -- DOUBLE-ENTRY LEDGER --
    // 1. Debit sender wallet
    const { error: debitError } = await supabase
      .from('wallets')
      .update({ balance: fromWallet.balance - totalDeduction })
      .eq('id', from_wallet_id)

    if (debitError) {
      return NextResponse.json(
        { error: 'Transfer failed — debit error' },
        { status: 500 }
      )
    }

    // 2. Credit recipient wallet
    const { error: creditError } = await supabase
      .from('wallets')
      .update({ balance: toWallet.balance + amount })
      .eq('id', to_wallet_id)

    if (creditError) {
      // Rollback debit
      await supabase
        .from('wallets')
        .update({ balance: fromWallet.balance })
        .eq('id', from_wallet_id)

      return NextResponse.json(
        { error: 'Transfer failed — credit error' },
        { status: 500 }
      )
    }

    // 3. Record double-entry ledger transactions
    // Debit entry for sender
    const { error: debitTxError } = await supabase.from('transactions').insert({
      wallet_id: from_wallet_id,
      counterparty_wallet_id: to_wallet_id,
      type: 'transfer',
      amount,
      fee,
      status: 'confirmed',
      tx_hash: txHash,
      protocol,
      ledger_entry: 'debit',
      confirmed_at: new Date().toISOString(),
    })

    // Credit entry for recipient
    const { error: creditTxError } = await supabase
      .from('transactions')
      .insert({
        wallet_id: to_wallet_id,
        counterparty_wallet_id: from_wallet_id,
        type: 'transfer',
        amount,
        fee: 0,
        status: 'confirmed',
        tx_hash: txHash,
        protocol,
        ledger_entry: 'credit',
        confirmed_at: new Date().toISOString(),
      })

    // Fee collection entry (x402 protocol fee)
    if (fee > 0) {
      await supabase.from('transactions').insert({
        wallet_id: from_wallet_id,
        type: 'fee',
        amount: 0,
        fee,
        status: 'confirmed',
        tx_hash: txHash,
        protocol,
        ledger_entry: 'fee_debit',
        confirmed_at: new Date().toISOString(),
      })
    }

    // 4. Audit log
    await supabase.from('audit_logs').insert({
      agent_id: agentId,
      action: 'transfer_completed',
      details: {
        from_wallet_id,
        to_wallet_id,
        amount,
        fee,
        txHash,
        protocol,
        idempotency_key_hash: idempotencyKey
          ? hashIdempotencyKey(idempotencyKey)
          : undefined,
      },
      ip_address: request.headers.get('x-forwarded-for') || undefined,
      user_agent: request.headers.get('user-agent') || undefined,
    })

    const responseBody = {
      success: true,
      transaction: {
        id: txId,
        tx_hash: txHash,
        amount,
        fee,
        protocol,
        from_wallet: from_wallet_id,
        to_wallet: to_wallet_id,
        status: 'confirmed',
        ledger_entries: {
          debit: { wallet: from_wallet_id, amount: totalDeduction },
          credit: { wallet: to_wallet_id, amount },
          fee: { amount: fee, rate: X402_FEE_RATE },
        },
      },
    }

    // Store idempotency response
    if (idempotencyKey) {
      idempotencyStore.set(hashIdempotencyKey(idempotencyKey), {
        response: responseBody,
        timestamp: Date.now(),
      })
    }

    return NextResponse.json(responseBody, {
      status: 200,
      ...(idempotencyKey && {
        headers: { 'x-idempotency-key': idempotencyKey },
      }),
    })
  } catch (error) {
    console.error('Transfer error:', error)
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
        'Content-Type, x-api-key, x-idempotency-key, x-mandate-signature',
    },
  })
}