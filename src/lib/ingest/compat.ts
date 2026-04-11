/**
 * Reply threading and source detection utilities.
 */

import { SupabaseClient } from '@supabase/supabase-js'
import type { EntrySource } from '@/types'

// ─────────────────────────────────────────
// Detect reply threading from Postmark inbound
// ─────────────────────────────────────────
export async function linkReplyToNudge(
  db: SupabaseClient,
  inReplyTo: string | undefined,
  responseEntryId: string
): Promise<void> {
  if (!inReplyTo) return

  // Strip angle brackets from In-Reply-To header
  const cleaned = inReplyTo.replace(/[<>]/g, '')

  const { data: nudge } = await db
    .from('nudge_messages')
    .select('id')
    .eq('postmark_message_id', cleaned)
    .single()

  if (!nudge) return

  // Mark nudge as responded
  await db
    .from('nudge_messages')
    .update({ responded: true, response_entry_id: responseEntryId })
    .eq('id', nudge.id)

  // De-escalate all tasks in this nudge that are now done (the ingest pipeline will handle it)
  // Also record the link for context in the ingest pipeline
}

// ─────────────────────────────────────────
// Source detection from payload shape
// ─────────────────────────────────────────
export function detectSource(body: Record<string, unknown>): EntrySource {
  if (body.MessageID && body.From) return 'email'
  if (body.source === 'chat') return 'chat'
  if (body.source === 'meeting_notes') return 'meeting_notes'
  return 'paste'
}
