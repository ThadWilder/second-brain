export const dynamic = 'force-dynamic'

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

/** GET /api/wiki — list all wiki pages */
export async function GET(): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const db = getServiceClient()

  const { data, error } = await db
    .from('wiki_pages')
    .select('id, slug, title, summary, source_count, updated_at, entity_id, entities(type, name)')
    .eq('org_id', ORG_ID)
    .order('updated_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pages: data ?? [] })
}
