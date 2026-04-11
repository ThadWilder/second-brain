import * as XLSX from 'xlsx'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface KpiMetric {
  month: number        // 1-12
  metric: string
  cy_value: number | null
  py_value: number | null
  growth_pct: number | null
  segment: string | null
}

export interface TabResult {
  tab: string
  brandName: string
  year: number
  metrics: KpiMetric[]
}

// ── Label → metric mapping ─────────────────────────────────────────────────────

/** Sales metrics use CY / PY / GRW% columns */
const SALES_METRICS: Record<string, string> = {
  'leads #': 'leads',
  'estimates #': 'estimates',
  'sold jobs #': 'sold_jobs',
  'sold jobs total $': 'sold_jobs_revenue',
  'total jobs completed #': 'jobs_completed',
}

/** Close ratios use CY / PY / % Pt CHG columns (same structure as sales) */
const CLOSE_RATIO_METRICS: Record<string, string> = {
  'lead to est %': 'lead_to_est_pct',
  'est to sold job %': 'est_to_sold_pct',
  'lead to sold job %': 'lead_to_sold_pct',
}

/** Job ticket & job count (same CY/PY/GRW% structure) */
const JOB_METRICS: Record<string, string> = {
  'avg job ticket': 'avg_job_ticket',
  'avg daily job count #': 'avg_daily_job_count',
}

/** All CY/PY/GRW% style metrics combined */
const CY_PY_METRICS: Record<string, string> = {
  ...SALES_METRICS,
  ...CLOSE_RATIO_METRICS,
  ...JOB_METRICS,
}

/** Performance summary metrics use <2yrs / Existing / Total segment columns.
 *  The CY row label starts with "CY ", the PY row is directly below. */
const PERFORMANCE_METRICS: Record<string, string> = {
  'cy # active owners': 'active_owners',
  'cy # open territories': 'open_territories',
  'cy sws ($)': 'sws_revenue',
  'cy avg daily volume ($)': 'avg_daily_volume',
  'cy avg owner vol (aov)': 'avg_owner_volume',
  'cy avg terr vol (auv)': 'avg_territory_volume',
}

// ── Value parsing ──────────────────────────────────────────────────────────────

function parseNumeric(raw: unknown): number | null {
  if (raw == null) return null
  const s = String(raw).trim()
  if (s === '' || s === '#DIV/0!' || s === '#N/A' || s === '#VALUE!' || s === '-') return null

  // Check for parenthesised negatives: $(1,234) or (1,234)
  const isNeg = s.startsWith('(') || s.startsWith('$(')
  const cleaned = s.replace(/[$,()%]/g, '')
  if (cleaned === '' || cleaned === '#DIV/0!') return null

  const n = Number(cleaned)
  if (isNaN(n)) return null

  // If the original contained '%', treat as percentage → decimal
  const isPercent = typeof raw === 'string' && s.includes('%')
  const value = isPercent ? n / 100 : n
  return isNeg ? -value : value
}

/** xlsx may already return numbers for formatted cells; normalise either way. */
function cellValue(sheet: XLSX.WorkSheet, row: number, col: number): unknown {
  const addr = XLSX.utils.encode_cell({ r: row, c: col })
  const cell = sheet[addr]
  if (!cell) return null
  // Prefer the raw value (v), fall back to formatted (w)
  return cell.v ?? cell.w ?? null
}

// ── Month column offsets ───────────────────────────────────────────────────────

/** Each month occupies 3 columns starting at column B (index 1).
 *  JAN = col 1, FEB = col 4, MAR = col 7, … DEC = col 34. */
function monthStartCol(monthIndex: number): number {
  return 1 + monthIndex * 3 // monthIndex 0 = Jan
}

// ── Header detection ───────────────────────────────────────────────────────────

/** Extract the year from the "Sales Summary" line —
 *  typically the cell to the right of "Sales Summary" contains the year. */
function findYear(sheet: XLSX.WorkSheet, maxRow: number): number {
  for (let r = 0; r < Math.min(maxRow, 20); r++) {
    for (let c = 0; c < 10; c++) {
      const v = cellValue(sheet, r, c)
      if (v != null && String(v).trim().toLowerCase().includes('sales summary')) {
        // Check the next few cells to the right for a year
        for (let cc = c + 1; cc < c + 5; cc++) {
          const yr = cellValue(sheet, r, cc)
          if (yr != null) {
            const n = Number(String(yr).trim())
            if (n >= 2020 && n <= 2100) return n
          }
        }
        // Also check same cell if it contains "Sales Summary 2026"
        const match = String(v).match(/(\d{4})/)
        if (match) {
          const n = Number(match[1])
          if (n >= 2020 && n <= 2100) return n
        }
      }
    }
  }
  return new Date().getFullYear()
}

// ── Sheet parsing ──────────────────────────────────────────────────────────────

function normaliseLabel(raw: unknown): string {
  if (raw == null) return ''
  return String(raw).trim().toLowerCase()
    .replace(/\s+/g, ' ')
}

function parseSheet(sheet: XLSX.WorkSheet, tabName: string): TabResult {
  const range = XLSX.utils.decode_range(sheet['!ref'] ?? 'A1:A1')
  const maxRow = range.e.r + 1

  const year = findYear(sheet, maxRow)
  const metrics: KpiMetric[] = []

  // Scan every row in column A for known metric labels
  for (let r = 0; r < maxRow; r++) {
    const label = normaliseLabel(cellValue(sheet, r, 0))
    if (!label) continue

    // ── CY / PY / GRW% pattern ──────────────────────────────────────────
    if (CY_PY_METRICS[label]) {
      const metricName = CY_PY_METRICS[label]
      for (let m = 0; m < 12; m++) {
        const base = monthStartCol(m)
        const cy = parseNumeric(cellValue(sheet, r, base))
        const py = parseNumeric(cellValue(sheet, r, base + 1))
        const grw = parseNumeric(cellValue(sheet, r, base + 2))
        if (cy !== null || py !== null || grw !== null) {
          metrics.push({
            month: m + 1,
            metric: metricName,
            cy_value: cy,
            py_value: py,
            growth_pct: grw,
            segment: null,
          })
        }
      }
      continue
    }

    // ── Performance summary (segment) pattern ────────────────────────────
    if (PERFORMANCE_METRICS[label]) {
      const metricName = PERFORMANCE_METRICS[label]
      // CY row = r, PY row = r + 1
      const pyRow = r + 1
      for (let m = 0; m < 12; m++) {
        const base = monthStartCol(m)
        // 3 segment columns: <2yrs (new), Existing, Total
        const segments: Array<{ offset: number; segment: string }> = [
          { offset: 0, segment: 'new' },
          { offset: 1, segment: 'existing' },
          { offset: 2, segment: 'total' },
        ]
        for (const { offset, segment } of segments) {
          const cy = parseNumeric(cellValue(sheet, r, base + offset))
          const py = parseNumeric(cellValue(sheet, pyRow, base + offset))
          if (cy !== null || py !== null) {
            metrics.push({
              month: m + 1,
              metric: metricName,
              cy_value: cy,
              py_value: py,
              growth_pct: null,
              segment,
            })
          }
        }
      }
      continue
    }
  }

  return { tab: tabName, brandName: tabName, year, metrics }
}

// ── Public API ─────────────────────────────────────────────────────────────────

export function parseKpiWorkbook(buffer: Buffer): TabResult[] {
  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const results: TabResult[] = []

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName]
    if (!sheet) continue
    const result = parseSheet(sheet, sheetName)
    if (result.metrics.length > 0) {
      results.push(result)
    }
  }

  return results
}
