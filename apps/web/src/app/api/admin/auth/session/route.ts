import { NextRequest, NextResponse } from 'next/server'
import { adminEmails, googleConfig, readSession } from '@/lib/admin-session'

export const dynamic = 'force-dynamic'

/** GET /api/admin/auth/session — who, if anyone, is signed in. */
export async function GET(request: NextRequest) {
  const session = await readSession(request)
  return NextResponse.json(
    {
      authenticated: Boolean(session),
      email: session?.email ?? null,
      name: session?.name ?? null,
      sso_configured: Boolean(googleConfig(request)),
      // The allowlist is not a secret — showing it makes a refused sign-in
      // self-explanatory rather than mysterious.
      allowed: adminEmails(),
    },
    { headers: { 'Cache-Control': 'no-store' } }
  )
}
