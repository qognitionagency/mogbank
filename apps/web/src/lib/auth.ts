/**
 * Request authentication and authorisation.
 *
 * MogBank has no interactive login: the account holders are autonomous agents,
 * and an agent proves who it is with the API key issued at registration. There
 * are exactly three tiers:
 *
 *   public  — discovery, registration, and browsing the service marketplace
 *   agent   — anything that reads or moves one agent's money
 *   admin   — the human operator's read-only view over every agent
 *
 * Two rules matter more than the mechanism:
 *
 *   1. Authorisation is ownership, not just identity. Knowing a wallet id must
 *      never be enough to touch it — `requireWalletOwner` re-derives the owner
 *      from the database on every call rather than trusting the request body.
 *
 *   2. Everything fails closed. A missing ADMIN_API_KEY disables the admin
 *      surface rather than opening it, and any lookup error is a rejection.
 */

import { NextRequest, NextResponse } from 'next/server'
import { hashApiKey } from '@/lib/crypto'
import { query } from '@/lib/db'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AgentPrincipal {
  agentId: string
  apiKeyId: string
  kyaStatus: string
  status: string
}

/** A rejection, ready to return from a route handler. */
export type AuthFailure = { ok: false; response: NextResponse }
export type AuthSuccess<T> = { ok: true } & T

export type AuthResult<T> = AuthSuccess<T> | AuthFailure

function deny(
  status: number,
  code: string,
  message: string,
  extra?: Record<string, unknown>
): AuthFailure {
  return {
    ok: false,
    response: NextResponse.json(
      { error: message, code, ...extra },
      { status, headers: { 'Cache-Control': 'no-store' } }
    ),
  }
}

// ---------------------------------------------------------------------------
// Credential extraction
// ---------------------------------------------------------------------------

/** Accept either `x-api-key: <key>` or `Authorization: Bearer <key>`. */
function readApiKey(request: NextRequest): string | null {
  const header = request.headers.get('x-api-key')
  if (header) return header.trim()

  const authorization = request.headers.get('authorization')
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim()
  }
  return null
}

/**
 * Compare two strings without leaking their common prefix through timing.
 * Used for the admin key, which is a shared secret rather than a hash lookup.
 */
function timingSafeEqual(a: string, b: string): boolean {
  const encoder = new TextEncoder()
  const left = encoder.encode(a)
  const right = encoder.encode(b)
  // Length is not secret, but bail out in constant time relative to `left`.
  let mismatch = left.length ^ right.length
  for (let i = 0; i < left.length; i++) {
    mismatch |= left[i] ^ (right[i] ?? 0)
  }
  return mismatch === 0
}

// ---------------------------------------------------------------------------
// Agent authentication
// ---------------------------------------------------------------------------

/**
 * Resolve the agent behind a request's API key.
 *
 * Returns null for every failure mode — absent key, unknown key, revoked key,
 * suspended agent — so callers cannot accidentally distinguish "no such key"
 * from "key belongs to a suspended agent", which would turn the endpoint into
 * a key oracle.
 */
export async function resolveAgent(
  request: NextRequest
): Promise<AgentPrincipal | null> {
  const apiKey = readApiKey(request)
  if (!apiKey) return null

  try {
    const rows = await query<{
      api_key_id: string
      agent_id: string
      kya_status: string
      status: string
    }>(
      `SELECT k.id     AS api_key_id,
              a.id     AS agent_id,
              a.kya_status,
              a.status
         FROM api_keys k
         JOIN agents a ON a.id = k.agent_id
        WHERE k.key_hash = $1
          AND k.revoked_at IS NULL
          AND (k.expires_at IS NULL OR k.expires_at > NOW())
        LIMIT 1`,
      [hashApiKey(apiKey)]
    )

    const row = rows[0]
    if (!row) return null
    if (row.status !== 'active') return null

    // Best-effort usage timestamp; never let it fail the request.
    void query(`UPDATE api_keys SET last_used_at = NOW() WHERE id = $1`, [
      row.api_key_id,
    ]).catch(() => {})

    return {
      agentId: row.agent_id,
      apiKeyId: row.api_key_id,
      kyaStatus: row.kya_status,
      status: row.status,
    }
  } catch {
    return null
  }
}

