export const dynamic = 'force-dynamic'

/**
 * GET /api/links
 * Returns deduplicated links extracted from entries + manually saved links.
 * Supports search (?q=term) and category filter (?type=spreadsheet).
 *
 * POST /api/links
 * Saves a manually added link.
 *
 * DELETE /api/links?id=uuid
 * Deletes a manually saved link.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'
import { isJunkUrl } from '@/lib/ingest/urls'

type LinkCategory = 'spreadsheet' | 'document' | 'presentation' | 'drive' | 'sharepoint' | 'other'

interface LinkSource {
  entry_id: string
  subject: string | null
  date: string
}

interface LinkResult {
  url: string
  category: LinkCategory
  domain: string
  label: string | null
  sources: LinkSource[]
  entities: { id: string; name: string; type: string }[]
  first_seen: string
  last_seen: string
  saved_link_id: string | null
  pinned: boolean
  hidden_entity_ids: string[]
  project_entity_id: string | null
  kind: 'link' | 'receipt'
  receipt_meta: Record<string, unknown> | null
  file_url: string | null
  file_type: string | null
}

function categorizeUrl(url: string): LinkCategory {
  const lower = url.toLowerCase()
  try {
    const parsed = new URL(url)
    const host = parsed.hostname.toLowerCase()
    const path = parsed.pathname.toLowerCase()

    // Spreadsheets
    if (host === 'docs.google.com' && path.startsWith('/spreadsheets')) return 'spreadsheet'
    if (host === 'sheets.google.com') return 'spreadsheet'
    if (lower.endsWith('.xlsx') || lower.endsWith('.csv') || lower.endsWith('.xls')) return 'spreadsheet'

    // Documents
    if (host === 'docs.google.com' && path.startsWith('/document')) return 'document'
    if (host.endsWith('notion.so') || host === 'notion.so') return 'document'
    if (lower.endsWith('.docx') || lower.endsWith('.doc') || lower.endsWith('.pdf')) return 'document'

    // Presentations
    if (host === 'docs.google.com' && path.startsWith('/presentation')) return 'presentation'
    if (lower.endsWith('.pptx') || lower.endsWith('.ppt')) return 'presentation'

    // Drive
    if (host === 'drive.google.com') return 'drive'

    // SharePoint
    if (host === 'sharepoint.com' || host.endsWith('.sharepoint.com')) return 'sharepoint'

    return 'other'
  } catch {
    return 'other'
  }
}

function extractDomain(url: string): string {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function extractDisplayName(url: string): string {
  try {
    const parsed = new URL(url)
    const path = parsed.pathname
    // Try to get the last meaningful path segment
    const segments = path.split('/').filter(Boolean)
    if (segments.length > 0) {
      const last = decodeURIComponent(segments[segments.length - 1])
      // Skip generic segments like 'edit', 'view', 'pub'
      if (!['edit', 'view', 'pub', 'preview', 'copy', 'export'].includes(last.toLowerCase())) {
        return last.replace(/[-_]/g, ' ')
      }
      if (segments.length > 1) {
        return decodeURIComponent(segments[segments.length - 2]).replace(/[-_]/g, ' ')
      }
    }
    return parsed.hostname
  } catch {
    return url
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const q = searchParams.get('q')?.trim() ?? ''
  const categoryFilter = searchParams.get('category')?.trim() || searchParams.get('type')?.trim() || ''
  const kindFilter = searchParams.get('kind')?.trim() ?? 'all'  // all | links | receipts
  const statusFilter = searchParams.get('status')?.trim() ?? ''  // 'new' = unhandled, 'pinned' = pinned only

  const db = getServiceClient()

  // Fetch entries with non-empty links
  const { data: entries, error: entriesError } = await db
    .from('entries')
    .select('id, links, source_meta, created_at')
    .eq('org_id', ORG_ID)
    .eq('processing_status', 'done')
    .neq('links', '{}')
    .order('created_at', { ascending: false })

  if (entriesError) {
    return NextResponse.json({ error: entriesError.message }, { status: 500 })
  }

  // Fetch saved links
  const { data: savedLinks, error: savedError } = await db
    .from('saved_links')
    .select('id, url, label, category, brand_entity_id, hidden, pinned, type, receipt_meta, file_url, file_type, entry_id, hidden_entity_ids, project_entity_id, created_at')
    .eq('org_id', ORG_ID)
    .order('created_at', { ascending: false })

  // If saved_links table doesn't exist yet, just use empty array
  const allSavedLinks = savedError ? [] : (savedLinks ?? [])
  const hiddenUrls = new Set(allSavedLinks.filter((l: any) => l.hidden).map((l: any) => l.url))
  const allManualLinks = allSavedLinks.filter((l: any) => !l.hidden)
  // Split receipts from regular links
  const receiptLinks = allManualLinks.filter((l: any) => l.type === 'receipt')
  const manualLinks = kindFilter === 'receipts'
    ? []
    : allManualLinks.filter((l: any) => l.type !== 'receipt')

  // Collect all entry IDs that have links
  const entryIds = (entries ?? []).map((e: { id: string }) => e.id)

  // Fetch entities for entries with links
  let entityMap: Record<string, { id: string; name: string; type: string }[]> = {}
  if (entryIds.length > 0) {
    const { data: entryEntityLinks } = await db
      .from('entry_entities')
      .select('entry_id, entities(id, name, type)')
      .in('entry_id', entryIds)

    for (const link of entryEntityLinks ?? []) {
      const l = link as unknown as { entry_id: string; entities: { id: string; name: string; type: string } | null }
      if (!l.entities) continue
      if (!entityMap[l.entry_id]) entityMap[l.entry_id] = []
      // Deduplicate entities per entry
      if (!entityMap[l.entry_id].some(e => e.id === l.entities!.id)) {
        entityMap[l.entry_id].push(l.entities)
      }
    }
  }

  // Build URL -> LinkResult map for deduplication
  const urlMap = new Map<string, LinkResult>()

  for (const entry of entries ?? []) {
    const e = entry as { id: string; links: string[] | null; source_meta: Record<string, string> | null; created_at: string }
    const meta = e.source_meta ?? {}
    const subject = meta.subject ?? null
    const links = e.links ?? []

    for (const url of links) {
      if (hiddenUrls.has(url)) continue
      const existing = urlMap.get(url)
      const source: LinkSource = {
        entry_id: e.id,
        subject,
        date: e.created_at,
      }

      if (existing) {
        existing.sources.push(source)
        // Merge entities
        for (const ent of entityMap[e.id] ?? []) {
          if (!existing.entities.some(x => x.id === ent.id)) {
            existing.entities.push(ent)
          }
        }
        // Update date range
        if (e.created_at < existing.first_seen) existing.first_seen = e.created_at
        if (e.created_at > existing.last_seen) existing.last_seen = e.created_at
      } else {
        urlMap.set(url, {
          url,
          category: categorizeUrl(url),
          domain: extractDomain(url),
          label: null,
          sources: [source],
          entities: [...(entityMap[e.id] ?? [])],
          first_seen: e.created_at,
          last_seen: e.created_at,
          saved_link_id: null,
          pinned: false,
          hidden_entity_ids: [],
          project_entity_id: null,
          kind: 'link',
          receipt_meta: null,
          file_url: null,
          file_type: null,
        })
      }
    }
  }

  // Merge manually saved links (non-receipts only, unless kindFilter === 'receipts')
  for (const sl of manualLinks) {
    const s = sl as { id: string; url: string; label: string | null; category: string | null; brand_entity_id: string | null; pinned: boolean; hidden_entity_ids?: string[] | null; project_entity_id?: string | null; created_at: string }
    const existing = urlMap.get(s.url)
    if (existing) {
      if (s.label) existing.label = s.label
      if (s.category) existing.category = s.category as LinkCategory
      existing.saved_link_id = s.id
      existing.pinned = !!s.pinned
      existing.hidden_entity_ids = s.hidden_entity_ids ?? []
      existing.project_entity_id = s.project_entity_id ?? null
    } else {
      urlMap.set(s.url, {
        url: s.url,
        category: (s.category as LinkCategory) ?? categorizeUrl(s.url),
        domain: extractDomain(s.url),
        label: s.label,
        sources: [],
        entities: [],
        first_seen: s.created_at,
        last_seen: s.created_at,
        saved_link_id: s.id,
        pinned: !!s.pinned,
        hidden_entity_ids: s.hidden_entity_ids ?? [],
        project_entity_id: s.project_entity_id ?? null,
        kind: 'link',
        receipt_meta: null,
        file_url: null,
        file_type: null,
      })
    }
  }

  // Add receipt rows (only when kindFilter is 'all' or 'receipts')
  if (kindFilter !== 'links') {
    for (const sl of receiptLinks) {
      const s = sl as {
        id: string; url: string; label: string | null; category: string | null
        pinned: boolean; created_at: string
        receipt_meta: Record<string, unknown> | null
        file_url: string | null; file_type: string | null
      }
      urlMap.set(s.url || `receipt:${s.id}`, {
        url: s.url || '',
        category: (s.category as LinkCategory) ?? 'other',
        domain: s.url ? extractDomain(s.url) : '',
        label: s.label,
        sources: [],
        entities: [],
        first_seen: s.created_at,
        last_seen: s.created_at,
        saved_link_id: s.id,
        pinned: !!s.pinned,
        hidden_entity_ids: [],
        project_entity_id: null,
        kind: 'receipt',
        receipt_meta: s.receipt_meta ?? null,
        file_url: s.file_url ?? null,
        file_type: s.file_type ?? null,
      })
    }
  }

  // Filter out icon/logo/favicon URLs
  for (const [url] of urlMap) {
    if (isJunkUrl(url)) urlMap.delete(url)
  }

  // Build hidden entity IDs map from saved_links
  const hiddenEntityMap = new Map<string, Set<string>>()
  for (const sl of allSavedLinks) {
    const s = sl as { url: string; hidden_entity_ids?: string[] | null }
    const ids = s.hidden_entity_ids ?? []
    if (ids.length > 0) {
      hiddenEntityMap.set(s.url, new Set(ids))
    }
  }

  // Filter hidden entities from results
  for (const [url, result] of urlMap) {
    const hidden = hiddenEntityMap.get(url)
    if (hidden && result.entities.length > 0) {
      result.entities = result.entities.filter(e => !hidden.has(e.id))
    }
  }

  // Convert to array and apply filters
  let results = Array.from(urlMap.values())

  // Filter by category
  if (categoryFilter && categoryFilter !== 'all') {
    results = results.filter(r => r.category === categoryFilter)
  }

  // Search filter
  if (q) {
    const lower = q.toLowerCase()
    results = results.filter(r =>
      r.url.toLowerCase().includes(lower) ||
      (r.label ?? '').toLowerCase().includes(lower) ||
      r.domain.toLowerCase().includes(lower) ||
      r.sources.some(s => (s.subject ?? '').toLowerCase().includes(lower)) ||
      r.entities.some(e => e.name.toLowerCase().includes(lower))
    )
  }

  // Status filter: 'new' = no saved_links row (not pinned/hidden), 'pinned' = pinned only
  if (statusFilter === 'new') {
    results = results.filter(r => !r.saved_link_id && r.kind === 'link')
  } else if (statusFilter === 'pinned') {
    results = results.filter(r => r.pinned)
  }

  // Sort by most recent first
  results.sort((a, b) => new Date(b.last_seen).getTime() - new Date(a.last_seen).getTime())

  // Add display name for each
  const enriched = results.map(r => ({
    ...r,
    display_name: r.label ?? extractDisplayName(r.url),
  }))

  return NextResponse.json({
    links: enriched,
    total: enriched.length,
  })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { url, label } = body as { url?: string; label?: string }

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  // Validate URL format
  try {
    new URL(url)
  } catch {
    return NextResponse.json({ error: 'Invalid URL' }, { status: 400 })
  }

  const db = getServiceClient()
  const category = categorizeUrl(url)

  const { data, error } = await db
    .from('saved_links')
    .upsert(
      { org_id: ORG_ID, url, label: label || null, category },
      { onConflict: 'org_id,url' }
    )
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ link: data })
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json()
  const { url, label, pinned, receipt_meta, hidden_entity_ids, project_entity_id } = body as { url?: string; label?: string; pinned?: boolean; receipt_meta?: Record<string, unknown>; hidden_entity_ids?: string[]; project_entity_id?: string | null }

  if (!url || typeof url !== 'string') {
    return NextResponse.json({ error: 'URL is required' }, { status: 400 })
  }

  const db = getServiceClient()
  const category = categorizeUrl(url)

  const upsertData: Record<string, unknown> = { org_id: ORG_ID, url, category }
  if (typeof label === 'string') upsertData.label = label || null
  if (typeof pinned === 'boolean') upsertData.pinned = pinned
  if (body.receipt_meta) upsertData.receipt_meta = body.receipt_meta
  if (Array.isArray(hidden_entity_ids)) upsertData.hidden_entity_ids = hidden_entity_ids
  if (project_entity_id !== undefined) upsertData.project_entity_id = project_entity_id

  const { data, error } = await db
    .from('saved_links')
    .upsert(upsertData, { onConflict: 'org_id,url' })
    .select()
    .single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ link: data })
}

export async function DELETE(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = req.nextUrl
  const id = searchParams.get('id')
  const url = searchParams.get('url')

  if (!id && !url) {
    return NextResponse.json({ error: 'id or url is required' }, { status: 400 })
  }

  const db = getServiceClient()

  if (id) {
    // Delete a saved link by ID
    const { error: err } = await db
      .from('saved_links')
      .delete()
      .eq('id', id)
      .eq('org_id', ORG_ID)
    if (err) return NextResponse.json({ error: err.message }, { status: 500 })
  }

  if (url) {
    // Hide an extracted link by saving it as hidden
    await db.from('saved_links').upsert({
      org_id: ORG_ID,
      url,
      label: '(hidden)',
      hidden: true,
    }, { onConflict: 'org_id,url' })
  }

  return NextResponse.json({ ok: true })
}
