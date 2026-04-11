export const dynamic = 'force-dynamic'
export const fetchCache = 'force-no-store'

/**
 * GET /api/kpis
 *
 * Query brand KPI data.
 *   ?entity_id=<uuid>  — detailed metrics for one brand
 *   ?year=<int>        — filter by year (defaults to current year)
 *   ?month=<int>       — filter by specific month (1-12)
 *
 * If no entity_id is provided, returns a summary for all brands.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const entityId = searchParams.get('entity_id')
  const year = searchParams.get('year')
    ? parseInt(searchParams.get('year')!, 10)
    : new Date().getFullYear()
  const month = searchParams.get('month')
    ? parseInt(searchParams.get('month')!, 10)
    : null

  const db = getServiceClient()

  if (entityId) {
    // ── Single brand detail ──────────────────────────────────────────────
    let query = db
      .from('brand_kpis')
      .select('*')
      .eq('org_id', ORG_ID)
      .eq('entity_id', entityId)
      .eq('year', year)
      .order('month')
      .order('metric')

    if (month) {
      query = query.eq('month', month)
    }

    const { data: metrics, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Fetch entity name
    const { data: entity } = await db
      .from('entities')
      .select('id, name')
      .eq('id', entityId)
      .single()

    return NextResponse.json({
      entity: entity ?? { id: entityId, name: 'Unknown' },
      year,
      month,
      metrics: metrics ?? [],
    })
  }

  // ── Summary for all brands ───────────────────────────────────────────
  let query = db
    .from('brand_kpis')
    .select('entity_id, year, month, metric, cy_value, py_value, growth_pct, segment')
    .eq('org_id', ORG_ID)
    .eq('year', year)
    .order('entity_id')
    .order('month')

  if (month) {
    query = query.eq('month', month)
  }

  const { data: allMetrics, error } = await query

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fetch entity names for all brands that have KPI data
  const entityIds = [...new Set((allMetrics ?? []).map((m) => m.entity_id))]
  const { data: entities } = await db
    .from('entities')
    .select('id, name')
    .in('id', entityIds)

  const entityMap = new Map((entities ?? []).map((e) => [e.id, e.name]))

  // Group by entity
  const byEntity: Record<string, {
    entity_id: string
    entity_name: string
    metrics: typeof allMetrics
  }> = {}

  for (const m of allMetrics ?? []) {
    if (!byEntity[m.entity_id]) {
      byEntity[m.entity_id] = {
        entity_id: m.entity_id,
        entity_name: entityMap.get(m.entity_id) ?? 'Unknown',
        metrics: [],
      }
    }
    byEntity[m.entity_id].metrics!.push(m)
  }

  return NextResponse.json({
    year,
    month,
    brands: Object.values(byEntity),
  })
}
