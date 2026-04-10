/**
 * Shared auth utilities for API routes.
 *
 * Middleware handles session enforcement for most routes.
 * This module provides helpers for routes with special auth needs
 * (e.g., /api/ingest which accepts both session auth AND Postmark webhooks).
 */

import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const ALLOWED_EMAILS = [
  'bmurch@thresholdbrands.com',
  'brandymurch@gmail.com',
]

/** Check if the current request has a valid session from an allowed email. */
export async function hasValidSession(): Promise<boolean> {
  const cookieStore = cookies()

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Read-only context
          }
        },
      },
    },
  )

  const { data: { user } } = await supabase.auth.getUser()
  return !!user && ALLOWED_EMAILS.includes(user.email ?? '')
}
