export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/ingest
 *
 * Single endpoint for:
 *   - Postmark inbound email webhooks
 *   - Chat UI paste/text dumps
 *
 * Step 1: Dedupe + store raw → return 200 quickly
 * Step 2: Process synchronously (Claude tool-use call)
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { processEntry, detectSource, linkReplyToNudge } from '@/lib/ingest'
import { parsePostmarkInbound } from '@/lib/postmark'
import type { PostmarkAttachment } from '@/lib/postmark'
import type { Attachment } from '@/types'
import { hasValidSession } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import crypto from 'crypto'
import { parsePrefixes } from '@/lib/ingest/prefixes'
import { uploadReceiptAttachments, extractReceiptMeta, saveReceipt } from '@/lib/ingest/receipt'
import { isBlocklisted, extractSenderEmail } from '@/lib/blocklist'
import type { ParsedPrefixes } from '@/types'

const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']

async function uploadPostmarkAttachments(
  attachments: PostmarkAttachment[]
): Promise<Attachment[]> {
  const db = getServiceClient()
  const results: Attachment[] = []

  for (const att of attachments) {
    if (!IMAGE_TYPES.includes(att.ContentType)) continue

    const ext = att.Name.split('.').pop() ?? 'png'
    const storagePath = `email/${crypto.randomUUID()}.${ext}`
    const buffer = Buffer.from(att.Content, 'base64')

    const { error } = await db.storage
      .from('attachments')
      .upload(storagePath, buffer, {
        contentType: att.ContentType,
        upsert: false,
      })

    if (error) {
      console.error(`Failed to upload attachment ${att.Name}:`, error.message)
      continue
    }

    const { data: urlData } = db.storage
      .from('attachments')
      .getPublicUrl(storagePath)

    results.push({
      url: urlData.publicUrl,
      type: att.ContentType,
      filename: att.Name,
    })
  }

  return results
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // ── Rate limit: 30 req/min per IP ──────────────────────────────────
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() ?? 'unknown'
  const rl = rateLimit(`ingest:${ip}`, 30)
  if (rl.limited) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(Math.ceil(rl.retryAfterMs / 1000)) } },
    )
  }

  const rawBody = await req.text()
  let body: Record<string, unknown>

  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const source = detectSource(body)

  // ── Auth: Postmark inbound payload check OR valid session ─────────────
  if (source === 'email') {
    // Postmark inbound webhooks don't send a signature header (only outbound event webhooks do).
    // Verify by checking required Postmark inbound fields exist.
    const hasPostmarkFields = body.MessageID && body.From && (body.TextBody !== undefined || body.HtmlBody !== undefined)
    if (!hasPostmarkFields) {
      return NextResponse.json({ error: 'Invalid inbound payload' }, { status: 401 })
    }
  } else {
    // Non-email submissions require a valid session
    const authenticated = await hasValidSession()
    if (!authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const db = getServiceClient()

  // ── Determine owner ─────────────────────────────────────────────────
  const OWNER_MAP: Record<string, string> = {
    'bmurch@thresholdbrands.com': 'bmurch@thresholdbrands.com',
    'brandymurch@gmail.com': 'bmurch@thresholdbrands.com',
    'mtipsword@thresholdbrands.com': 'mtipsword@thresholdbrands.com',
  }

  let ownerEmail: string | null = null
  if (source === 'email') {
    const from = ((body.From as string) ?? '').toLowerCase()
    // Extract email from "Name <email>" format
    const emailMatch = from.match(/<([^>]+)>/) ?? [null, from]
    ownerEmail = OWNER_MAP[emailMatch[1]?.trim()] ?? null
  } else {
    const sessionEmail = await hasValidSession()
    ownerEmail = sessionEmail ? (OWNER_MAP[sessionEmail] ?? sessionEmail) : null
  }

  // ── Determine raw text + dedupe key ─────────────────────────────────
  let rawText: string
  let dedupeKey: string
  let sourceMeta: Record<string, unknown> = {}
  let inReplyTo: string | undefined
  let attachments: Attachment[] = []
  let prefixes: ParsedPrefixes = { isReceipt: false, note: null, projectName: null }
  let parsedInbound: ReturnType<typeof parsePostmarkInbound> | null = null

  if (source === 'email') {
    const inbound = parsePostmarkInbound(body)
    parsedInbound = inbound
    // StrippedTextReply often contains only the sender's signature on forwards.
    // Use TextBody when it has substantially more content (the full thread).
    const stripped = (inbound.StrippedTextReply || '').trim()
    const full = (inbound.TextBody || '').trim()
    // Strip cid references and URLs to measure real text content
    const strippedClean = stripped.replace(/\[cid:[^\]]+\]/g, '').replace(/https?:\/\/\S+/g, '').replace(/\s+/g, ' ').trim()
    rawText = (strippedClean.length > 50 && stripped.length >= full.length * 0.3) ? stripped : full
    dedupeKey = inbound.MessageID
    inReplyTo = inbound.InReplyTo
    sourceMeta = {
      subject: inbound.Subject,
      from: inbound.From,
      message_id: inbound.MessageID,
      owner_email: ownerEmail,
    }

    // ── Prefix detection (before attachment upload) ──────────────
    prefixes = parsePrefixes((inbound.Subject ?? '') as string)
    if (prefixes.note) (sourceMeta as any).user_note = prefixes.note
    if (prefixes.projectName) (sourceMeta as any).project_name = prefixes.projectName

    // Upload image attachments -- receipts handle their own upload path
    if (!prefixes.isReceipt && inbound.Attachments.length > 0) {
      attachments = await uploadPostmarkAttachments(inbound.Attachments)
    }

    // Bail early if email has no usable text and no attachments
    if (!rawText?.trim() && attachments.length === 0 && !prefixes.isReceipt) {
      return NextResponse.json({ error: 'Email had no text or attachments' }, { status: 400 })
    }
  } else {
    // paste / chat / meeting_notes
    rawText = (body.text as string) ?? (body.raw_text as string) ?? ''
    // Accept attachments passed from client
    if (Array.isArray(body.attachments)) {
      attachments = body.attachments as Attachment[]
    }
    if (!rawText && attachments.length === 0) {
      return NextResponse.json({ error: 'No text or attachments provided' }, { status: 400 })
    }
    dedupeKey = crypto.randomUUID()
    sourceMeta = { source, owner_email: ownerEmail }
  }

  // ── Step 1: Dedupe + store raw ────────────────────────────────────────
  const { data: existing } = await db
    .from('entries')
    .select('id, processing_status')
    .eq('source_dedupe_key', dedupeKey)
    .single()

  if (existing) {
    // Already ingested — idempotent, return OK
    return NextResponse.json({ entry_id: existing.id, duplicate: true })
  }

  // ── Blocklist check ──────────────────────────────────────────────
  if (source === 'email') {
    const senderEmail = extractSenderEmail((body.From as string) ?? '')
    const blocked = await isBlocklisted(senderEmail)
    if (blocked) {
      return NextResponse.json({ blocked: true })
    }
  }

  const { data: newEntry, error: insertError } = await db
    .from('entries')
    .insert({
      org_id: ORG_ID,
      raw_text: rawText,
      source,
      source_meta: sourceMeta,
      source_dedupe_key: dedupeKey,
      processing_status: 'pending',
      attachments,
    })
    .select()
    .single()

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 })
  }

  // ── Handle reply threading (link to nudge) ────────────────────────────
  if (inReplyTo) {
    await linkReplyToNudge(db, inReplyTo, newEntry.id)
  }

  // ── Step 2: Process ──────────────────────────────────────────────
  try {
    if (prefixes.isReceipt && parsedInbound) {
      // Receipt-specific path: upload files, extract meta, save to saved_links
      const receiptAttachments = await uploadReceiptAttachments(parsedInbound.Attachments)
      const meta = await extractReceiptMeta(rawText, receiptAttachments)
      const receipt = await saveReceipt(newEntry.id, meta, receiptAttachments)

      // Mark entry as done
      await db.from('entries').update({
        processing_status: 'done',
        processed_at: new Date().toISOString(),
      }).eq('id', newEntry.id)

      return NextResponse.json({
        entry_id: newEntry.id,
        receipt_id: receipt.id,
        type: 'receipt',
        meta,
      })
    }

    const result = await processEntry(db, newEntry.id)
    return NextResponse.json(result)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return NextResponse.json(
      { entry_id: newEntry.id, error: message, processing_status: 'failed' },
      { status: 500 }
    )
  }
}
