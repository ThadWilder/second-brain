export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes on Pro plan

/**
 * POST /api/wiki/process
 *
 * Processes pending wiki queue items one at a time.
 * Called fire-and-forget from ingest pipeline, or via cron as fallback.
 * Protected by CRON_SECRET via x-wiki-secret header.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { updateWikiPageForEntity } from '@/lib/wiki'
import type { Entity } from '@/types'

const BATCH_SIZE = 5

export async function POST(req: NextRequest): Promise<NextResponse> {
  if (req.headers.get('x-wiki-secret') !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()

  // Fetch pending items
  const { data: items, error: fetchErr } = await db
    .from('wiki_queue')
    .select('id, org_id, entry_id, entity_id')
    .eq('status', 'pending')
    .eq('org_id', ORG_ID)
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (fetchErr || !items?.length) {
    return NextResponse.json({ processed: 0, remaining: 0 })
  }

  // Mark as processing
  const itemIds = items.map((i) => i.id)
  await db
    .from('wiki_queue')
    .update({ status: 'processing' })
    .in('id', itemIds)

  let processed = 0

  for (const item of items) {
    try {
      // Load entity
      const { data: entity } = await db
        .from('entities')
        .select('*')
        .eq('id', item.entity_id)
        .single()

      // Load entry
      const { data: entry } = await db
        .from('entries')
        .select('raw_text, source, created_at')
        .eq('id', item.entry_id)
        .single()

      if (entity && entry) {
        await updateWikiPageForEntity(db, entity as Entity, entry, item.entry_id)
      }

      // Mark done
      await db
        .from('wiki_queue')
        .update({ status: 'done', processed_at: new Date().toISOString() })
        .eq('id', item.id)

      processed++
    } catch (err) {
      console.error(`Wiki queue item ${item.id} failed:`, err)
      await db
        .from('wiki_queue')
        .update({ status: 'failed' })
        .eq('id', item.id)
    }
  }

  // Check if more pending items remain
  const { count } = await db
    .from('wiki_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .eq('org_id', ORG_ID)

  const remaining = count ?? 0

  // Self-chain if more items remain
  if (remaining > 0) {
    fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://dumpbox.app'}/api/wiki/process`, {
      method: 'POST',
      headers: { 'x-wiki-secret': process.env.CRON_SECRET || '' },
    }).catch(() => {})
  }

  return NextResponse.json({ processed, remaining })
}
