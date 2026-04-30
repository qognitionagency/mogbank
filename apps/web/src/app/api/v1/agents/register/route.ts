import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import { v4 as uuidv4 } from 'uuid'

export const dynamic = 'force-dynamic'

function generateWalletAddress(): string {
  // Generate a mock Ethereum-style address (simplified for demo)
  const chars = '0123456789abcdef'
  let address = '0x'
  for (let i = 0; i < 40; i++) {
    address += chars[Math.floor(Math.random() * chars.length)]
  }
  return address
}

function generatePublicKey(): string {
  // Generate a mock Ed25519 public key (simplified for demo)
  const chars = '0123456789abcdef'
  let key = ''
  for (let i = 0; i < 64; i++) {
    key += chars[Math.floor(Math.random() * chars.length)]
  }
  return key
}

function calculateKYAScore(
  agentType: string,
  email: string,
  metadata: Record<string, unknown>
): { score: number; breakdown: Record<string, number> } {
  let total = 0
  const breakdown: Record<string, number> = {}

  // 1. Principal Identity (15 max) - Simplified
  breakdown.principal_identity = metadata.company_name ? 15 : 8
  total += breakdown.principal_identity

  // 2. Email Domain (10 max)
  breakdown.email_domain = 6
  if (email) {
    const domain = email.split('@')[1]
    if (domain && !['gmail.com', 'yahoo.com', 'hotmail.com'].includes(domain)) {
      breakdown.email_domain += 4
    }
  }
  total += breakdown.email_domain

  // 3. Agent Metadata (15 max)
  breakdown.agent_metadata = 8
  if (metadata.framework || metadata.capabilities) {
    breakdown.agent_metadata += 7
  }
  total += breakdown.agent_metadata

  // 4. Use Case (20 max) - Default to low-risk
  breakdown.use_case = 15
  total += breakdown.use_case

  // 5. Jurisdiction Risk (15 max) - Default to medium
  breakdown.jurisdiction_risk = 10
  total += breakdown.jurisdiction_risk

  // 6. Technical Capability (15 max)
  breakdown.technical_capability = 8
  if (metadata.endpoint_url || metadata.openapi_schema) {
    breakdown.technical_capability += 7
  }
  total += breakdown.technical_capability

  // 7. Verification Mode (10 max) - Testnet default
  breakdown.verification_mode = 5
  total += breakdown.verification_mode

  return { score: total, breakdown }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { agent_type, email, principal_address, metadata = {} } = body

    if (!email || !principal_address) {
      return NextResponse.json(
        { error: 'Email and principal address are required' },
        { status: 400 }
      )
    }

    const supabase = createServerClient()
    const wallet_address = generateWalletAddress()
    const public_key = generatePublicKey()

    // Calculate KYA score
    const { score: kya_score, breakdown } = calculateKYAScore(agent_type, email, metadata)

    // Determine status based on score
    const kya_status = kya_score >= 60 ? 'verified' : 'pending'

    // Insert agent
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .insert({
        wallet_address,
        public_key,
        principal_address,
        agent_type: agent_type || 'custom',
        kya_score,
        kya_status,
        email,
        metadata
      })
      .select()
      .single()

    if (agentError) {
      console.error('Agent creation error:', agentError)
      return NextResponse.json(
        { error: 'Failed to create agent', details: agentError },
        { status: 500 }
      )
    }

    // Create default wallet
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .insert({
        agent_id: agent.id,
        currency: 'USDC',
        wallet_type: 'custody',
        balance: 0,
        status: 'active'
      })
      .select()
      .single()

    if (walletError) {
      console.error('Wallet creation error:', walletError)
    }

    // Create default spending controls
    await supabase
      .from('spending_controls')
      .insert({
        agent_id: agent.id,
        daily_limit: 1000000000, // 1M USDC cents (10k USD)
        session_limit: 100000000, // 100k USDC cents (1k USD)
        allowed_currencies: ['USDC'],
        counterparty_allowlist: [],
        counterparty_blocklist: [],
        rate_limit_per_minute: 100
      })

    // Store KYA score breakdown
    await supabase
      .from('kya_score_history')
      .insert({
        agent_id: agent.id,
        principal_identity_score: breakdown.principal_identity,
        email_domain_score: breakdown.email_domain,
        agent_metadata_score: breakdown.agent_metadata,
        use_case_score: breakdown.use_case,
        jurisdiction_risk_score: breakdown.jurisdiction_risk,
        technical_capability_score: breakdown.technical_capability,
        verification_mode_score: breakdown.verification_mode,
        total_score: kya_score
      })

    // Log audit
    await supabase
      .from('audit_logs')
      .insert({
        agent_id: agent.id,
        action: 'agent_registered',
        details: { kya_score, kya_status, agent_type }
      })

    return NextResponse.json({
      success: true,
      agent: {
        id: agent.id,
        wallet_address: agent.wallet_address,
        public_key: agent.public_key,
        kya_score: agent.kya_score,
        kya_status: agent.kya_status
      },
      wallet: wallet ? {
        id: wallet.id,
        balance: wallet.balance,
        currency: wallet.currency
      } : null,
      kya_breakdown: breakdown
    }, { status: 201 })

  } catch (error) {
    console.error('Registration error:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-api-key',
    },
  })
}