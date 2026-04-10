import { createClient, SupabaseClient } from '@supabase/supabase-js'

// Lazy initialization — avoids crashing during Next.js build when env vars aren't set
let _supabase: SupabaseClient | null = null

export function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    _supabase = createClient(url, anonKey, {
      global: {
        fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
      },
    })
  }
  return _supabase
}

// Server-only client with full privileges (for API routes)
// Creates a fresh client every call to avoid stale data in serverless functions
export function getServiceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
    db: { schema: 'public' },
    global: {
      headers: { 'Cache-Control': 'no-cache' },
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  })
}

export const ORG_ID = process.env.ORG_ID ?? '00000000-0000-0000-0000-000000000001'

// Backwards compat — some components may import `supabase` directly
export const supabase = new Proxy({} as SupabaseClient, {
  get(_target, prop) {
    return (getSupabase() as unknown as Record<string, unknown>)[prop as string]
  },
})
