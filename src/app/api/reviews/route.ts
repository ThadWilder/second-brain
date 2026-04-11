export const dynamic = 'force-dynamic'

/**
 * GET /api/reviews
 *
 * Returns NiceJob review data for the dashboard.
 *
 * Query params:
 *   ?anomalies_only=true  — filter to companies with anomalies only
 *   ?brand=<name>         — filter by brand name
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const authenticated = await hasValidSession()
  if (!authenticated) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const db = getServiceClient()
    const url = new URL(req.url)
    const anomaliesOnly = url.searchParams.get('anomalies_only') === 'true'
    const brandFilter = url.searchParams.get('brand')

    let query = db
      .from('nicejob_reviews')
      .select('*, entities:brand_entity_id(id, name)')
      .eq('org_id', ORG_ID)

    if (anomaliesOnly) {
      query = query.eq('has_anomaly', true)
    }

    if (brandFilter) {
      query = query.ilike('brand_name', brandFilter)
    }

    // Order: anomalies first, then by brand and company name
    query = query
      .order('has_anomaly', { ascending: false })
      .order('brand_name')
      .order('company_name')

    const { data, error } = await query

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ companies: data ?? [] })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[reviews] Failed:', message)
    return NextResponse.json(
      { error: 'Failed to fetch reviews', details: message },
      { status: 500 }
    )
  }
}
