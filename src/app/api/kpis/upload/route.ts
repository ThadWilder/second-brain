export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/kpis/upload
 *
 * Accepts a multipart form upload of a KPI tracker workbook (.xlsx),
 * parses every tab, maps tab names → entity IDs via kpi_tab_name,
 * and upserts the resulting metrics into the brand_kpis table.
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'
import { parseKpiWorkbook } from '@/lib/kpi-parser'

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const authenticated = await hasValidSession()
    if (!authenticated) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    if (!file.name.endsWith('.xlsx')) {
      return NextResponse.json({ error: 'File must be an .xlsx workbook' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const tabResults = parseKpiWorkbook(buffer)

    if (tabResults.length === 0) {
      return NextResponse.json({ error: 'No KPI data found in workbook' }, { status: 400 })
    }

    // Look up entities that have kpi_tab_name set
    const db = getServiceClient()
    const { data: entities, error: entitiesError } = await db
      .from('entities')
      .select('id, name, kpi_tab_name')
      .eq('org_id', ORG_ID)
      .not('kpi_tab_name', 'is', null)

    if (entitiesError) {
      return NextResponse.json({ error: entitiesError.message }, { status: 500 })
    }

    // Build a map: tab_name (lowercase) → entity_id
    const tabToEntity = new Map<string, string>()
    for (const e of entities ?? []) {
      if (e.kpi_tab_name) {
        tabToEntity.set(e.kpi_tab_name.toLowerCase(), e.id)
      }
    }

    const unmappedTabs: string[] = []
    let brandsProcessed = 0
    let metricsInserted = 0

    for (const tabResult of tabResults) {
      const entityId = tabToEntity.get(tabResult.tab.toLowerCase())
      if (!entityId) {
        unmappedTabs.push(tabResult.tab)
        continue
      }

      brandsProcessed++

      // Build rows for upsert
      const rows = tabResult.metrics.map((m) => ({
        org_id: ORG_ID,
        entity_id: entityId,
        year: tabResult.year,
        month: m.month,
        metric: m.metric,
        cy_value: m.cy_value,
        py_value: m.py_value,
        growth_pct: m.growth_pct,
        segment: m.segment ?? '',
        updated_at: new Date().toISOString(),
      }))

      // Upsert in batches to avoid hitting request size limits
      const BATCH_SIZE = 200
      for (let i = 0; i < rows.length; i += BATCH_SIZE) {
        const batch = rows.slice(i, i + BATCH_SIZE)
        const { error: upsertError } = await db
          .from('brand_kpis')
          .upsert(batch, {
            onConflict: 'org_id,entity_id,year,month,metric,segment',
          })

        if (upsertError) {
          return NextResponse.json({
            error: `Upsert failed for ${tabResult.tab}: ${upsertError.message}`,
            brands_processed: brandsProcessed,
            metrics_inserted: metricsInserted,
          }, { status: 500 })
        }

        metricsInserted += batch.length
      }
    }

    return NextResponse.json({
      brands_processed: brandsProcessed,
      metrics_inserted: metricsInserted,
      unmapped_tabs: unmappedTabs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
