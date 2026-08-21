import { NextRequest, NextResponse } from 'next/server'
import { requireAgent, requireSelf, requireVerifiedAgent } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import { verifyMandateSignature } from '@/lib/crypto'

export const dynamic = 'force-dynamic'

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, x-api-key, x-mandate-signature',
}

export async function OPTIONS() {
  return new NextResponse(null, { headers: CORS })
}

// GET /api/v1/mandates?agent_id={id}  — list active mandates for an agent
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const auth = await requireAgent(request)
    if (!auth.ok) return auth.response

    // Mandates are always listed for the caller; an agent_id query
    // parameter must not let one agent read another's delegations.
    const agentId = auth.agent.agentId
    void searchParams

    if (!agentId) {
      return NextResponse.json(
        { error: 'agent_id query parameter is required' },
        { status: 400, headers: CORS }
      )
    }

    const db = createServerClient()
    const { data: mandates, error } = await db
      .from('mandates')
      .select('id, agent_id, principal_address, scope, constraints, nonce, revoked, expires_at, created_at, revoked_at')
      .eq('agent_id', agentId)
      .order('created_at', { ascending: false })

    if (error) {
      console.error('Mandates fetch error:', error)
      return NextResponse.json(
        { error: 'Failed to fetch mandates' },
        { status: 500, headers: CORS }
      )
    }

    const now = new Date()
    const enriched = (mandates ?? []).map(m => ({
      ...m,
      status: m.revoked
        ? 'revoked'
        : m.expires_at && new Date(m.expires_at) < now
          ? 'expired'
          : 'active',
    }))

    return NextResponse.json({ mandates: enriched }, { headers: CORS })
  } catch (err) {
    console.error('Mandates GET error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: CORS }
    )
  }
}

// POST /api/v1/mandates  — register a new signed mandate
//
// Body:
//   agent_id          string (UUID)
//   principal_address string (wallet address of the authorizing principal)
//   scope             object { operations: string[], currencies?: string[] }
//   constraints       object { max_amount?: number, max_per_tx?: number,
//                               allowed_currencies?: string[], allowed_payees?: string[] }
//   expires_at        ISO8601 timestamp (optional)
//   nonce             string (unique per mandate — replay prevention)
//   signature         string (base64 Ed25519 signature of canonical JSON payload)
export async function POST(request: NextRequest) {
  try {
    const auth = await requireVerifiedAgent(request)
    if (!auth.ok) return auth.response

    const body = await request.json()
    const {
      agent_id,
      principal_address,
      scope,
      constraints = {},
      expires_at,
      nonce,
      signature,
    } = body

    // -- Required field validation --
    if (!agent_id || !principal_address || !scope || !signature || !nonce) {
      return NextResponse.json(
        { error: 'agent_id, principal_address, scope, nonce, and signature are required' },
        { status: 400, headers: CORS }
      )
    }

    if (!scope.operations || !Array.isArray(scope.operations) || scope.operations.length === 0) {
      return NextResponse.json(
        { error: 'scope.operations must be a non-empty array' },
        { status: 400, headers: CORS }
      )
    }

    const db = createServerClient()

    // -- Verify agent exists and has verified KYA status --
    const { data: agent, error: agentError } = await db
      .from('agents')
      .select('id, public_key, kya_status')
      .eq('id', agent_id)
      .single()

    if (agentError || !agent) {
      return NextResponse.json(
        { error: 'Agent not found' },
        { status: 404, headers: CORS }
      )
    }

    if (agent.kya_status !== 'verified') {
      return NextResponse.json(
        { error: 'Agent KYA status must be verified to register a mandate' },
        { status: 403, headers: CORS }
      )
    }

    // -- Nonce replay prevention: reject if nonce already used --
    const { data: existingNonce } = await db
      .from('mandates')
      .select('id')
      .eq('agent_id', agent_id)
      .eq('nonce', nonce)
      .limit(1)
      .single()

    if (existingNonce) {
      return NextResponse.json(
        { error: 'Nonce already used — mandate replay detected' },
        { status: 409, headers: CORS }
      )
    }

    // -- Ed25519 signature verification (ABOS Layer 6 §8.3) --
    // Canonical payload: sorted-key JSON of the mandate fields (excluding signature itself)
    const mandatePayload = {
      agent_id,
      constraints,
      expires_at: expires_at ?? null,
      nonce,
      principal_address,
      scope,
    }

    const signatureValid = await verifyMandateSignature(
      mandatePayload,
      signature,
      agent.public_key
    )

    if (!signatureValid) {
      return NextResponse.json(
        { error: 'Invalid Ed25519 signature — mandate authorization denied' },
        { status: 403, headers: CORS }
      )
    }

    // -- Temporal bounds check --
    if (expires_at && new Date(expires_at) <= new Date()) {
      return NextResponse.json(
        { error: 'expires_at is already in the past' },
        { status: 400, headers: CORS }
      )
    }

    // -- Persist mandate --
    const { data: mandate, error: insertError } = await db
      .from('mandates')
      .insert({
        agent_id,
        principal_address,
        scope,
        constraints,
        signature,
        nonce,
        expires_at: expires_at ?? null,
        revoked: false,
      })
      .select()
      .single()

    if (insertError) {
      console.error('Mandate insert error:', insertError)
      return NextResponse.json(
        { error: 'Failed to register mandate' },
        { status: 500, headers: CORS }
      )
    }

    // -- Audit log --
    await db.from('audit_logs').insert({
      agent_id,
      action: 'mandate_registered',
      details: {
        mandate_id: mandate.id,
        principal_address,
        scope,
        expires_at: expires_at ?? null,
      },
      ip_address: request.headers.get('x-forwarded-for') ?? undefined,
      user_agent: request.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json(
      {
        success: true,
        mandate: {
          id: mandate.id,
          agent_id: mandate.agent_id,
          principal_address: mandate.principal_address,
          scope: mandate.scope,
          constraints: mandate.constraints,
          nonce: mandate.nonce,
          expires_at: mandate.expires_at,
          status: 'active',
          created_at: mandate.created_at,
        },
      },
      { status: 201, headers: CORS }
    )
  } catch (err) {
    console.error('Mandate POST error:', err)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500, headers: CORS }
    )
  }
}
