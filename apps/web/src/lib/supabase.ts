/**
 * Supabase client for server-side and browser-side usage.
 *
 * Vercel deployment: uses @supabase/supabase-js createClient (ESM-compatible).
 * Browser: uses @supabase/ssr createBrowserClient.
 *
 * Service role key is used server-side for RLS-bypass operations
 * (agent registration, wallet creation, transfers).
 * Anon key is used client-side (read-only with RLS).
 */

import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

let _cachedSupabaseUrl: string | undefined
let _cachedServiceRoleKey: string | undefined

function getSupabaseUrl(): string {
  if (!_cachedSupabaseUrl) {
    _cachedSupabaseUrl =
      process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
    if (!_cachedSupabaseUrl) {
      throw new Error(
        'Missing env.NEXT_PUBLIC_SUPABASE_URL — set this in Vercel Environment Variables'
      )
    }
  }
  return _cachedSupabaseUrl
}

function getServiceRoleKey(): string {
  if (!_cachedServiceRoleKey) {
    _cachedServiceRoleKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!_cachedServiceRoleKey) {
      throw new Error(
        'Missing env.SUPABASE_SERVICE_ROLE_KEY — set this in Vercel Environment Variables'
      )
    }
  }
  return _cachedServiceRoleKey
}

function getAnonKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    ''
  )
}

/**
 * Create a Supabase client with the service role key.
 * Used in API routes for RLS-bypass operations.
 * WARNING: Never expose this client to the browser.
 */
export function createServerClient(): SupabaseClient {
  return createSupabaseClient(getSupabaseUrl(), getServiceRoleKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    db: {
      schema: 'public',
    },
    global: {
      headers: {
        'x-application-name': 'mogbank-vercel',
      },
    },
  })
}

/**
 * Create a Supabase client scoped to a specific agent's JWT.
 * Used for operations where RLS should apply.
 */
export function createAgentClient(agentJwt: string): SupabaseClient {
  return createSupabaseClient(getSupabaseUrl(), getAnonKey(), {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${agentJwt}`,
        'x-application-name': 'mogbank-vercel',
      },
    },
  })
}

/**
 * Create a read-only public client (anon key).
 * Safe for server components that only need public data.
 */
export function createPublicClient(): SupabaseClient {
  return createSupabaseClient(getSupabaseUrl(), getAnonKey(), {
    db: { schema: 'public' },
    global: {
      headers: { 'x-application-name': 'mogbank-vercel' },
    },
  })
}

/**
 * Create a browser client using @supabase/ssr.
 * Used in client components for authenticated reads.
 */
export function createBrowserClient(): SupabaseClient {
  const { createBrowserClient: createSSRClient } =
    require('@supabase/ssr') as typeof import('@supabase/ssr')
  return createSSRClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  ) as unknown as SupabaseClient
}