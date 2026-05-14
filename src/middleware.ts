import { updateSession } from '@/lib/supabase/middleware'
import { NextResponse, type NextRequest } from 'next/server'

const ALLOWED_ORIGINS = [
  'https://dumpbox.app',
  'https://second-brain-delta-eight.vercel.app',
  'https://second-brain-eight-bay.vercel.app',
]

function setCorsHeaders(response: NextResponse, origin: string | null) {
  if (origin && ALLOWED_ORIGINS.includes(origin)) {
    response.headers.set('Access-Control-Allow-Origin', origin)
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-postmark-signature')
    response.headers.set('Access-Control-Max-Age', '86400')
  }
  return response
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const origin = request.headers.get('origin')

  // ── CORS for /api/* routes ──────────────────────────────────────────
  if (pathname.startsWith('/api/')) {
    // Handle preflight OPTIONS requests
    if (request.method === 'OPTIONS') {
      const response = new NextResponse(null, { status: 204 })
      return setCorsHeaders(response, origin)
    }

    // Exempt webhook and cron routes from CORS origin checking (they have their own auth)
    const isWebhookOrCron = pathname.startsWith('/api/ingest') || pathname.startsWith('/api/cron')

    // Block cross-origin mutations from disallowed origins
    if (
      !isWebhookOrCron &&
      origin &&
      !ALLOWED_ORIGINS.includes(origin) &&
      ['POST', 'PATCH', 'DELETE'].includes(request.method)
    ) {
      return NextResponse.json(
        { error: 'CORS: origin not allowed' },
        { status: 403 },
      )
    }
  }

  // ── Existing auth / session logic ───────────────────────────────────
  const response = await updateSession(request)
  return setCorsHeaders(response, origin)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public assets
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
