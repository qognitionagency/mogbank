import { NextRequest, NextResponse } from 'next/server'
import { requireAgent, requireSelf, requireVerifiedAgent } from '@/lib/auth'
import { createServerClient } from '@/lib/db'
import { signMandate } from '@/lib/crypto'
import nacl from 'tweetnacl'

export const dynamic = 'force-dynamic'

/**
 * MogBank's credential-issuing key, derived deterministically from a secret so
 * it is stable across serverless instances without a key-management service.
 *
 * The seed used to be `SUPABASE_SERVICE_ROLE_KEY`, falling back to the literal
 * string 'mogbank-dev-issuer'. That variable no longer exists, so every
 * credential was being signed with a key anyone reading this file could
 * reproduce. It now has a variable of its own and refuses to sign in
 * production without it, rather than quietly issuing forgeable credentials.
 */
function getIssuerKey(): { privateKey: string; publicKey: string } {
  const seed = process.env.CREDENTIAL_ISSUER_SEED
  if (!seed) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error(
        'Missing env.CREDENTIAL_ISSUER_SEED — refusing to sign credentials with a well-known key'
      )
    }
    console.warn(
      'CREDENTIAL_ISSUER_SEED is unset; signing with an insecure development key.'
    )
  }
  const material = seed ?? 'mogbank-development-issuer-not-for-production'
  const seedBytes = new TextEncoder().encode(material.slice(0, 32).padEnd(32, '0'))
  const kp = nacl.sign.keyPair.fromSeed(seedBytes)
  const toB64 = (b: Uint8Array) => Buffer.from(b).toString('base64')
  return { privateKey: toB64(kp.secretKey), publicKey: toB64(kp.publicKey) }
}

// POST /api/v1/agents/:id/credential — issue a Verifiable Credential
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireAgent(request)
    if (!auth.ok) return auth.response

    const { id } = await params
    const notSelf = requireSelf(auth.agent, id)
    if (notSelf) return notSelf.response
    const db = createServerClient()

    const { data: agent, error } = await db
      .from('agents')
      .select('id, wallet_address, public_key, principal_address, agent_type, kya_score, kya_status, email, metadata, created_at')
      .eq('id', id)
      .single()

    if (error || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    if (agent.kya_status === 'suspended' || agent.kya_status === 'rejected') {
      return NextResponse.json(
        { error: 'Credential cannot be issued for suspended or rejected agents' },
        { status: 403 }
      )
    }

    const issuedAt = new Date().toISOString()
    const expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    const issuerKey = getIssuerKey()

    const credentialPayload = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://mogbank.vercel.app/contexts/abos/v1',
      ],
      type: ['VerifiableCredential', 'ABOSAgentCredential'],
      id: `https://mogbank.vercel.app/api/v1/agents/${agent.id}/credential`,
      issuer: {
        id: 'https://mogbank.vercel.app',
        name: 'MogBank ABOS v1.0',
      },
      issuanceDate: issuedAt,
      expirationDate: expiresAt,
      credentialSubject: {
        id: agent.id,
        type: 'ABOSAgent',
        agentType: agent.agent_type,
        publicKey: agent.public_key,
        walletAddress: agent.wallet_address,
        principalAddress: agent.principal_address,
        kya: {
          version: 'KYA-7',
          score: agent.kya_score,
          status: agent.kya_status,
          tier:
            agent.kya_score >= 80
              ? 'platinum'
              : agent.kya_score >= 60
              ? 'verified'
              : agent.kya_score >= 40
              ? 'basic'
              : 'unverified',
        },
        registeredAt: agent.created_at,
      },
    }

    const signature = await signMandate(
      credentialPayload as Record<string, unknown>,
      issuerKey.privateKey
    )

    const vc = {
      ...credentialPayload,
      proof: {
        type: 'Ed25519Signature2020',
        created: issuedAt,
        verificationMethod: 'https://mogbank.vercel.app/.well-known/abos.json#issuerKey',
        proofPurpose: 'assertionMethod',
        proofValue: signature,
        issuerPublicKey: issuerKey.publicKey,
      },
    }

    // Audit log
    await db.from('audit_logs').insert({
      agent_id: agent.id,
      action: 'credential_issued',
      details: { kya_score: agent.kya_score, kya_status: agent.kya_status },
      ip_address: request.headers.get('x-forwarded-for') ?? undefined,
      user_agent: request.headers.get('user-agent') ?? undefined,
    })

    return NextResponse.json({ credential: vc }, { status: 201 })
  } catch (err) {
    console.error('Credential issuance error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

// GET /api/v1/agents/:id/credential — retrieve most-recently issued credential
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
    const db = createServerClient()

    const { data: agent, error } = await db
      .from('agents')
      .select('id, wallet_address, public_key, principal_address, agent_type, kya_score, kya_status, created_at')
      .eq('id', id)
      .single()

    if (error || !agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Re-derive the credential on read (stateless — no separate credential store)
    const issuerKey = getIssuerKey()
    const issuedAt = agent.created_at ?? new Date().toISOString()
    const expiresAt = new Date(
      new Date(issuedAt).getTime() + 365 * 24 * 60 * 60 * 1000
    ).toISOString()

    const credentialPayload = {
      '@context': [
        'https://www.w3.org/2018/credentials/v1',
        'https://mogbank.vercel.app/contexts/abos/v1',
      ],
      type: ['VerifiableCredential', 'ABOSAgentCredential'],
      id: `https://mogbank.vercel.app/api/v1/agents/${agent.id}/credential`,
      issuer: { id: 'https://mogbank.vercel.app', name: 'MogBank ABOS v1.0' },
      issuanceDate: issuedAt,
      expirationDate: expiresAt,
      credentialSubject: {
        id: agent.id,
        type: 'ABOSAgent',
        agentType: agent.agent_type,
        publicKey: agent.public_key,
        walletAddress: agent.wallet_address,
        principalAddress: agent.principal_address,
        kya: {
          version: 'KYA-7',
          score: agent.kya_score,
          status: agent.kya_status,
          tier:
            agent.kya_score >= 80
              ? 'platinum'
              : agent.kya_score >= 60
              ? 'verified'
              : agent.kya_score >= 40
              ? 'basic'
              : 'unverified',
        },
        registeredAt: agent.created_at,
      },
    }

    const signature = await signMandate(
      credentialPayload as Record<string, unknown>,
      issuerKey.privateKey
    )

    return NextResponse.json({
      credential: {
        ...credentialPayload,
        proof: {
          type: 'Ed25519Signature2020',
          created: issuedAt,
          verificationMethod:
            'https://mogbank.vercel.app/.well-known/abos.json#issuerKey',
          proofPurpose: 'assertionMethod',
          proofValue: signature,
          issuerPublicKey: issuerKey.publicKey,
        },
      },
    })
  } catch (err) {
    console.error('Get credential error:', err)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
