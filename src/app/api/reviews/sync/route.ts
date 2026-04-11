export const dynamic = 'force-dynamic'
export const maxDuration = 60

/**
 * POST /api/reviews/sync
 *
 * Reads the NiceJob review tracking Google Sheet, detects anomalies,
 * and syncs company review data into Supabase.
 *
 * Auth: valid session OR cron secret (Bearer CRON_SECRET).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

const SPREADSHEET_ID = '1vNBHaw_xVvnLxlTxUmjPt-e85krWxah0g5g02Xc1Fvs'
const SHEET_NAME = 'Company Activity All Time (March 2026)'

// Brand names in the sheet → entity names in the DB
const BRAND_NAME_MAP: Record<string, string> = {
  'granite garage floors': 'GGF',
  'maidpro': 'MaidPro',
  'miracle method': 'Miracle Method',
  'sir grout': 'Sir Grout',
  'men in kilts': 'Men In Kilts',
  'pestmaster': 'Pestmaster',
  'usa insulation': 'USAI',
  'mold medics': 'Mold Medics',
}

function buildCsvUrl(): string {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(SHEET_NAME)}`
}

function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let current = ''
  let inQuotes = false
  let row: string[] = []

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < text.length && text[i + 1] === '"') {
          current += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        row.push(current)
        current = ''
      } else if (ch === '\n') {
        row.push(current)
        current = ''
        rows.push(row)
        row = []
      } else if (ch === '\r') {
        // skip
      } else {
        current += ch
      }
    }
  }

  if (current.length > 0 || row.length > 0) {
    row.push(current)
    rows.push(row)
  }

  return rows
}

function parseBool(val: string): boolean {
  const v = val.trim().toLowerCase()
  return v === 'yes' || v === 'y' || v === 'true'
}

function parseIntSafe(val: string): number | null {
  const trimmed = val.trim()
  if (!trimmed || trimmed.toLowerCase() === 'n/a' || trimmed === '-') return null
  const n = parseInt(trimmed, 10)
  return isNaN(n) ? null : n
}

function parseDateSafe(val: string): string | null {
  const trimmed = val.trim()
  if (!trimmed || trimmed.toLowerCase() === 'n/a' || trimmed === '-') return null
  const d = new Date(trimmed)
  if (isNaN(d.getTime())) return null
  return d.toISOString().slice(0, 10)
}

function detectAnomalies(row: {
  active_in_nicejob: boolean
  api_status: string | null
  enrollments_monthly: number | null
  enrollments_all_time: number | null
  campaign_objective: string | null
}): string[] {
  const reasons: string[] = []

  // api_needs_attention
  if (row.api_status) {
    const status = row.api_status.trim().toLowerCase()
    if (status === 'verify if ok' || status === 'api needs to be turned on') {
      reasons.push('api_needs_attention')
    }
  }

  // active_zero_monthly
  if (row.active_in_nicejob && (row.enrollments_monthly === 0 || row.enrollments_monthly === null)) {
    reasons.push('active_zero_monthly')
  }

  // active_zero_alltime
  if (row.active_in_nicejob && (row.enrollments_all_time === 0 || row.enrollments_all_time === null)) {
    reasons.push('active_zero_alltime')
  }

  // low_monthly_enrollments
  if (row.active_in_nicejob && row.enrollments_monthly !== null && row.enrollments_monthly > 0 && row.enrollments_monthly < 3) {
    reasons.push('low_monthly_enrollments')
  }

  // not_active
  if (!row.active_in_nicejob) {
    const obj = (row.campaign_objective ?? '').trim().toLowerCase()
    if (obj && obj !== 'n/a') {
      reasons.push('not_active')
    }
  }

  return reasons
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  // Auth: session OR cron secret
  const auth = req.headers.get('authorization')
  const cronOk = auth === `Bearer ${process.env.CRON_SECRET}`
  if (!cronOk) {
    const sessionOk = await hasValidSession()
    if (!sessionOk) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const db = getServiceClient()

    // Load brand entities for name matching
    const { data: entities, error: entitiesError } = await db
      .from('entities')
      .select('id, name')
      .eq('org_id', ORG_ID)

    if (entitiesError) {
      return NextResponse.json({ error: entitiesError.message }, { status: 500 })
    }

    // Build entity lookup: lowercase name → entity id
    const entityByName = new Map<string, string>()
    for (const e of entities ?? []) {
      entityByName.set(e.name.toLowerCase(), e.id)
    }

    // Fetch CSV
    const res = await fetch(buildCsvUrl(), { cache: 'no-store' })
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to fetch sheet: ${res.status} ${res.statusText}` },
        { status: 502 }
      )
    }

    const csvText = await res.text()
    const rows = parseCsv(csvText)

    if (rows.length < 2) {
      return NextResponse.json({ error: 'Sheet has no data rows' }, { status: 400 })
    }

    // Parse header row — find column indices
    const headers = rows[0].map((h) => h.trim().toLowerCase())

    const colIdx = {
      companyId: headers.findIndex((h) => h.includes('company id')),
      companyName: headers.findIndex((h) => h.includes('company name')),
      brandName: headers.findIndex((h) => h.includes('brand name')),
      campaignObjective: headers.findIndex((h) => h.includes('campaign objective')),
      active: headers.findIndex((h) => h.includes('company active in nicejob')),
      apiStatus: headers.findIndex((h) => h.includes('check api')),
      enrollmentsAllTime: headers.findIndex((h) => h.includes('enrollments (all time)') || h.includes('enrollments all time')),
      enrollmentsMonthly: headers.findIndex((h) => h.includes('enrollments (monthly)') || h.includes('enrollments monthly')),
      campaignReady: headers.findIndex((h) => h.includes('campaign ready since')),
      crmConfirmed: headers.findIndex((h) => h.includes('crm id confirmed')),
      toggledFms: headers.findIndex((h) => h.includes('toggled on in fms')),
    }

    if (colIdx.companyName === -1) {
      return NextResponse.json({ error: 'Could not find Company Name column' }, { status: 400 })
    }

    let companiesSynced = 0
    let anomaliesFound = 0
    const byBrand: Record<string, number> = {}
    const errors: string[] = []

    const BATCH_SIZE = 100
    const upsertBatch: Array<Record<string, unknown>> = []

    for (let r = 1; r < rows.length; r++) {
      const row = rows[r]
      const companyName = (row[colIdx.companyName] ?? '').trim()
      if (!companyName) continue

      const brandName = colIdx.brandName !== -1 ? (row[colIdx.brandName] ?? '').trim() : ''
      const companyId = colIdx.companyId !== -1 ? (row[colIdx.companyId] ?? '').trim() : null
      const campaignObjective = colIdx.campaignObjective !== -1 ? (row[colIdx.campaignObjective] ?? '').trim() : null
      const activeRaw = colIdx.active !== -1 ? (row[colIdx.active] ?? '').trim() : ''
      const apiStatusRaw = colIdx.apiStatus !== -1 ? (row[colIdx.apiStatus] ?? '').trim() : null
      const enrollmentsAllTime = colIdx.enrollmentsAllTime !== -1 ? parseIntSafe(row[colIdx.enrollmentsAllTime] ?? '') : null
      const enrollmentsMonthly = colIdx.enrollmentsMonthly !== -1 ? parseIntSafe(row[colIdx.enrollmentsMonthly] ?? '') : null
      const campaignReady = colIdx.campaignReady !== -1 ? parseDateSafe(row[colIdx.campaignReady] ?? '') : null
      const crmConfirmed = colIdx.crmConfirmed !== -1 ? parseBool(row[colIdx.crmConfirmed] ?? '') : false
      const toggledFms = colIdx.toggledFms !== -1 ? parseBool(row[colIdx.toggledFms] ?? '') : false

      const activeInNicejob = parseBool(activeRaw)

      // Match brand name to entity
      const mappedEntityName = BRAND_NAME_MAP[brandName.toLowerCase()]
      let brandEntityId: string | null = null
      if (mappedEntityName) {
        brandEntityId = entityByName.get(mappedEntityName.toLowerCase()) ?? null
      }
      // Fallback: try ILIKE-style match directly
      if (!brandEntityId && brandName) {
        brandEntityId = entityByName.get(brandName.toLowerCase()) ?? null
      }

      // Detect anomalies
      const anomalyReasons = detectAnomalies({
        active_in_nicejob: activeInNicejob,
        api_status: apiStatusRaw,
        enrollments_monthly: enrollmentsMonthly,
        enrollments_all_time: enrollmentsAllTime,
        campaign_objective: campaignObjective,
      })

      const hasAnomaly = anomalyReasons.length > 0
      if (hasAnomaly) anomaliesFound++

      byBrand[brandName || 'Unknown'] = (byBrand[brandName || 'Unknown'] || 0) + 1

      upsertBatch.push({
        org_id: ORG_ID,
        brand_entity_id: brandEntityId,
        company_id: companyId || null,
        company_name: companyName,
        brand_name: brandName || 'Unknown',
        campaign_objective: campaignObjective || null,
        active_in_nicejob: activeInNicejob,
        api_status: apiStatusRaw || null,
        enrollments_all_time: enrollmentsAllTime,
        enrollments_monthly: enrollmentsMonthly,
        campaign_ready_since: campaignReady,
        crm_id_confirmed: crmConfirmed,
        toggled_on_fms: toggledFms,
        has_anomaly: hasAnomaly,
        anomaly_reasons: anomalyReasons,
        synced_at: new Date().toISOString(),
      })

      // Flush batch
      if (upsertBatch.length >= BATCH_SIZE) {
        const { error: upsertError } = await db
          .from('nicejob_reviews')
          .upsert(upsertBatch, { onConflict: 'org_id,company_name' })

        if (upsertError) {
          errors.push(`Batch upsert error: ${upsertError.message}`)
        } else {
          companiesSynced += upsertBatch.length
        }
        upsertBatch.length = 0
      }
    }

    // Flush remaining
    if (upsertBatch.length > 0) {
      const { error: upsertError } = await db
        .from('nicejob_reviews')
        .upsert(upsertBatch, { onConflict: 'org_id,company_name' })

      if (upsertError) {
        errors.push(`Final batch upsert error: ${upsertError.message}`)
      } else {
        companiesSynced += upsertBatch.length
      }
    }

    return NextResponse.json({
      companies_synced: companiesSynced,
      anomalies_found: anomaliesFound,
      by_brand: Object.entries(byBrand).map(([brand, count]) => ({ brand, count })),
      ...(errors.length > 0 ? { errors } : {}),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[reviews/sync] Failed:', message)
    return NextResponse.json(
      { error: 'Sync failed', details: message },
      { status: 500 }
    )
  }
}
