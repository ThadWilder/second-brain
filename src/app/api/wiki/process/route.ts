export const dynamic = 'force-dynamic'
export const maxDuration = 300 // 5 minutes on Pro plan

/**
 * POST /api/wiki/process
 *
 * Processes pending wiki queue items in batches of 3 with a 240s time guard.
 * Called fire-and-forget from ingest pipeline, or via /api/cron/wiki.
 * Protected by CRON_SECRET via Authorization: Bearer header.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { updateWikiPageForEntity } from '@/lib/wiki'
import type { Entity } from '@/types'

const BATCH_SIZE = 3
const TIME_LIMIT_MS = 240_000 // 240s of 300s max — leave room for cleanup

export async function POST(req: NextRequest): Promise<NextResponse> {
  const auth = req.headers.get('authorization')
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const START = Date.now()
  const db = getServiceClient()
  let totalProcessed = 0
  let timedOut = false

  // Loop through pending items in batches, stopping before timeout
  while (Date.now() - START < TIME_LIMIT_MS) {
    const { data: items, error: fetchErr } = await db
      .from('wiki_queue')
      .select('id, org_id, entry_id, entity_id')
      .eq('status', 'pending')
      .eq('org_id', ORG_ID)
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE)

    if (fetchErr || !items?.length) break

    // Mark batch as processing
    const itemIds = items.map((i) => i.id)
    await db
      .from('wiki_queue')
      .update({ status: 'processing' })
      .in('id', itemIds)

    for (const item of items) {
      try {
        const { data: entity } = await db
          .from('entities')
          .select('*')
          .eq('id', item.entity_id)
          .single()

        if (!entity) {
          await db
            .from('wiki_queue')
            .update({ status: 'failed' })
            .eq('id', item.id)
          continue
        }

        // Skip locked pages — user has paused auto-updates
        const slug = (entity.normalized_name as string).replace(/\s+/g, '-')
        const { data: wikiPage } = await db
          .from('wiki_pages')
          .select('locked')
          .eq('org_id', ORG_ID)
          .eq('slug', slug)
          .single()

        if (wikiPage?.locked) {
          await db
            .from('wiki_queue')
            .update({ status: 'done', processed_at: new Date().toISOString() })
            .eq('id', item.id)
          totalProcessed++
          continue
        }

        // entry_id may be null for wiki updates triggered by task/pending-response changes
        let entry: { raw_text: string; source: string; created_at: string } | null = null
        if (item.entry_id) {
          const { data } = await db
            .from('entries')
            .select('raw_text, source, created_at')
            .eq('id', item.entry_id)
            .single()
          entry = data
        }

        // If no entry, use a synthetic one so the wiki page still refreshes with current structured data
        const entryForUpdate = entry ?? {
          raw_text: '(Wiki refresh triggered by task or pending response update — no new email content.)',
          source: 'system',
          created_at: new Date().toISOString(),
        }

        await updateWikiPageForEntity(db, entity as Entity, entryForUpdate, item.entry_id)

        await db
          .from('wiki_queue')
          .update({ status: 'done', processed_at: new Date().toISOString() })
          .eq('id', item.id)

        totalProcessed++
      } catch (err) {
        console.error(`Wiki queue item ${item.id} failed:`, err)
        await db
          .from('wiki_queue')
          .update({ status: 'failed' })
          .eq('id', item.id)
      }
    }

    // Check time after each batch completes
    if (Date.now() - START >= TIME_LIMIT_MS) {
      timedOut = true
      break
    }
  }

  if (!timedOut && Date.now() - START >= TIME_LIMIT_MS) {
    timedOut = true
  }

  // Count any remaining pending items
  const { count } = await db
    .from('wiki_queue')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'pending')
    .eq('org_id', ORG_ID)

  return NextResponse.json({ processed: totalProcessed, remaining: count ?? 0, timedOut })
}
