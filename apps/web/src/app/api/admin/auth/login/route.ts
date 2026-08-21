import { NextRequest, NextResponse } from 'next/server'
import {
  googleConfig,
  OAUTH_STATE_COOKIE,
  sessionCookieOptions,
} from '@/lib/admin-session'

export const dynamic = 'force-dynamic'

/**
 * GET /api/admin/auth/login — begin Google sign-in.
 *
 * A random `state` is stored in a short-lived httpOnly cookie and echoed to
 * Google, so the callback can prove the response belongs to a flow this
 * browser actually started rather than one an attacker induced.
 */
export async function GET(request: NextRequest) {
  const config = googleConfig(request)
  if (!config) {
    return NextResponse.json(
      {
        error: 'Google sign-in is not configured on this deployment.',
        code: 'ADMIN_SSO_NOT_CONFIGURED',
        missing: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
      },
      { status: 503 }
    )
  }

  const state = crypto.randomUUID()
  const authorize = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  authorize.searchParams.set('client_id', config.clientId)
  authorize.searchParams.set('redirect_uri', config.redirectUri)
  authorize.searchParams.set('response_type', 'code')
  authorize.searchParams.set('scope', 'openid email profile')
  authorize.searchParams.set('state', state)
  // Always show the chooser: the operator may be signed into several Google
  // accounts and only one of them is allowed here.
  authorize.searchParams.set('prompt', 'select_account')

  const response = NextResponse.redirect(authorize.toString())
  response.cookies.set(OAUTH_STATE_COOKIE, state, sessionCookieOptions(600))
  return response
}
