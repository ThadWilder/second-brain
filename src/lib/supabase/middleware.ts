import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const ALLOWED_EMAILS = [
  'bmurch@thresholdbrands.com',
  'brandymurch@gmail.com',
]

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  // Allow /login and /auth/callback without auth
  if (pathname === '/login' || pathname.startsWith('/auth/callback')) {
    // If already logged in and on /login, redirect to dashboard
    if (user && ALLOWED_EMAILS.includes(user.email ?? '') && pathname === '/login') {
      const url = request.nextUrl.clone()
      url.pathname = '/'
      return NextResponse.redirect(url)
    }
    return supabaseResponse
  }

  // Cron routes — skip session auth (they use CRON_SECRET)
  if (pathname.startsWith('/api/cron')) {
    return supabaseResponse
  }

  // API routes — return 401 if not authenticated
  if (pathname.startsWith('/api/')) {
    // /api/ingest allows Postmark webhooks without session — check in route handler
    if (pathname === '/api/ingest') {
      return supabaseResponse
    }
    // /api/public/* routes use token auth, not session
    if (pathname.startsWith('/api/public/')) {
      return supabaseResponse
    }

    if (!user || !ALLOWED_EMAILS.includes(user.email ?? '')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    return supabaseResponse
  }

  // Public pages — no auth needed
  if (pathname.startsWith('/public/')) {
    return supabaseResponse
  }

  // Page routes — redirect to login if not authenticated
  if (!user || !ALLOWED_EMAILS.includes(user.email ?? '')) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}
