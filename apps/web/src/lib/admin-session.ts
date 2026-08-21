/**
 * Admin identity — Google sign-in, restricted to a single operator.
 *
 * MogBank has exactly one human role: the operator who watches the bank. That
 * role is bound to a specific *person*, identified by Google, rather than to a
 * shared secret that anyone holding it could use. The allowlist is a single
 * address by default and every part of this module fails closed:
 *
 *   - no Google credentials configured  → admin surface returns 503
 *   - a different Google account        → refused, no session issued
 *   - Google reports the email unverified → refused
 *   - no/expired/tampered session cookie → refused
 *
 * The session is a signed JWT in an httpOnly, SameSite=Lax cookie. It is not
 * readable from JavaScript, so an XSS on the admin page cannot exfiltrate it,
 * and it is not sent on cross-site POSTs.
 */

import { SignJWT, jwtVerify } from 'jose'
import type { NextRequest } from 'next/server'

export const ADMIN_SESSION_COOKIE = 'mogbank_admin_session'
export const OAUTH_STATE_COOKIE = 'mogbank_oauth_state'

/** How long a signed-in operator stays signed in. */
const SESSION_TTL_SECONDS = 12 * 60 * 60

/**
 * Who may administer this deployment.
 *
 * Defaults to the owner's address so the allowlist is never accidentally empty
 * (an empty allowlist that "allows everyone" is the classic way this goes
 * wrong). `ADMIN_EMAILS` can widen it later, but the intent today is one
 * person.
 */
export function adminEmails(): string[] {
  const configured = process.env.ADMIN_EMAILS ?? 'hello@qognitionagency.com'
  return configured
    .split(',')
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean)
}

export function isAdminEmail(email: string | undefined | null): boolean {
  if (!email) return false
  return adminEmails().includes(email.trim().toLowerCase())
}

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface GoogleConfig {
  clientId: string
  clientSecret: string
  redirectUri: string
}

/** Null when Google sign-in is not configured, which closes the admin surface. */
export function googleConfig(request?: NextRequest): GoogleConfig | null {
  const clientId = process.env.GOOGLE_CLIENT_ID
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET
  if (!clientId || !clientSecret) return null

  // Prefer an explicit origin so the redirect URI always matches what is
  // registered with Google, even behind Vercel's preview domains.
  const origin =
    process.env.ADMIN_OAUTH_ORIGIN ??
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : request
        ? new URL(request.url).origin
        : 'http://localhost:3000')

  return {
    clientId,
    clientSecret,
    redirectUri: `${origin}/api/admin/auth/callback`,
  }
}

function sessionSecret(): Uint8Array {
  const secret =
    process.env.ADMIN_SESSION_SECRET ?? process.env.GOOGLE_CLIENT_SECRET
  if (!secret) {
    throw new Error('Missing env.ADMIN_SESSION_SECRET')
  }
  return new TextEncoder().encode(secret)
}

// ---------------------------------------------------------------------------
// Session
// ---------------------------------------------------------------------------

export interface AdminSession {
  email: string
  name?: string
  picture?: string
}

export async function createSessionToken(session: AdminSession): Promise<string> {
  return new SignJWT({ ...session })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(session.email)
    .setIssuedAt()
    .setIssuer('mogbank')
    .setAudience('mogbank-admin')
    .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
    .sign(sessionSecret())
}

/**
 * Read and validate the operator session.
 *
 * The allowlist is re-checked on every request, not just at sign-in, so
 * removing someone from `ADMIN_EMAILS` revokes their access immediately
 * instead of when their cookie happens to expire.
 */
export async function readSession(
  request: NextRequest
): Promise<AdminSession | null> {
  const token = request.cookies.get(ADMIN_SESSION_COOKIE)?.value
  if (!token) return null

  try {
    const { payload } = await jwtVerify(token, sessionSecret(), {
      issuer: 'mogbank',
      audience: 'mogbank-admin',
    })
    const email = typeof payload.email === 'string' ? payload.email : null
    if (!isAdminEmail(email)) return null
    return {
      email: email as string,
      name: typeof payload.name === 'string' ? payload.name : undefined,
      picture: typeof payload.picture === 'string' ? payload.picture : undefined,
    }
  } catch {
    return null
  }
}

export function sessionCookieOptions(maxAge: number) {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    path: '/',
    maxAge,
  }
}

export const SESSION_MAX_AGE = SESSION_TTL_SECONDS
