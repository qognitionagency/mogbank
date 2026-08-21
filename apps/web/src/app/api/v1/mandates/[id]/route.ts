import { NextRequest, NextResponse } from 'next/server'
import { requireAgent, requireSelf, requireVerifiedAgent } from '@/lib/auth'
import { createServerClient } from '@/lib/db'

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
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAgent(request)
    if (!auth.ok) return auth.response

    const { id } = await params
    const db = createServerClient()

    const { data: mandate, error } = await db
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

    // A mandate id must not reveal another agent's delegation.
    if (mandate.agent_id !== auth.agent.agentId) {
      return NextResponse.json({ error: 'Mandate not found' }, { status: 404 })
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

// PATCH /api/v1/mandates/:id  — revoke a mandate (owner only, via API key)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAgent(request)
    if (!auth.ok) return auth.response

    const { id } = await params

    // Ownership comes from the API key, not the body. This used to trust an
    // `agent_id` field the caller supplied, so anyone could revoke anyone's
    // mandate simply by naming its owner.
    const db = createServerClient()

    const { data: mandate, error: fetchError } = await db
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

    if (mandate.agent_id !== auth.agent.agentId) {
      return NextResponse.json(
        { error: 'Mandate not found' },
        { status: 404, headers: CORS }
      )
    }

    if (mandate.revoked) {
      return NextResponse.json(
        { error: 'Mandate is already revoked' },
        { status: 409, headers: CORS }
      )
    }

    const { error: revokeError } = await db
      .from('mandates')
      .update({ revoked: true, revoked_at: new Date().toISOString() })
      .eq('id', id)

    if (revokeError) {
      return NextResponse.json(
        { error: 'Failed to revoke mandate' },
        { status: 500, headers: CORS }
      )
    }

    await db.from('audit_logs').insert({
      agent_id: auth.agent.agentId,
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
