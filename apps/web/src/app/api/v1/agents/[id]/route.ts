import { NextRequest, NextResponse } from 'next/server'
import { requireAgent, requireSelf, requireWalletOwner } from '@/lib/auth'
import { createServerClient } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAgent(request)
    if (!auth.ok) return auth.response

    const { id } = await params
    const notSelf = requireSelf(auth.agent, id)
    if (notSelf) return notSelf.response
    const supabase = createServerClient()

    const { data: agent, error } = await supabase
      .from('agents')
      .select(`
        *,
        wallets (*),
        spending_controls (*),
        kya_score_history (*)
      `)
      .eq('id', id)
      .single()

    if (error) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404 }
      )
    }

    return NextResponse.json({ agent })

  } catch (error) {
    console.error('Get agent error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}