/** Require a valid agent API key. */
export async function requireAgent(
  request: NextRequest
): Promise<AuthResult<{ agent: AgentPrincipal }>> {
  const agent = await resolveAgent(request)
  if (!agent) {
    return deny(
      401,
      'UNAUTHENTICATED',
      'A valid API key is required. Send it as x-api-key or Authorization: Bearer.'
    )
  }
  return { ok: true, agent }
}

/**
 * Require an agent that is cleared to move money.
 *
 * Registration issues a key immediately, but an agent below the KYA threshold
 * can only read — it must not transact until a human or the scoring pass
 * promotes it to `verified`.
 */
export async function requireVerifiedAgent(
  request: NextRequest
): Promise<AuthResult<{ agent: AgentPrincipal }>> {
  const result = await requireAgent(request)
  if (!result.ok) return result

  if (result.agent.kyaStatus !== 'verified') {
    return deny(
      403,
      'KYA_NOT_VERIFIED',
      'This agent is not cleared to move funds.',
      { kya_status: result.agent.kyaStatus }
    )
  }
  return result
}

// ---------------------------------------------------------------------------
// Ownership
// ---------------------------------------------------------------------------

export interface OwnedWallet {
  id: string
  agent_id: string
  balance: number
  currency: string
  wallet_type: string
  status: string
}

/**
 * Require that the authenticated agent owns `walletId`.
 *
 * A wallet the caller does not own is reported as 404, not 403: confirming that
 * an id exists is itself a disclosure, and an agent has no business learning
 * which of its guesses are real wallets.
 */
export async function requireWalletOwner(
  agent: AgentPrincipal,
  walletId: string | undefined | null
): Promise<AuthResult<{ wallet: OwnedWallet }>> {
  if (!walletId) {
    return deny(400, 'MISSING_WALLET_ID', 'A wallet id is required.')
  }

  let rows: OwnedWallet[]
  try {
    rows = await query<OwnedWallet>(
      `SELECT id, agent_id, balance, currency, wallet_type, status
         FROM wallets
        WHERE id = $1 AND agent_id = $2
        LIMIT 1`,
      [walletId, agent.agentId]
    )
  } catch {
    return deny(400, 'INVALID_WALLET_ID', 'Malformed wallet id.')
  }

  const wallet = rows[0]
  if (!wallet) {
    return deny(404, 'WALLET_NOT_FOUND', 'No such wallet for this agent.')
  }
  return { ok: true, wallet }
}

/**
 * Require that the authenticated agent *is* the agent being addressed.
 * Used by the per-agent read endpoints, which would otherwise let any key
 * enumerate every agent's profile, score and credentials.
 */
export function requireSelf(
  agent: AgentPrincipal,
  agentId: string | undefined | null
): AuthFailure | null {
  if (!agentId || agentId !== agent.agentId) {
    return deny(404, 'AGENT_NOT_FOUND', 'No such agent.')
  }
  return null
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

/**
 * Require the operator's admin key.
 *
 * This is the human monitoring tier, deliberately separate from agent keys —
 * no agent credential should ever read the whole bank. With ADMIN_API_KEY
 * unset the surface is closed rather than open, so a missing environment
 * variable cannot silently publish every agent, wallet and transaction.
 */
export function requireAdmin(request: NextRequest): AuthFailure | null {
  const expected = process.env.ADMIN_API_KEY
  if (!expected) {
    return deny(
      503,
      'ADMIN_DISABLED',
      'Admin access is not configured on this deployment.'
    )
  }

  const presented =
    request.headers.get('x-admin-key')?.trim() ||
    (request.headers.get('authorization')?.toLowerCase().startsWith('bearer ')
      ? request.headers.get('authorization')!.slice(7).trim()
      : null)

  if (!presented || !timingSafeEqual(expected, presented)) {
    return deny(401, 'UNAUTHENTICATED', 'A valid admin key is required.')
  }
  return null
}
