import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/db'
import { requireAdmin } from '@/lib/auth'

export const dynamic = 'force-dynamic'

// Operator-only: this returns every agent's data, so it is gated on the
// admin key rather than any agent credential.
export async function GET(request: NextRequest) {
  const denied = requireAdmin(request)
  if (denied) return denied.response

  try {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ wallets: data, count: data.length })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}