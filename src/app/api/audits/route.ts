export const dynamic = 'force-dynamic'

/**
 * GET /api/audits
 *
 * Returns franchisee audit data for the dashboard.
 *
 * Query params:
 *   ?brand_entity_id=<uuid>  — single brand: returns franchisees with fields, scores, and snapshot history
 *   (omit)                   — all brands: returns aggregate scores per brand
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
    const brandEntityId = new URL(req.url).searchParams.get('brand_entity_id')

    if (brandEntityId) {
      return await getBrandDetail(db, brandEntityId)
    }

    return await getAllBrands(db)
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[audits] Failed:', message)
    return NextResponse.json(
      { error: 'Failed to fetch audits', details: message },
      { status: 500 }
    )
  }
}

// ---------- Single brand: franchisees with fields, scores, snapshots ----------

async function getBrandDetail(
  db: ReturnType<typeof getServiceClient>,
  brandEntityId: string
): Promise<NextResponse> {
  // Fetch all audit fields for this brand
  const { data: fields, error: fieldsError } = await db
    .from('franchise_audits')
    .select('*')
    .eq('org_id', ORG_ID)
    .eq('brand_entity_id', brandEntityId)
    .order('franchisee_name')

  if (fieldsError) {
    return NextResponse.json({ error: fieldsError.message }, { status: 500 })
  }

  // Fetch snapshots for this brand (last 30 days by default)
  const { data: snapshots, error: snapError } = await db
    .from('franchise_audit_snapshots')
    .select('*')
    .eq('org_id', ORG_ID)
    .eq('brand_entity_id', brandEntityId)
    .order('snapshot_date', { ascending: false })
    .limit(1000)

  if (snapError) {
    return NextResponse.json({ error: snapError.message }, { status: 500 })
  }

  // Group by franchisee
  const franchiseeMap = new Map<
    string,
    {
      franchisee_name: string
      sheet_tab: string
      fields: Record<string, string>
      score: number | null
      snapshots: Array<{ date: string; score: number | null }>
    }
  >()

  for (const f of fields ?? []) {
    if (!franchiseeMap.has(f.franchisee_name)) {
      franchiseeMap.set(f.franchisee_name, {
        franchisee_name: f.franchisee_name,
        sheet_tab: f.sheet_tab ?? '',
        fields: {},
        score: null,
        snapshots: [],
      })
    }
    franchiseeMap.get(f.franchisee_name)!.fields[f.field_name] = f.field_value
  }

  // Attach snapshots
  for (const s of snapshots ?? []) {
    const entry = franchiseeMap.get(s.franchisee_name)
    if (entry) {
      // Use the most recent snapshot as the current score
      if (entry.score === null && s.score !== null) {
        entry.score = s.score
      }
      entry.snapshots.push({ date: s.snapshot_date, score: s.score })
    }
  }

  return NextResponse.json({
    brand_entity_id: brandEntityId,
    franchisees: Array.from(franchiseeMap.values()),
  })
}

// ---------- All brands: aggregate scores ----------

async function getAllBrands(
  db: ReturnType<typeof getServiceClient>
): Promise<NextResponse> {
  // Fetch the latest snapshot per franchisee per brand
  const { data: snapshots, error: snapError } = await db
    .from('franchise_audit_snapshots')
    .select('brand_entity_id, franchisee_name, score, snapshot_date')
    .eq('org_id', ORG_ID)
    .order('snapshot_date', { ascending: false })

  if (snapError) {
    return NextResponse.json({ error: snapError.message }, { status: 500 })
  }

  // Group by brand — keep only the latest snapshot per franchisee
  const brandMap = new Map<
    string,
    {
      brand_entity_id: string
      franchisee_count: number
      avg_score: number | null
      scores: number[]
      seen: Set<string>
    }
  >()

  for (const s of snapshots ?? []) {
    if (!brandMap.has(s.brand_entity_id)) {
      brandMap.set(s.brand_entity_id, {
        brand_entity_id: s.brand_entity_id,
        franchisee_count: 0,
        avg_score: null,
        scores: [],
        seen: new Set(),
      })
    }

    const entry = brandMap.get(s.brand_entity_id)!
    // Only count the first (most recent) snapshot per franchisee
    if (!entry.seen.has(s.franchisee_name)) {
      entry.seen.add(s.franchisee_name)
      entry.franchisee_count++
      if (s.score !== null) {
        entry.scores.push(s.score)
      }
    }
  }

  // Look up brand entity names
  const brandIds = Array.from(brandMap.keys())
  let brandNames: Record<string, string> = {}

  if (brandIds.length > 0) {
    const { data: entities } = await db
      .from('entities')
      .select('id, name')
      .in('id', brandIds)

    for (const e of entities ?? []) {
      brandNames[e.id] = e.name
    }
  }

  // Build response
  const brands = Array.from(brandMap.values()).map((b) => ({
    brand_entity_id: b.brand_entity_id,
    brand_name: brandNames[b.brand_entity_id] ?? 'Unknown',
    franchisee_count: b.franchisee_count,
    avg_score:
      b.scores.length > 0
        ? Math.round(b.scores.reduce((a, c) => a + c, 0) / b.scores.length)
        : null,
  }))

  return NextResponse.json({ brands })
}
