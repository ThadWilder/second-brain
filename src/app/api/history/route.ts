export const dynamic = 'force-dynamic'

/**
 * GET /api/history
 * Returns entries in reverse chronological order with related entities and task counts.
 * Supports pagination (?page=1&limit=20) and search (?q=term).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const page = Math.max(1, parseInt(searchParams.get('page') ?? '1', 10))
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') ?? '20', 10)))
  const q = searchParams.get('q')?.trim() ?? ''
  const offset = (page - 1) * limit

  const db = getServiceClient()

  // Build query
  let query = db
    .from('entries')
    .select('id, raw_text, source, source_meta, links, created_at, processing_status', { count: 'exact' })
    .eq('org_id', ORG_ID)
    .eq('processing_status', 'done')
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  // Search filter: search subject (in source_meta), sender (in source_meta), and raw_text
  if (q) {
    // Use ilike on raw_text and cast source_meta to text for broad search
    query = query.or(`raw_text.ilike.%${q}%,source_meta::text.ilike.%${q}%`)
  }

  const { data: entries, count, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!entries || entries.length === 0) {
    return NextResponse.json({
      entries: [],
      total: count ?? 0,
      page,
      limit,
      hasMore: false,
    })
  }

  const entryIds = entries.map((e: { id: string }) => e.id)

  // Fetch linked entities for these entries (via entry_entities join)
  const { data: entryEntityLinks } = await db
    .from('entry_entities')
    .select('entry_id, relationship, entities(id, name, type)')
    .in('entry_id', entryIds)

  // Fetch task counts per entry
  const { data: taskLinks } = await db
    .from('tasks')
    .select('id, entry_id')
    .in('entry_id', entryIds)

  // Build lookup maps
  const entityMap: Record<string, Array<{ id: string; name: string; type: string; relationship: string }>> = {}
  for (const link of entryEntityLinks ?? []) {
    const l = link as unknown as { entry_id: string; relationship: string; entities: { id: string; name: string; type: string } | null }
    if (!l.entities) continue
    if (!entityMap[l.entry_id]) entityMap[l.entry_id] = []
    entityMap[l.entry_id].push({ ...l.entities, relationship: l.relationship })
  }

  const taskCountMap: Record<string, number> = {}
  for (const task of taskLinks ?? []) {
    const t = task as { id: string; entry_id: string | null }
    if (!t.entry_id) continue
    taskCountMap[t.entry_id] = (taskCountMap[t.entry_id] ?? 0) + 1
  }

  // Enrich entries
  const enriched = entries.map((entry: { id: string; raw_text: string; source: string; source_meta: Record<string, unknown> | null; links: string[] | null; created_at: string; processing_status: string }) => {
    const meta = (entry.source_meta ?? {}) as Record<string, string>
    return {
      id: entry.id,
      subject: meta.subject ?? null,
      sender: meta.from ?? null,
      source: entry.source,
      snippet: entry.raw_text?.slice(0, 200) ?? '',
      links: entry.links ?? [],
      created_at: entry.created_at,
      entities: entityMap[entry.id] ?? [],
      task_count: taskCountMap[entry.id] ?? 0,
    }
  })

  const total = count ?? 0

  return NextResponse.json({
    entries: enriched,
    total,
    page,
    limit,
    hasMore: offset + limit < total,
  })
}
