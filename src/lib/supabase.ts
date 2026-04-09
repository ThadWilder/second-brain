import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Browser / server-component client (uses anon key)
export const supabase = createClient(url, anonKey)

// Server-only client with full privileges (for API routes)
export function getServiceClient() {
  return createClient(url, serviceKey, {
    auth: { persistSession: false },
  })
}

export const ORG_ID = process.env.ORG_ID ?? '00000000-0000-0000-0000-000000000001'
