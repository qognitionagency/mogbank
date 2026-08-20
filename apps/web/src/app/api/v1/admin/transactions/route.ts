import { NextResponse } from 'next/server'
import { createServerClient } from '@/lib/db'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const supabase = createServerClient()

    const { data, error } = await supabase
      .from('transactions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ transactions: data, count: data.length })

  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}