export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

/** GET /api/wiki/:slug — get a single wiki page with links */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug } = await params
  const db = getServiceClient()

  const { data: page, error } = await db
    .from('wiki_pages')
    .select('*, entities(type, name)')
    .eq('org_id', ORG_ID)
    .eq('slug', slug)
    .single()

  if (error || !page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  }

  // Get outbound links
  const { data: outLinks } = await db
    .from('wiki_links')
    .select('context, wiki_pages!wiki_links_to_page_id_fkey(slug, title)')
    .eq('from_page_id', page.id)

  // Get inbound links
  const { data: inLinks } = await db
    .from('wiki_links')
    .select('wiki_pages!wiki_links_from_page_id_fkey(slug, title)')
    .eq('to_page_id', page.id)

  return NextResponse.json({
    page,
    outbound_links: outLinks ?? [],
    inbound_links: inLinks ?? [],
  })
}

/** PATCH /api/wiki/:slug — update content, pinned sections, lock status, or individual sections */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { slug } = await params
  const db = getServiceClient()

  // Verify page exists and belongs to this org
  const { data: page, error: findErr } = await db
    .from('wiki_pages')
    .select('id, content, pinned_sections')
    .eq('org_id', ORG_ID)
    .eq('slug', slug)
    .single()

  if (findErr || !page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  // Section-level edit: replace a single markdown section by header name
  if (typeof body.section === 'string' && typeof body.content === 'string') {
    const existingContent = (page.content as string) ?? ''
    const updatedContent = replaceSectionContent(existingContent, body.section, body.content)
    updates.content = updatedContent
    updates.last_manual_edit = new Date().toISOString()
  } else if (typeof body.content === 'string') {
    // Full content update
    updates.content = body.content
    updates.last_manual_edit = new Date().toISOString()
  }

  if (Array.isArray(body.pinned_sections)) {
    updates.pinned_sections = body.pinned_sections
  }

  // Lock toggle
  if (typeof body.locked === 'boolean') {
    updates.locked = body.locked
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  const { error: updateErr } = await db
    .from('wiki_pages')
    .update(updates)
    .eq('id', page.id)

  if (updateErr) {
    return NextResponse.json({ error: 'Update failed' }, { status: 500 })
  }

  // Log the manual edit (skip log for lock-only changes)
  const editFields = Object.keys(updates).filter((k) => k !== 'locked')
  if (editFields.length > 0) {
    await db.from('wiki_log').insert({
      org_id: ORG_ID,
      event_type: 'manual_edit',
      page_id: page.id,
      note: `manual edit: ${editFields.join(', ')} updated`,
    })
  }

  return NextResponse.json({ ok: true })
}

/**
 * Replace a single section's content within markdown, matched by ## header name.
 * Sections are delimited by ## headers. The replacement includes everything
 * between the matched header and the next ## header (or end of content).
 */
function replaceSectionContent(fullContent: string, sectionHeader: string, newSectionBody: string): string {
  // Split content into lines and find the target section
  const lines = fullContent.split('\n')
  const headerPattern = `## ${sectionHeader}`

  let sectionStart = -1
  let sectionEnd = lines.length

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === headerPattern || lines[i].trim() === headerPattern.trim()) {
      sectionStart = i
      // Find next ## header after this one
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].match(/^## /)) {
          sectionEnd = j
          break
        }
      }
      break
    }
  }

  if (sectionStart === -1) {
    // Section not found — append it
    return fullContent.trimEnd() + `\n\n## ${sectionHeader}\n\n${newSectionBody}`
  }

  // Replace: keep header line, replace body, keep everything after
  const before = lines.slice(0, sectionStart)
  const after = lines.slice(sectionEnd)
  const replacement = [`## ${sectionHeader}`, '', newSectionBody.trimEnd()]

  return [...before, ...replacement, '', ...after].join('\n')
}
