export const dynamic = 'force-dynamic'
export const maxDuration = 120

/**
 * POST /api/audits/sync
 *
 * Reads the TMS Audit Tracking Google Sheet, parses all brand tabs,
 * and syncs franchisee audit data into Supabase.
 *
 * Auth: valid session OR cron secret (Bearer CRON_SECRET).
 */

import { NextRequest, NextResponse } from 'next/server'
import { getServiceClient, ORG_ID } from '@/lib/supabase'
import { hasValidSession } from '@/lib/auth'

const SPREADSHEET_ID = '1Lyq9VyktQqdvbBqSHVRFvQTSuby5H1mzwG7LfxuB7uU'

// Tab name → kpi_tab_name used to look up the brand entity
const TAB_TO_KPI: Record<string, string> = {
  'MP CORE': 'MP',
  'MP LITE': 'MP',
  'PHP': 'PHP',
  'MIK': 'MIK',
  'GGF': 'GGF',
  'PM': 'PM',
  'Mirm': 'MIRM',
  'MMX': 'MM',
  'USAI': 'USA',
  'SG': 'SG',
}

const SKIP_TABS = new Set(['SEO Mtgs', 'GBPs'])

// ---------- CSV helpers ----------

function buildCsvUrl(sheetName: string): string {
  return `https://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`
}

/**
 * Minimal CSV parser that handles quoted fields with commas and newlines.
 */
function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let current = ''
  let inQuotes = false
  let row: string[] = []

  for (let i = 0; i < text.length; i++) {
    const ch = text[i]

    if (inQuotes) {
      if (ch === '"') {
        // Peek ahead — doubled quote is an escape
        if (i + 1 < text.length && text[i + 1] === '"') {
          current += '"'
          i++ // skip next quote
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
        // skip carriage returns
      } else {
        current += ch
      }
    }
  }

  // Push trailing field / row
  if (current.length > 0 || row.length > 0) {
    row.push(current)
    rows.push(row)
  }

  return rows
}

/**
 * Returns true when the value looks like a boolean audit field.
 * We check the value itself — TRUE/FALSE/Yes/No (case-insensitive).
 */
function isBooleanValue(val: string): boolean {
  const v = val.trim().toUpperCase()
  return v === 'TRUE' || v === 'FALSE' || v === 'YES' || v === 'NO'
}

function isTrueValue(val: string): boolean {
  const v = val.trim().toUpperCase()
  return v === 'TRUE' || v === 'YES'
}

