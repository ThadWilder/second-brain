export const dynamic = 'force-dynamic'

/**
 * POST /api/upload
 *
 * Accepts multipart form data with an image file,
 * uploads to Supabase Storage 'attachments' bucket,
 * returns the public URL.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import crypto from 'crypto'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']
const MAX_SIZE = 10 * 1024 * 1024 // 10 MB

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Rate limit: 10 req/min per IP ──────────────────────────────────
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const rl = rateLimit(`upload:${ip}`, 10)
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
  }

  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json(
      { error: `Invalid file type: ${file.type}. Allowed: ${ALLOWED_TYPES.join(', ')}` },
      { status: 400 }
    )
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `File too large. Max size: ${MAX_SIZE / 1024 / 1024}MB` },
      { status: 400 }
    )
  }

  const ext = file.name.split('.').pop() ?? 'png'
  const storagePath = `${crypto.randomUUID()}.${ext}`

  const db = getServiceClient()
  const buffer = Buffer.from(await file.arrayBuffer())

  const { error: uploadError } = await db.storage
    .from('attachments')
    .upload(storagePath, buffer, {
      contentType: file.type,
      upsert: false,
    })

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 })
  }

  const { data: urlData } = db.storage
    .from('attachments')
    .getPublicUrl(storagePath)

  return NextResponse.json({
    url: urlData.publicUrl,
    type: file.type,
    filename: file.name,
  })
}
