import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@/lib/supabase'
import {
  generateAgentKeyPair,
  generateWalletAddress,
  generateApiKey,
  hashIdempotencyKey,
} from '@/lib/crypto'

export const dynamic = 'force-dynamic'

const KYA_WEIGHTS = {
  principal_identity: { max: 15, question: 'Principal identity verification' },
  email_domain: { max: 10, question: 'Email domain reputation' },
  agent_metadata: { max: 15, question: 'Agent metadata completeness' },
  use_case: { max: 20, question: 'Use case risk assessment' },
  jurisdiction_risk: { max: 15, question: 'Jurisdiction risk' },
  technical_capability: { max: 15, question: 'Technical capability signals' },
  verification_mode: { max: 10, question: 'Verification mode (testnet/mainnet)' },
}

function calculateKYA7(
  agentType: string,
  email: string,
  metadata: Record<string, unknown>
): { score: number; breakdown: Record<string, number> } {
  const breakdown: Record<string, number> = {}
  let total = 0

  breakdown.principal_identity =
    metadata.company_name || metadata.principal_name ? 15 : 8
  total += breakdown.principal_identity

  if (email) {
    const domain = email.split('@')[1]?.toLowerCase() ?? ''
    const freeDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com']
    breakdown.email_domain = freeDomains.includes(domain) ? 6 : 10
  } else {
    breakdown.email_domain = 4
  }
  total += breakdown.email_domain

  breakdown.agent_metadata = 7
  if (metadata.framework) breakdown.agent_metadata += 3
  if (metadata.capabilities) breakdown.agent_metadata += 3
  if (metadata.endpoint_url || metadata.openapi_schema) breakdown.agent_metadata += 2
  total += breakdown.agent_metadata

  breakdown.use_case = agentType === 'custom' ? 12 : 18
  if (metadata.use_case_description) breakdown.use_case += 2
  total += breakdown.use_case

  breakdown.jurisdiction_risk = metadata.jurisdiction ? 13 : 10
  total += breakdown.jurisdiction_risk

  breakdown.technical_capability = 7
  if (metadata.endpoint_url) breakdown.technical_capability += 4
  if (metadata.openapi_schema) breakdown.technical_capability += 4
  total += breakdown.technical_capability

  breakdown.verification_mode =
    metadata.verification_mode === 'mainnet' ? 10 : 5
  total += breakdown.verification_mode

  return { score: Math.min(100, total), breakdown }
}

// In-memory idempotency store (Vercel ephemeral; production uses Supabase)
const idempotencyStore = new Map<
  string,
  { response: unknown; timestamp: number }
>()

// Cleanup entries older than 5 minutes every 60s
setInterval(() => {
  const cutoff = Date.now() - 5 * 60 * 1000
  for (const [k, v] of idempotencyStore) {
    if (v.timestamp < cutoff) idempotencyStore.delete(k)
  }
}, 60_000).unref?.()

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const {
      agent_type = 'custom',
      email,
      principal_address,
      metadata = {},
    } = body

    if (!email || !principal_address) {
      return NextResponse.json(
        { error: 'Email and principal_address are required' },
        { status: 400 }
      )
    }

    // Idempotency key enforcement
    const idempotencyKey = request.headers.get('x-idempotency-key')
    if (idempotencyKey) {
      const hash = hashIdempotencyKey(idempotencyKey)
      const entry = idempotencyStore.get(hash)
      if (entry) {
        return NextResponse.json(entry.response, {
          status: 200,
          headers: { 'x-idempotency-key': idempotencyKey },
        })
      }
    }

    // Generate real Ed25519 keypair for Layer 1 KYA root of trust
    const { privateKey, publicKey } = await generateAgentKeyPair()

    // Generate real secp256k1 wallet address for Base L2
    const { address: walletAddress, privateKey: walletPrivKey } =
      await generateWalletAddress()

    // Generate API key
    const { apiKey, keyHash } = generateApiKey('mog_test')

    // KYA-7 scoring
    const { score: kyaScore, breakdown } = calculateKYA7(
      agent_type,
      email,
      metadata
    )
    const kyaStatus = kyaScore >= 60 ? 'verified' : 'pending'

    const supabase = createServerClient()

    // Insert agent
    const { data: agent, error: agentError } = await supabase
      .from('agents')
      .insert({
        wallet_address: walletAddress,
        public_key: publicKey,
        principal_address,
        agent_type,
        kya_score: kyaScore,
        kya_status: kyaStatus,
        email,
        metadata: {
          ...metadata,
          framework: metadata.framework || 'custom',
          kya_version: 'KYA-7',
        },
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
        status: 'active',
      })
      .select()
      .single()

    if (walletError) {
      console.error('Wallet creation error:', walletError)
    }

    // Create spending controls
    await supabase.from('spending_controls').insert({
      agent_id: agent.id,
      daily_limit: 1_000_000_000, // 1M USDC cents (10k USD)
      session_limit: 100_000_000,
      allowed_currencies: ['USDC'],
      counterparty_allowlist: [],
      counterparty_blocklist: [],
      rate_limit_per_minute: 100,
    })

    // Store KYA score history
    await supabase.from('kya_score_history').insert({
      agent_id: agent.id,
      principal_identity_score: breakdown.principal_identity,
      email_domain_score: breakdown.email_domain,
      agent_metadata_score: breakdown.agent_metadata,
      use_case_score: breakdown.use_case,
      jurisdiction_risk_score: breakdown.jurisdiction_risk,
      technical_capability_score: breakdown.technical_capability,
      verification_mode_score: breakdown.verification_mode,
      total_score: kyaScore,
    })

    // Store API key hash
    await supabase.from('api_keys').insert({
      agent_id: agent.id,
      key_hash: keyHash,
      name: 'default',
    })

    // Audit log
    await supabase.from('audit_logs').insert({
      agent_id: agent.id,
      action: 'agent_registered',
      details: {
        kya_score: kyaScore,
        kya_status: kyaStatus,
        agent_type,
        principal_address,
      },
      ip_address: request.headers.get('x-forwarded-for') || undefined,
      user_agent: request.headers.get('user-agent') || undefined,
    })

    const response = {
      success: true,
      agent: {
        id: agent.id,
        wallet_address: agent.wallet_address,
        public_key: agent.public_key,
        kya_score: agent.kya_score,
        kya_status: agent.kya_status,
      },
      credentials: {
        api_key: apiKey,
        ed25519_private_key: privateKey,
        wallet_private_key: walletPrivKey,
        warning:
          'Store these credentials securely. They will NEVER be shown again.',
      },
      wallet: wallet
        ? { id: wallet.id, balance: 0, currency: 'USDC' }
        : null,
      kya_breakdown: breakdown,
      kya_weights: KYA_WEIGHTS,
    }

    // Store idempotency response
    if (idempotencyKey) {
      idempotencyStore.set(hashIdempotencyKey(idempotencyKey), {
        response,
        timestamp: Date.now(),
      })
    }

    return NextResponse.json(response, {
      status: 201,
      ...(idempotencyKey && {
        headers: { 'x-idempotency-key': idempotencyKey },
      }),
    })
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
      'Access-Control-Allow-Headers':
        'Content-Type, x-api-key, x-idempotency-key, x-mandate-signature',
    },
  })
}