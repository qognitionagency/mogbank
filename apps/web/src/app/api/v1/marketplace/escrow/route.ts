import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { buyer_agent_id, seller_agent_id, service_id, amount } = body

    if (!buyer_agent_id || !seller_agent_id || !service_id || !amount) {
      return NextResponse.json(
        { error: 'buyer_agent_id, seller_agent_id, service_id, and amount are required' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    // Get buyer's wallet
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

    // Create escrow order
    const { data: escrow, error: escrowError } = await supabase
      .from('escrow_orders')
      .insert({
        buyer_agent_id,
        seller_agent_id,
        service_id,
        amount,
        status: 'locked'
      })
      .select()
      .single()

    if (escrowError) {
      return NextResponse.json(
        { error: 'Failed to create escrow', details: escrowError },
        { status: 500 }
      )
    }

    // Lock funds: move from custody to escrow wallet
    // For simplicity, we'll create a new escrow wallet or use existing
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
          status: 'active'
        })
        .select()
        .single()
      escrowWallet = newEscrowWallet
    }

    // Deduct from buyer custody, add to escrow
    await supabase
      .from('wallets')
      .update({ balance: buyerWallet.balance - amount })
      .eq('id', buyerWallet.id)

    await supabase
      .from('wallets')
      .update({ balance: (escrowWallet?.balance || 0) + amount })
      .eq('id', escrowWallet?.id)

    // Log audit
    await supabase
      .from('audit_logs')
      .insert({
        agent_id: buyer_agent_id,
        action: 'escrow_created',
        details: { escrow_id: escrow.id, amount }
      })

    return NextResponse.json({
      success: true,
      escrow: {
        id: escrow.id,
        amount: escrow.amount,
        status: 'locked'
      }
    }, { status: 201 })

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
    const { escrow_id, action, buyer_agent_id } = body

    if (!escrow_id || !action) {
      return NextResponse.json(
        { error: 'escrow_id and action (release/refund) are required' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()

    // Get escrow order
    const { data: escrow, error: escrowError } = await supabase
      .from('escrow_orders')
      .select('*, services(service_id, seller_agent_id)')
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

    // Get buyer and seller wallets
    const { data: buyerWallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('agent_id', escrow.buyer_agent_id)
      .eq('currency', 'USDC')
      .eq('wallet_type', 'escrow')
      .single()

    const { data: sellerWallet } = await supabase
      .from('wallets')
      .select('*')
      .eq('agent_id', escrow.seller_agent_id)
      .eq('currency', 'USDC')
      .eq('wallet_type', 'custody')
      .single()

    if (action === 'release') {
      // Release funds to seller
      if (buyerWallet && sellerWallet) {
        await supabase
          .from('wallets')
          .update({ balance: buyerWallet.balance - escrow.amount })
          .eq('id', buyerWallet.id)

        await supabase
          .from('wallets')
          .update({ balance: sellerWallet.balance + escrow.amount })
          .eq('id', sellerWallet.id)
      }

      await supabase
        .from('escrow_orders')
        .update({ 
          status: 'released', 
          released_at: new Date().toISOString() 
        })
        .eq('id', escrow_id)

      await supabase
        .from('audit_logs')
        .insert({
          agent_id: escrow.buyer_agent_id,
          action: 'escrow_released',
          details: { escrow_id, amount: escrow.amount }
        })

      return NextResponse.json({ success: true, status: 'released' })

    } else if (action === 'refund') {
      // Refund to buyer
      if (buyerWallet) {
        const { data: buyerCustody } = await supabase
          .from('wallets')
          .select('*')
          .eq('agent_id', escrow.buyer_agent_id)
          .eq('currency', 'USDC')
          .eq('wallet_type', 'custody')
          .single()

        if (buyerCustody) {
          await supabase
            .from('wallets')
            .update({ balance: buyerWallet.balance - escrow.amount })
            .eq('id', buyerWallet.id)

          await supabase
            .from('wallets')
            .update({ balance: buyerCustody.balance + escrow.amount })
            .eq('id', buyerCustody.id)
        }
      }

      await supabase
        .from('escrow_orders')
        .update({ 
          status: 'refunded', 
          refunded_at: new Date().toISOString() 
        })
        .eq('id', escrow_id)

      return NextResponse.json({ success: true, status: 'refunded' })
    }

    return NextResponse.json(
      { error: 'Invalid action' },
      { status: 400 }
    )

  } catch (error) {
    console.error('Escrow action error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}