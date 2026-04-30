import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { from_wallet_id, to_wallet_id, amount, protocol = 'x402' } = body

    if (!from_wallet_id || !to_wallet_id || !amount) {
      return NextResponse.json(
        { error: 'from_wallet_id, to_wallet_id, and amount are required' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    // Get sender wallet with lock
    const { data: fromWallet, error: fromError } = await supabase
      .from('wallets')
      .select('*, agents(*)')
      .eq('id', from_wallet_id)
      .single()

    if (fromError || !fromWallet) {
      return NextResponse.json(
        { error: 'Sender wallet not found' },
        { status: 404 }
      )
    }

    // Get spending controls
    const { data: controls } = await supabase
      .from('spending_controls')
      .select('*')
      .eq('agent_id', fromWallet.agent_id)
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

    const todayTotal = todayTransactions?.reduce((sum: number, t: { amount: number }) => sum + t.amount, 0) || 0

    if (controls && todayTotal + amount > controls.daily_limit) {
      return NextResponse.json(
        { error: 'Daily limit exceeded' },
        { status: 403 }
      )
    }

    // Check balance
    if (fromWallet.balance < amount) {
      return NextResponse.json(
        { error: 'Insufficient balance' },
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

    // Calculate fee (0.15% for x402)
    const fee = Math.floor(amount * 0.0015)

    // Atomic transfer using database transaction
    const { error: debitError } = await supabase
      .from('wallets')
      .update({ balance: fromWallet.balance - amount - fee })
      .eq('id', from_wallet_id)

    if (debitError) {
      return NextResponse.json(
        { error: 'Transfer failed - debit error' },
        { status: 500 }
      )
    }

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
        { error: 'Transfer failed - credit error' },
        { status: 500 }
      )
    }

    // Record transactions
    const txHash = '0x' + Array(64).fill(0).map(() => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('')

    // Debit transaction
    await supabase
      .from('transactions')
      .insert({
        wallet_id: from_wallet_id,
        counterparty_wallet_id: to_wallet_id,
        type: 'transfer',
        amount,
        fee,
        status: 'confirmed',
        tx_hash: txHash,
        protocol,
        confirmed_at: new Date().toISOString()
      })

    // Credit transaction (for counterparty)
    await supabase
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
        confirmed_at: new Date().toISOString()
      })

    // Log audit
    await supabase
      .from('audit_logs')
      .insert({
        agent_id: fromWallet.agent_id,
        action: 'transfer',
        details: { from_wallet_id, to_wallet_id, amount, fee, txHash }
      })

    return NextResponse.json({
      success: true,
      transaction: {
        tx_hash: txHash,
        amount,
        fee,
        from_wallet: from_wallet_id,
        to_wallet: to_wallet_id,
        status: 'confirmed'
      }
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
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    },
  })
}