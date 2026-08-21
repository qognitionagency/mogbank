import { NextRequest, NextResponse } from 'next/server'
import { decodeJwt } from 'jose'
import {
  ADMIN_SESSION_COOKIE,
  OAUTH_STATE_COOKIE,
  SESSION_MAX_AGE,
  createSessionToken,
  googleConfig,
  isAdminEmail,
  sessionCookieOptions,
} from '@/lib/admin-session'

export const dynamic = 'force-dynamic'

/** Send the operator back to /admin with a message rather than raw JSON. */
function back(request: NextRequest, error: string) {
  const url = new URL('/admin', new URL(request.url).origin)
  url.searchParams.set('auth_error', error)
  const response = NextResponse.redirect(url)
  response.cookies.delete(OAUTH_STATE_COOKIE)
  return response
}

/**
 * GET /api/admin/auth/callback — finish Google sign-in.
 *
 * Issues a session only when Google asserts a *verified* email that is on the
 * allowlist. Every other outcome returns the operator to /admin signed out.
 */
export async function GET(request: NextRequest) {
  const config = googleConfig(request)
  if (!config) return back(request, 'not_configured')

  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value

  if (url.searchParams.get('error')) return back(request, 'cancelled')
  if (!code) return back(request, 'no_code')
  if (!state || !expectedState || state !== expectedState) {
    return back(request, 'bad_state')
  }

  let idToken: string
  try {
    const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: config.clientId,
        client_secret: config.clientSecret,
        redirect_uri: config.redirectUri,
        grant_type: 'authorization_code',
      }),
    })

    if (!tokenResponse.ok) return back(request, 'token_exchange_failed')
    const tokens = (await tokenResponse.json()) as { id_token?: string }
    if (!tokens.id_token) return back(request, 'no_id_token')
    idToken = tokens.id_token
  } catch {
    return back(request, 'token_exchange_failed')
  }

  // The token came straight from Google's token endpoint over TLS in direct
  // response to our client_secret, so its origin is already established; we
  // read the claims rather than re-verifying the signature.
  const claims = decodeJwt(idToken) as {
    email?: string
    email_verified?: boolean | string
    name?: string
    picture?: string
    aud?: string
  }

  if (claims.aud !== config.clientId) return back(request, 'wrong_audience')

  const verified =
    claims.email_verified === true || claims.email_verified === 'true'
  if (!verified) return back(request, 'email_unverified')

  if (!isAdminEmail(claims.email)) return back(request, 'not_authorised')

  const token = await createSessionToken({
    email: (claims.email as string).toLowerCase(),
    name: claims.name,
    picture: claims.picture,
  })

  const response = NextResponse.redirect(
    new URL('/admin', new URL(request.url).origin)
  )
  response.cookies.set(
    ADMIN_SESSION_COOKIE,
    token,
    sessionCookieOptions(SESSION_MAX_AGE)
  )
  response.cookies.delete(OAUTH_STATE_COOKIE)
  return response
}
