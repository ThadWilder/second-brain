'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { BarChart3, Upload, ChevronDown, ArrowUp, ArrowDown, Minus, ClipboardCheck } from 'lucide-react'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/browser'

interface KpiMetric {
  month: number
  metric: string
  cy_value: number | null
  py_value: number | null
  growth_pct: number | null
  segment: string
}

interface BrandKpi {
  entity_id: string
  entity_name: string
  metrics: KpiMetric[]
}

interface KpiResponse {
  brands: BrandKpi[]
  year: number
  latest_month: number | null
}

const CURRENT_YEAR = new Date().getFullYear()

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—'
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
  return value.toLocaleString()
}

function formatPct(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value.toFixed(1)}%`
}

const MONTH_NAMES = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function GrowthArrow({ value }: { value: number | null | undefined }) {
  if (value == null) return <Minus size={14} className="text-[var(--muted)]" />
  if (value > 0) return (
    <span className="flex items-center gap-0.5 text-[#437A22]">
      <ArrowUp size={14} />
      <span className="text-xs font-medium">{value.toFixed(1)}%</span>
    </span>
  )
  if (value < 0) return (
    <span className="flex items-center gap-0.5 text-[#A12C7B]">
      <ArrowDown size={14} />
      <span className="text-xs font-medium">{Math.abs(value).toFixed(1)}%</span>
    </span>
  )
  return <Minus size={14} className="text-[var(--muted)]" />
}

function getLatestMonth(metrics: KpiMetric[]): number {
  if (!metrics.length) return 0
  const withCy = metrics.filter(m => m.cy_value != null && m.cy_value !== 0)
  if (!withCy.length) return 0
  return Math.max(...withCy.map(m => m.month))
}

function getMetricValue(metrics: KpiMetric[], month: number, metricName: string, segment = 'total'): { cy: number | null; py: number | null; growth: number | null } {
  const match = metrics.find(m => m.month === month && m.metric === metricName && m.segment === segment)
  if (!match) return { cy: null, py: null, growth: null }
  return { cy: match.cy_value, py: match.py_value, growth: match.growth_pct }
}

function sumMetric(brands: BrandKpi[], month: number, metricName: string, segment = 'total'): { cy: number; py: number; growth: number | null } {
  let cyTotal = 0
  let pyTotal = 0
  let hasData = false
  for (const brand of brands) {
    const { cy, py } = getMetricValue(brand.metrics, month, metricName, segment)
    if (cy != null) { cyTotal += cy; hasData = true }
    if (py != null) pyTotal += py
  }
  if (!hasData) return { cy: 0, py: 0, growth: null }
  const growth = pyTotal > 0 ? ((cyTotal - pyTotal) / pyTotal) * 100 : null
  return { cy: cyTotal, py: pyTotal, growth }
}

function avgMetric(brands: BrandKpi[], month: number, metricName: string, segment = 'total'): { cy: number | null; growth: number | null } {
  let total = 0
  let count = 0
  let growthTotal = 0
  let growthCount = 0
  for (const brand of brands) {
    const { cy, growth } = getMetricValue(brand.metrics, month, metricName, segment)
    if (cy != null) { total += cy; count++ }
    if (growth != null) { growthTotal += growth; growthCount++ }
  }
  if (count === 0) return { cy: null, growth: null }
  return { cy: total / count, growth: growthCount > 0 ? growthTotal / growthCount : null }
}

export default function KpisPage() {
  const [data, setData] = useState<KpiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(CURRENT_YEAR)
  const [yearOpen, setYearOpen] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { showToast } = useToast()

  const fetchKpis = useCallback(async () => {
    try {
      const res = await fetch(`/api/kpis?year=${year}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [year])

  useEffect(() => {
    setLoading(true)
    fetchKpis()
  }, [fetchKpis])

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const formData = new FormData()
      formData.append('file', file)
      const res = await fetch('/api/kpis/upload', { method: 'POST', body: formData })
      if (res.ok) {
        showToast({ type: 'success', message: 'KPI data uploaded successfully' })
        fetchKpis()
      } else {
        const err = await res.json().catch(() => ({}))
        showToast({ type: 'error', message: err.error || 'Upload failed' })
      }
    } catch {
      showToast({ type: 'error', message: 'Upload failed — network error' })
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const brands = data?.brands ?? []
  const latestMonth = data?.latest_month
    ?? (brands.length > 0 ? Math.max(...brands.map(b => getLatestMonth(b.metrics))) : 0)

  const totalSws = sumMetric(brands, latestMonth, 'sws_revenue', 'total')
  const totalLeads = sumMetric(brands, latestMonth, 'leads', '')
  const avgClose = avgMetric(brands, latestMonth, 'lead_to_sold_pct', '')

  const years = Array.from({ length: 5 }, (_, i) => CURRENT_YEAR - i)

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-[#2c2014] px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Link href="/">
            <Image src="/logo-icon-white.png" alt="Dumpbox" width={32} height={32} />
          </Link>
          <Link href="/" className="text-white font-bold tracking-tight text-lg hover:text-white/90 transition-colors">
            Dumpbox
          </Link>
          <span className="text-white/20 select-none">/</span>
          <span className="text-sm text-white/70 flex items-center gap-1.5">
            <BarChart3 size={14} />
            Brand Health
          </span>
        </div>
        <nav className="flex items-center gap-6">
          <a href="/wiki" className="text-sm text-white/70 font-medium hover:text-white transition-colors">Wiki</a>
          <a href="/kpis" className="text-sm text-white font-medium">KPIs</a>
          <a href="/audits" className="text-sm text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5"><ClipboardCheck size={14} />Audits</a>
          <a href="/history" className="text-sm text-white/70 font-medium hover:text-white transition-colors">History</a>
          <button onClick={handleSignOut} className="text-sm text-white/70 font-medium hover:text-white transition-colors">Sign out</button>
        </nav>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
          {/* Title + controls */}
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-[var(--text)]">Brand Health</h1>
            <div className="flex items-center gap-3">
              {/* Year selector */}
              <div className="relative">
                <button
                  onClick={() => setYearOpen(!yearOpen)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
                >
                  {year}
                  <ChevronDown size={14} />
                </button>
                {yearOpen && (
                  <div className="absolute right-0 top-full mt-1 bg-[var(--surface)] border border-[var(--border)] rounded-lg shadow-lg z-20 py-1 min-w-[80px]">
                    {years.map(y => (
                      <button
                        key={y}
                        onClick={() => { setYear(y); setYearOpen(false) }}
                        className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-[var(--surface-hover)] transition-colors ${y === year ? 'text-[var(--accent)] font-medium' : 'text-[var(--text)]'}`}
                      >
                        {y}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Upload button */}
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                onChange={handleUpload}
                className="hidden"
              />
              <button
                onClick={() => fileInputRef.current?.click()}
                disabled={uploading}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
              >
                <Upload size={14} />
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-[var(--muted)] text-sm">Loading KPI data…</div>
            </div>
          ) : brands.length === 0 ? (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
              <BarChart3 size={48} className="mx-auto text-[var(--muted)] mb-4" />
              <h2 className="text-lg font-semibold text-[var(--text)] mb-2">No KPI data yet</h2>
              <p className="text-sm text-[var(--muted)] mb-4">Upload an Excel file to get started with brand health tracking.</p>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors"
              >
                <Upload size={14} />
                Upload .xlsx
              </button>
            </div>
          ) : (
            <>
              {/* Summary bar */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">
                    {latestMonth > 0 ? `${MONTH_NAMES[latestMonth]} ${year}` : `${year}`} Summary
                  </span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-[var(--surface-hover)] rounded-lg px-4 py-3">
                    <span className="text-xs text-[var(--muted)]">Total SWS Revenue</span>
                    <div className="text-xl font-bold tabular-nums text-[var(--text)] mt-1">{formatCurrency(totalSws.cy)}</div>
                    <GrowthArrow value={totalSws.growth} />
                  </div>
                  <div className="bg-[var(--surface-hover)] rounded-lg px-4 py-3">
                    <span className="text-xs text-[var(--muted)]">Total Leads</span>
                    <div className="text-xl font-bold tabular-nums text-[var(--text)] mt-1">{formatNumber(totalLeads.cy)}</div>
                    <GrowthArrow value={totalLeads.growth} />
                  </div>
                  <div className="bg-[var(--surface-hover)] rounded-lg px-4 py-3">
                    <span className="text-xs text-[var(--muted)]">Avg Close Rate</span>
                    <div className="text-xl font-bold tabular-nums text-[var(--text)] mt-1">{formatPct(avgClose.cy != null ? avgClose.cy * 100 : null)}</div>
                    <GrowthArrow value={avgClose.growth} />
                  </div>
                  <div className="bg-[var(--surface-hover)] rounded-lg px-4 py-3">
                    <span className="text-xs text-[var(--muted)]">Brands Reporting</span>
                    <div className="text-xl font-bold tabular-nums text-[var(--text)] mt-1">{brands.length}</div>
                    <span className="text-xs text-[var(--muted)]">{latestMonth > 0 ? MONTH_NAMES[latestMonth] : '—'}</span>
                  </div>
                </div>
              </div>

              {/* Brand cards grid */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {brands.map(brand => {
                  const bMonth = getLatestMonth(brand.metrics) || latestMonth
                  const sws = getMetricValue(brand.metrics, bMonth, 'sws_revenue', 'total')
                  const leads = getMetricValue(brand.metrics, bMonth, 'leads', '')
                  const closeRate = getMetricValue(brand.metrics, bMonth, 'lead_to_sold_pct', '')
                  const avgTicket = getMetricValue(brand.metrics, bMonth, 'avg_job_ticket', '')

                  return (
                    <Link
                      key={brand.entity_id}
                      href={`/kpis/${brand.entity_id}`}
                      className="group bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-sm hover:bg-[var(--surface-hover)] hover:border-[var(--accent)] transition-all"
                    >
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="font-semibold text-[var(--text)] truncate">{brand.entity_name}</h3>
                        {bMonth > 0 && (
                          <span className="text-[10px] text-[var(--muted)] shrink-0 ml-2">
                            {MONTH_NAMES[bMonth].slice(0, 3)} {year}
                          </span>
                        )}
                      </div>
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">SWS Revenue</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold tabular-nums text-[var(--text)]">{formatCurrency(sws.cy)}</span>
                            <div className="flex items-center gap-1">
                              <GrowthArrow value={sws.growth} />
                              {sws.growth != null && <span className="text-[9px] text-[var(--muted)]">YoY</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Leads</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold tabular-nums text-[var(--text)]">{formatNumber(leads.cy)}</span>
                            <div className="flex items-center gap-1">
                              <GrowthArrow value={leads.growth} />
                              {leads.growth != null && <span className="text-[9px] text-[var(--muted)]">YoY</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Close Rate</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold tabular-nums text-[var(--text)]">{formatPct(closeRate.cy != null ? closeRate.cy * 100 : null)}</span>
                            <div className="flex items-center gap-1">
                              <GrowthArrow value={closeRate.growth} />
                              {closeRate.growth != null && <span className="text-[9px] text-[var(--muted)]">YoY</span>}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="text-xs text-[var(--muted)]">Avg Job Ticket</span>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold tabular-nums text-[var(--text)]">{formatCurrency(avgTicket.cy)}</span>
                            <div className="flex items-center gap-1">
                              <GrowthArrow value={avgTicket.growth} />
                              {avgTicket.growth != null && <span className="text-[9px] text-[var(--muted)]">YoY</span>}
                            </div>
                          </div>
                        </div>
                      </div>
                    </Link>
                  )
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
