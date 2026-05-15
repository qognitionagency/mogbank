import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { hashIdempotencyKey } from '@/lib/crypto'
import { v4 as uuidv4 } from 'uuid'

export const dynamic = 'force-dynamic'

const ESCROW_FEE_RATE = 0.01 // 1% marketplace escrow fee

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
    const { buyer_agent_id, seller_agent_id, service_id, amount } = body

    if (!buyer_agent_id || !seller_agent_id || !service_id || !amount) {
      return NextResponse.json(
        {
          error:
            'buyer_agent_id, seller_agent_id, service_id, and amount are required',
        },
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

    // Verify buyer and seller agents exist
    const { data: buyer } = await supabase
      .from('agents')
      .select('id, kya_status')
      .eq('id', buyer_agent_id)
      .single()

    const { data: seller } = await supabase
      .from('agents')
      .select('id, kya_status')
      .eq('id', seller_agent_id)
      .single()

    if (!buyer || !seller) {
      return NextResponse.json(
        { error: 'Buyer or seller agent not found' },
        { status: 404 }
      )
    }

    if (buyer.kya_status !== 'verified' || seller.kya_status !== 'verified') {
      return NextResponse.json(
        { error: 'Both agents must be KYA-verified for escrow transactions' },
        { status: 403 }
      )
    }

    // Get buyer's custody wallet
    const { data: buyerWallet, error: buyerError } = await supabase
      .from('wallets')
      .select('*')
      .eq('agent_id', buyer_agent_id)
      .eq('currency', 'USDC')
      .eq('wallet_type', 'custody')
      .single()

    if (buyerError || !buyerWallet) {
      return NextResponse.json(
        { error: 'Buyer wallet not found' },
        { status: 404 }
      )
    }

    // Check balance
    if (buyerWallet.balance < amount) {
      return NextResponse.json(
        { error: 'Insufficient balance' },
        { status: 400 }
      )
    }

    const txHash =
      '0x' +
      Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('')
    const escrowId = uuidv4()

    // DOUBLE-ENTRY ESCROW:
    // 1. Create escrow order
    const { data: escrow, error: escrowError } = await supabase
      .from('escrow_orders')
      .insert({
        id: escrowId,
        buyer_agent_id,
        seller_agent_id,
        service_id,
        amount,
        status: 'locked',
      })
      .select()
      .single()

    if (escrowError) {
      return NextResponse.json(
        { error: 'Failed to create escrow', details: escrowError },
        { status: 500 }
      )
    }

    // 2. Get or create escrow wallet for buyer
    let { data: escrowWallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('agent_id', buyer_agent_id)
      .eq('currency', 'USDC')
      .eq('wallet_type', 'escrow')
      .single()

    if (!escrowWallet) {
      const { data: newEscrowWallet } = await supabase
        .from('wallets')
        .insert({
          agent_id: buyer_agent_id,
          currency: 'USDC',
          wallet_type: 'escrow',
          balance: 0,
          status: 'active',
        })
        .select()
        .single()
      escrowWallet = newEscrowWallet
    }

    // 3. Debit buyer custody, credit escrow
    const { error: debitError } = await supabase
      .from('wallets')
      .update({ balance: buyerWallet.balance - amount })
      .eq('id', buyerWallet.id)

    if (debitError) {
      return NextResponse.json(
        { error: 'Escrow failed — debit error' },
        { status: 500 }
      )
    }

    const { error: creditError } = await supabase
      .from('wallets')
      .update({ balance: (escrowWallet?.balance || 0) + amount })
      .eq('id', escrowWallet?.id)

    if (creditError) {
      // Rollback debit
      await supabase
        .from('wallets')
        .update({ balance: buyerWallet.balance })
        .eq('id', buyerWallet.id)

      return NextResponse.json(
        { error: 'Escrow failed — credit error' },
        { status: 500 }
      )
    }

    // 4. Record ledger entries
    // Debit from buyer custody
    await supabase.from('transactions').insert({
      wallet_id: buyerWallet.id,
      counterparty_wallet_id: escrowWallet?.id,
      type: 'escrow',
      amount,
      fee: 0,
      status: 'confirmed',
      tx_hash: txHash,
      protocol: 'escrow',
      ledger_entry: 'debit',
      confirmed_at: new Date().toISOString(),
    })

    // Credit to escrow
    await supabase.from('transactions').insert({
      wallet_id: escrowWallet?.id,
      counterparty_wallet_id: buyerWallet.id,
      type: 'escrow',
      amount,
      fee: 0,
      status: 'confirmed',
      tx_hash: txHash,
      protocol: 'escrow',
      ledger_entry: 'credit',
      confirmed_at: new Date().toISOString(),
    })

    // Audit log
    await supabase.from('audit_logs').insert({
      agent_id: buyer_agent_id,
      action: 'escrow_created',
      details: {
        escrow_id: escrow.id,
        amount,
        service_id,
        seller_agent_id,
        tx_hash: txHash,
      },
      ip_address: request.headers.get('x-forwarded-for') || undefined,
      user_agent: request.headers.get('user-agent') || undefined,
    })

    const response = {
      success: true,
      escrow: {
        id: escrow.id,
        amount: escrow.amount,
        status: 'locked',
        tx_hash: txHash,
      },
    }

    if (idempotencyKey) {
      idempotencyStore.set(hashIdempotencyKey(idempotencyKey), {
        response,
        timestamp: Date.now(),
      })
    }

    return NextResponse.json(response, {
      status: 201,
      ...(idempotencyKey && {
        headers: { 'x-idempotency-key': idempotencyKey },
      }),
    })
  } catch (error) {
    console.error('Create escrow error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest) {
  try {
    const body = await request.json()
    const { escrow_id, action } = body

    if (!escrow_id || !action) {
      return NextResponse.json(
        { error: 'escrow_id and action (release/refund) are required' },
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

    // Get escrow order
    const { data: escrow, error: escrowError } = await supabase
      .from('escrow_orders')
      .select('*')
      .eq('id', escrow_id)
      .single()

    if (escrowError || !escrow) {
      return NextResponse.json(
        { error: 'Escrow not found' },
        { status: 404 }
      )
    }

    if (escrow.status !== 'locked') {
      return NextResponse.json(
        { error: 'Escrow is not in locked state' },
        { status: 400 }
      )
    }

    const txHash =
      '0x' +
      Array.from({ length: 64 }, () =>
        Math.floor(Math.random() * 16).toString(16)
      ).join('')

    // Get buyer escrow wallet
    const { data: buyerEscrow } = await supabase
      .from('wallets')
      .select('*')
      .eq('agent_id', escrow.buyer_agent_id)
      .eq('currency', 'USDC')
      .eq('wallet_type', 'escrow')
      .single()

    if (action === 'release') {
      // Get seller custody wallet
      const { data: sellerWallet } = await supabase
        .from('wallets')
        .select('*')
        .eq('agent_id', escrow.seller_agent_id)
        .eq('currency', 'USDC')
        .eq('wallet_type', 'custody')
        .single()

      if (buyerEscrow && sellerWallet) {
        const fee = Math.floor(escrow.amount * ESCROW_FEE_RATE)
        const releaseAmount = escrow.amount - fee

        // Debit escrow
        const { error: escrowDebitError } = await supabase
          .from('wallets')
          .update({ balance: buyerEscrow.balance - escrow.amount })
          .eq('id', buyerEscrow.id)

        if (escrowDebitError) {
          return NextResponse.json(
            { error: 'Release failed — escrow debit error' },
            { status: 500 }
          )
        }

        // Credit seller (minus fee)
        const { error: sellerCreditError } = await supabase
          .from('wallets')
          .update({ balance: sellerWallet.balance + releaseAmount })
          .eq('id', sellerWallet.id)

        if (sellerCreditError) {
          // Rollback
          await supabase
            .from('wallets')
            .update({ balance: buyerEscrow.balance })
            .eq('id', buyerEscrow.id)

          return NextResponse.json(
            { error: 'Release failed — seller credit error' },
            { status: 500 }
          )
        }

        // Ledger entries
        await supabase.from('transactions').insert([
          {
            wallet_id: buyerEscrow.id,
            counterparty_wallet_id: sellerWallet.id,
            type: 'escrow_release',
            amount: escrow.amount,
            fee,
            status: 'confirmed',
            tx_hash: txHash,
            protocol: 'escrow',
            ledger_entry: 'debit',
            confirmed_at: new Date().toISOString(),
          },
          {
            wallet_id: sellerWallet.id,
            counterparty_wallet_id: buyerEscrow.id,
            type: 'escrow_release',
            amount: releaseAmount,
            fee: 0,
            status: 'confirmed',
            tx_hash: txHash,
            protocol: 'escrow',
            ledger_entry: 'credit',
            confirmed_at: new Date().toISOString(),
          },
          ...(fee > 0
            ? [
                {
                  wallet_id: buyerEscrow.id,
                  type: 'fee',
                  amount: 0,
                  fee,
                  status: 'confirmed',
                  tx_hash: txHash,
                  protocol: 'escrow',
                  ledger_entry: 'fee_debit',
                  confirmed_at: new Date().toISOString(),
                },
              ]
            : []),
        ])
      }

      await supabase
        .from('escrow_orders')
        .update({
          status: 'released',
          released_at: new Date().toISOString(),
        })
        .eq('id', escrow_id)

      await supabase.from('audit_logs').insert({
        agent_id: escrow.buyer_agent_id,
        action: 'escrow_released',
        details: {
          escrow_id,
          amount: escrow.amount,
          seller_agent_id: escrow.seller_agent_id,
          tx_hash: txHash,
        },
        ip_address: request.headers.get('x-forwarded-for') || undefined,
        user_agent: request.headers.get('user-agent') || undefined,
      })

      const response = {
        success: true,
        status: 'released',
        tx_hash: txHash,
      }

      if (idempotencyKey) {
        idempotencyStore.set(hashIdempotencyKey(idempotencyKey), {
          response,
          timestamp: Date.now(),
        })
      }

      return NextResponse.json(response)
    } else if (action === 'refund') {
      // Get buyer custody wallet
      const { data: buyerCustody } = await supabase
        .from('wallets')
        .select('*')
        .eq('agent_id', escrow.buyer_agent_id)
        .eq('currency', 'USDC')
        .eq('wallet_type', 'custody')
        .single()

      if (buyerEscrow && buyerCustody) {
        // Debit escrow
        const { error: escrowDebitError } = await supabase
          .from('wallets')
          .update({ balance: buyerEscrow.balance - escrow.amount })
          .eq('id', buyerEscrow.id)

        if (escrowDebitError) {
          return NextResponse.json(
            { error: 'Refund failed — escrow debit error' },
            { status: 500 }
          )
        }

        // Credit buyer custody
        const { error: buyerCreditError } = await supabase
          .from('wallets')
          .update({ balance: buyerCustody.balance + escrow.amount })
          .eq('id', buyerCustody.id)

        if (buyerCreditError) {
          // Rollback
          await supabase
            .from('wallets')
            .update({ balance: buyerEscrow.balance })
            .eq('id', buyerEscrow.id)

          return NextResponse.json(
            { error: 'Refund failed — buyer credit error' },
            { status: 500 }
          )
        }

        // Ledger entries
        await supabase.from('transactions').insert([
          {
            wallet_id: buyerEscrow.id,
            counterparty_wallet_id: buyerCustody.id,
            type: 'escrow_refund',
            amount: escrow.amount,
            fee: 0,
            status: 'confirmed',
            tx_hash: txHash,
            protocol: 'escrow',
            ledger_entry: 'debit',
            confirmed_at: new Date().toISOString(),
          },
          {
            wallet_id: buyerCustody.id,
            counterparty_wallet_id: buyerEscrow.id,
            type: 'escrow_refund',
            amount: escrow.amount,
            fee: 0,
            status: 'confirmed',
            tx_hash: txHash,
            protocol: 'escrow',
            ledger_entry: 'credit',
            confirmed_at: new Date().toISOString(),
          },
        ])
      }

      await supabase
        .from('escrow_orders')
        .update({
          status: 'refunded',
          refunded_at: new Date().toISOString(),
        })
        .eq('id', escrow_id)

      await supabase.from('audit_logs').insert({
        agent_id: escrow.buyer_agent_id,
        action: 'escrow_refunded',
        details: {
          escrow_id,
          amount: escrow.amount,
          tx_hash: txHash,
        },
        ip_address: request.headers.get('x-forwarded-for') || undefined,
        user_agent: request.headers.get('user-agent') || undefined,
      })

      const response = { success: true, status: 'refunded', tx_hash: txHash }

      if (idempotencyKey) {
        idempotencyStore.set(hashIdempotencyKey(idempotencyKey), {
          response,
          timestamp: Date.now(),
        })
      }

      return NextResponse.json(response)
    }

    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  } catch (error) {
    console.error('Escrow action error:', error)
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
      'Access-Control-Allow-Methods': 'POST, PUT, OPTIONS',
      'Access-Control-Allow-Headers':
        'Content-Type, x-api-key, x-idempotency-key',
    },
  })
}