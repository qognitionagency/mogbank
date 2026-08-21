import { NextRequest, NextResponse } from 'next/server'
import { requireAgent, requireSelf, requireWalletOwner } from '@/lib/auth'
import { createServerClient } from '@/lib/db'

export const dynamic = 'force-dynamic'

function scoreTier(score: number) {
  if (score >= 80) return { tier: 'platinum', label: 'Platinum', creditLimit: 50_000_000_000 }
  if (score >= 60) return { tier: 'verified', label: 'Verified', creditLimit: 10_000_000_000 }
  if (score >= 40) return { tier: 'basic', label: 'Basic', creditLimit: 1_000_000_000 }
  return { tier: 'unverified', label: 'Unverified', creditLimit: 0 }
}

// GET /api/v1/agents/:id/score
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
      .select('id, kya_score, kya_status, kya_breakdown, agent_type, email, metadata, created_at, updated_at')
      .eq('id', id)
      .single()

    if (error || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const { data: history } = await supabase
      .from('kya_score_history')
      .select('*')
      .eq('agent_id', id)
      .order('calculated_at', { ascending: false })
      .limit(10)

    const latest = history?.[0]
    const breakdown = latest
      ? {
          principal_identity: latest.principal_identity_score,
          email_domain: latest.email_domain_score,
          agent_metadata: latest.agent_metadata_score,
          use_case: latest.use_case_score,
          jurisdiction_risk: latest.jurisdiction_risk_score,
          technical_capability: latest.technical_capability_score,
          verification_mode: latest.verification_mode_score,
        }
      : (agent.kya_breakdown ?? {})

    const { tier, label, creditLimit } = scoreTier(agent.kya_score)

    return NextResponse.json({
      agent_id: agent.id,
      score: agent.kya_score,
      status: agent.kya_status,
      version: 'KYA-7',
      tier,
      tier_label: label,
      credit_limit_usdc_cents: creditLimit,
      breakdown,
      history: (history ?? []).map((h) => ({
        score: h.total_score,
        calculated_at: h.calculated_at,
      })),
      next_review_at: new Date(
        new Date(agent.updated_at ?? agent.created_at).getTime() +
          30 * 24 * 60 * 60 * 1000
      ).toISOString(),
    })
  } catch (err) {
    console.error('Get score error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
