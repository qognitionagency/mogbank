import { NextRequest, NextResponse } from 'next/server'
import { requireAgent, requireSelf, requireWalletOwner } from '@/lib/auth'
import { createServerClient } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/wallets/:id/ledger
 * Double-entry ledger view for a wallet. The web app records ledger state on
 * the transactions table via the `ledger_entry` discriminator, so we project
 * those rows into the LedgerEntry shape the dashboard expects.
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

    const db = createServerClient()

    const { data: rows, error } = await db
      .from('transactions')
      .select('*')
      .eq('wallet_id', id)
      .not('ledger_entry', 'is', null)
      .order('created_at', { ascending: false })
      .limit(limit)

    if (error) {
      return NextResponse.json({ error: 'Failed to load ledger' }, { status: 500 })
    }

    const entries = (rows || []).map((t) => ({
      id: t.id,
      transaction_id: t.id,
      wallet_id: t.wallet_id,
      entry_type: t.ledger_entry === 'credit' ? 'credit' : 'debit',
      amount: t.ledger_entry === 'fee_debit' ? t.fee : t.amount,
      balance_after: t.balance_after ?? null,
      description: `${t.type}${t.protocol ? ` · ${t.protocol}` : ''}`,
      created_at: t.created_at,
    }))

    return NextResponse.json({ entries })
  } catch (error) {
    console.error('Get wallet ledger error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
