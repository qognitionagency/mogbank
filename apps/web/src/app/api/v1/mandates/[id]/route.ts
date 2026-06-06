import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'

export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, PATCH, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS })
}

// GET /api/v1/mandates/:id  — fetch a single mandate
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const supabase = createServerClient()

    const { data: mandate, error } = await supabase
      .from('mandates')
      .select('id, agent_id, principal_address, scope, constraints, nonce, revoked, expires_at, created_at, revoked_at')
      .eq('id', id)
      .single()

    if (error || !mandate) {
      return NextResponse.json(
        { error: 'Mandate not found' },
        { status: 404, headers: CORS }
      )
    }

    const now = new Date()
    const status = mandate.revoked
      ? 'revoked'
      : mandate.expires_at && new Date(mandate.expires_at) < now
        ? 'expired'
        : 'active'

    return NextResponse.json({ mandate: { ...mandate, status } }, { headers: CORS })
  } catch (err) {
    console.error('Mandate GET error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: CORS }
    )
  }
}

// PATCH /api/v1/mandates/:id  — revoke a mandate
// Body: { agent_id: string }  (must match mandate owner)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params
    const body = await request.json()
    const { agent_id } = body

    if (!agent_id) {
      return NextResponse.json(
        { error: 'agent_id is required to revoke a mandate' },
        { status: 400, headers: CORS }
      )
    }

    const supabase = createServerClient()

    const { data: mandate, error: fetchError } = await supabase
      .from('mandates')
      .select('id, agent_id, revoked')
      .eq('id', id)
      .single()

    if (fetchError || !mandate) {
      return NextResponse.json(
        { error: 'Mandate not found' },
        { status: 404, headers: CORS }
      )
    }

    if (mandate.agent_id !== agent_id) {
      return NextResponse.json(
        { error: 'Unauthorized — agent_id does not match mandate owner' },
        { status: 403, headers: CORS }
      )
    }

    if (mandate.revoked) {
      return NextResponse.json(
        { error: 'Mandate is already revoked' },
        { status: 409, headers: CORS }
      )
    }

    const { error: revokeError } = await supabase
      .from('mandates')
      .update({ revoked: true, revoked_at: new Date().toISOString() })
      .eq('id', id)

    if (revokeError) {
      return NextResponse.json(
        { error: 'Failed to revoke mandate' },
        { status: 500, headers: CORS }
      )
    }

    await supabase.from('audit_logs').insert({
      agent_id,
      action: 'mandate_revoked',
      details: { mandate_id: id },
      ip_address: request.headers.get('x-forwarded-for') ?? undefined,
      user_agent: request.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json(
      { success: true, mandate_id: id, status: 'revoked' },
      { headers: CORS }
    )
  } catch (err) {
    console.error('Mandate PATCH error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: CORS }
    )
  }
}
