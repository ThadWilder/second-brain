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
import {
  verifyPostmarkWebhook,
  parsePostmarkInbound,
} from '@/lib/postmark'
import crypto from 'crypto'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const rawBody = await req.text()
  let body: Record<string, unknown>

  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const source = detectSource(body)

  // ── Postmark webhook signature verification ──────────────────────────
  if (source === 'email') {
    const signature = req.headers.get('x-postmark-signature')
    if (!verifyPostmarkWebhook(rawBody, signature)) {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 })
    }
  }

  const db = getServiceClient()

  // ── Determine raw text + dedupe key ─────────────────────────────────
  let rawText: string
  let dedupeKey: string
  let sourceMeta: Record<string, unknown> = {}
  let inReplyTo: string | undefined

  if (source === 'email') {
    const inbound = parsePostmarkInbound(body)
    rawText = inbound.StrippedTextReply ?? inbound.TextBody
    dedupeKey = inbound.MessageID
    inReplyTo = inbound.InReplyTo
    sourceMeta = {
      subject: inbound.Subject,
      from: inbound.From,
      message_id: inbound.MessageID,
    }
  } else {
    // paste / chat / meeting_notes
    rawText = (body.text as string) ?? (body.raw_text as string) ?? ''
    if (!rawText) {
      return NextResponse.json({ error: 'No text provided' }, { status: 400 })
    }
    dedupeKey = crypto.randomUUID()
    sourceMeta = { source }
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

  const { data: newEntry, error: insertError } = await db
    .from('entries')
    .insert({
      org_id: ORG_ID,
      raw_text: rawText,
      source,
      source_meta: sourceMeta,
      source_dedupe_key: dedupeKey,
      processing_status: 'pending',
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

  // ── Step 2: Process synchronously ────────────────────────────────────
  try {
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
