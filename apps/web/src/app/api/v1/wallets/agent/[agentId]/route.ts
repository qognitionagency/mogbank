import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/db'

export const dynamic = 'force-dynamic'

/**
 * GET /api/v1/wallets/agent/:agentId
 * Returns every wallet owned by an agent, plus a convenience `wallet`
 * pointing at the primary USDC custody wallet (used by the dashboard).
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ agentId: string }> }
) {
  try {
    const { agentId } = await params
    const supabase = createServerClient()

    const { data: wallets, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: true })

    if (error) {
      return NextResponse.json({ error: 'Failed to load wallets' }, { status: 500 })
    }

    if (!wallets || wallets.length === 0) {
      return NextResponse.json({ error: 'No wallet found for this agent' }, { status: 404 })
    }

    const primary =
      wallets.find(
        (w) => w.currency === 'USDC' && w.wallet_type === 'custody'
      ) || wallets[0]

    return NextResponse.json({ wallet: primary, wallets })
  } catch (error) {
    console.error('Get wallets by agent error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