// ---------- Main handler ----------

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

    // Look up brand entities by kpi_tab_name
    const { data: entities, error: entitiesError } = await db
      .from('entities')
      .select('id, name, kpi_tab_name')
      .eq('org_id', ORG_ID)
      .not('kpi_tab_name', 'is', null)

    if (entitiesError) {
      return NextResponse.json({ error: entitiesError.message }, { status: 500 })
    }

    // Map kpi_tab_name (lowercase) → entity id
    const kpiToEntity = new Map<string, string>()
    for (const e of entities ?? []) {
      if (e.kpi_tab_name) {
        kpiToEntity.set(e.kpi_tab_name.toLowerCase(), e.id)
      }
    }

    const tabNames = Object.keys(TAB_TO_KPI)
    let tabsSynced = 0
    let franchiseesSynced = 0
    let totalFields = 0
    const errors: string[] = []
    const today = new Date().toISOString().slice(0, 10) // YYYY-MM-DD

    for (const tabName of tabNames) {
      if (SKIP_TABS.has(tabName)) continue

      const kpiKey = TAB_TO_KPI[tabName].toLowerCase()
      const brandEntityId = kpiToEntity.get(kpiKey)
      if (!brandEntityId) {
        errors.push(`No entity found for kpi_tab_name="${TAB_TO_KPI[tabName]}" (tab: ${tabName})`)
        continue
      }

      // Fetch CSV for this tab
      let csvText: string
      try {
        const res = await fetch(buildCsvUrl(tabName), { cache: 'no-store' })
        if (!res.ok) {
          errors.push(`Failed to fetch tab "${tabName}": ${res.status} ${res.statusText}`)
          continue
        }
        csvText = await res.text()
      } catch (fetchErr) {
        const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr)
        errors.push(`Fetch error for tab "${tabName}": ${msg}`)
        continue
      }

      const rows = parseCsv(csvText)
      if (rows.length < 2) {
        // Need at least header + one data row
        continue
      }

      const headers = rows[0].map((h) => h.trim())
      const franchiseeCol = headers.findIndex(
        (h) => h.toLowerCase() === 'franchisee'
      )
      if (franchiseeCol === -1) {
        errors.push(`Tab "${tabName}": no "Franchisee" column found`)
        continue
      }

      // Process each data row
      for (let r = 1; r < rows.length; r++) {
        const row = rows[r]
        const franchiseeName = (row[franchiseeCol] ?? '').trim()
        if (!franchiseeName) continue

        // Collect all field name/value pairs and identify boolean fields
        const auditRows: Array<{
          org_id: string
          brand_entity_id: string
          franchisee_name: string
          field_name: string
          field_value: string
          sheet_tab: string
          synced_at: string
        }> = []
        let booleanTotal = 0
        let booleanTrue = 0

        for (let c = 0; c < headers.length; c++) {
          const fieldName = headers[c]
          if (!fieldName) continue

          const rawValue = (row[c] ?? '').trim()

          auditRows.push({
            org_id: ORG_ID,
            brand_entity_id: brandEntityId,
            franchisee_name: franchiseeName,
            field_name: fieldName,
            field_value: rawValue,
            sheet_tab: tabName,
            synced_at: new Date().toISOString(),
          })

          // Score calculation: only count boolean audit fields
          if (isBooleanValue(rawValue)) {
            booleanTotal++
            if (isTrueValue(rawValue)) {
              booleanTrue++
            }
          }
        }

        // Upsert audit fields in batches
        const BATCH_SIZE = 200
        for (let i = 0; i < auditRows.length; i += BATCH_SIZE) {
          const batch = auditRows.slice(i, i + BATCH_SIZE)
          const { error: upsertError } = await db
            .from('franchise_audits')
            .upsert(batch, {
              onConflict: 'org_id,brand_entity_id,franchisee_name,field_name',
            })

          if (upsertError) {
            errors.push(
              `Upsert error for "${franchiseeName}" in "${tabName}": ${upsertError.message}`
            )
          }
        }

        totalFields += auditRows.length

        // Calculate and upsert score snapshot
        const score =
          booleanTotal > 0
            ? Math.round((booleanTrue / booleanTotal) * 100)
            : null

        const { error: snapError } = await db
          .from('franchise_audit_snapshots')
          .upsert(
            {
              org_id: ORG_ID,
              brand_entity_id: brandEntityId,
              franchisee_name: franchiseeName,
              snapshot_date: today,
              score,
              boolean_total: booleanTotal,
              boolean_true: booleanTrue,
              sheet_tab: tabName,
              synced_at: new Date().toISOString(),
            },
            {
              onConflict: 'org_id,brand_entity_id,franchisee_name,snapshot_date',
            }
          )

        if (snapError) {
          errors.push(
            `Snapshot error for "${franchiseeName}" in "${tabName}": ${snapError.message}`
          )
        }

        franchiseesSynced++
      }

      tabsSynced++
    }

    return NextResponse.json({
      tabs_synced: tabsSynced,
      franchisees_synced: franchiseesSynced,
      total_fields: totalFields,
      ...(errors.length > 0 ? { errors } : {}),
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err)
    console.error('[audits/sync] Failed:', message)
    return NextResponse.json(
      { error: 'Sync failed', details: message },
      { status: 500 }
    )
  }
}
