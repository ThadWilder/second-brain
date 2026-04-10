export const dynamic = 'force-dynamic'

import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function GET(): Promise<NextResponse> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  const orgId = process.env.ORG_ID ?? '00000000-0000-0000-0000-000000000001'

  if (!url || !key) {
    return NextResponse.json({ error: 'Missing env vars', url: url?.slice(0, 30), hasKey: !!key })
  }

  // Fresh client — no caching possible
  const db = createClient(url, key, { auth: { persistSession: false } })

  const { data: entities, error: entErr } = await db
    .from('entities')
    .select('name, type')
    .eq('org_id', orgId)
    .eq('type', 'brand')
    .order('name')

  const { count: taskCount } = await db
    .from('tasks')
    .select('id', { count: 'exact' })
    .eq('org_id', orgId)

  const { count: prCount } = await db
    .from('pending_responses')
    .select('id', { count: 'exact' })
    .eq('org_id', orgId)
    .eq('responded', false)

  return NextResponse.json({
    supabase_url: url.slice(0, 40),
    org_id: orgId,
    brands: entities?.map((e) => e.name) ?? [],
    brand_count: entities?.length ?? 0,
    task_count: taskCount ?? 0,
    pending_response_count: prCount ?? 0,
    entity_error: entErr?.message ?? null,
    timestamp: new Date().toISOString(),
  }, {
    headers: { 'Cache-Control': 'no-store' },
  })
}
