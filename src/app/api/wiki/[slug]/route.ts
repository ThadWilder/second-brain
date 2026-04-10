export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'

/** GET /api/wiki/:slug — get a single wiki page with links */
export async function GET(
  _req: NextRequest,
  { params }: { params: { slug: string } }
): Promise<NextResponse> {
  const db = getServiceClient()

  const { data: page, error } = await db
    .from('wiki_pages')
    .select('*, entities(type, name)')
    .eq('org_id', ORG_ID)
    .eq('slug', params.slug)
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
