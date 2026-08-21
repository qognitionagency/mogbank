import { NextRequest, NextResponse } from 'next/server'
import { requireAgent, requireSelf, requireWalletOwner } from '@/lib/auth'
import { createServerClient } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/wallets/:id/transactions
 * Transaction history for a wallet (as sender or counterparty).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAgent(request)
    if (!auth.ok) return auth.response

    const { id } = await params

    // Re-derive ownership: a wallet id alone must not expose its history.
    const owned = await requireWalletOwner(auth.agent, id)
    if (!owned.ok) return owned.response
    const { searchParams } = new URL(request.url)
    const limit = Math.min(parseInt(searchParams.get('limit') || '100', 10), 500)

    const supabase = createServerClient()

    const { data: transactions, error } = await supabase
      .from('transactions')
      .select('*')
      .or(`wallet_id.eq.${id},counterparty_wallet_id.eq.${id}`)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: 'Failed to load transactions' }, { status: 500 })
    }

    return NextResponse.json({ transactions: transactions || [] })
  } catch (error) {
    console.error('Get wallet transactions error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
