export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'

/** GET /api/wiki/:slug — get a single wiki page with links */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
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

/** PATCH /api/wiki/:slug — update content and/or pinned sections */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
  const { slug } = await params
  const db = getServiceClient()

  // Verify page exists and belongs to this org
  const { data: page, error: findErr } = await db
    .from('wiki_pages')
    .select('id')
    .eq('org_id', ORG_ID)
    .eq('slug', slug)
    .single()

  if (findErr || !page) {
    return NextResponse.json({ error: 'Page not found' }, { status: 404 })
  }

  const body = await req.json()
  const updates: Record<string, unknown> = {}

  if (typeof body.content === 'string') {
    updates.content = body.content
  }
  if (Array.isArray(body.pinned_sections)) {
    updates.pinned_sections = body.pinned_sections
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

  // Log the manual edit
  await db.from('wiki_log').insert({
    org_id: ORG_ID,
    event_type: 'manual_edit',
    page_id: page.id,
    note: `manual edit: ${Object.keys(updates).join(', ')} updated`,
  })

  return NextResponse.json({ ok: true })
}
