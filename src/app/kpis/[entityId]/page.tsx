'use client'

import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { BarChart3, ArrowLeft, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'

interface KpiMetric {
  month: number
  metric: string
  cy_value: number | null
  py_value: number | null
  growth_pct: number | null
  segment: string
}

interface BrandDetailResponse {
  entity_id: string
  name: string
  metrics: KpiMetric[]
  year: number
}

const CURRENT_YEAR = new Date().getFullYear()

const MONTH_NAMES = [
  '', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

const MONTH_FULL = [
  '', 'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

function formatCurrency(value: number | null | undefined): string {
  if (value == null) return '—'
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

function formatNumber(value: number | null | undefined): string {
  if (value == null) return '—'
  return value.toLocaleString()
}

function formatPct(value: number | null | undefined): string {
  if (value == null) return '—'
  return `${value.toFixed(1)}%`
}

function formatMetricValue(metric: string, value: number | null | undefined): string {
  if (value == null) return '—'
  if (metric.includes('revenue') || metric.includes('ticket') || metric.includes('aov') || metric.includes('auv')) return formatCurrency(value)
  if (metric.includes('rate') || metric.includes('ratio') || metric.includes('pct')) return formatPct(value)
  return formatNumber(value)
}

function GrowthArrow({ value }: { value: number | null | undefined }) {
  if (value == null) return <Minus size={12} className="text-[var(--muted)]" />
  if (value > 0) return (
    <span className="flex items-center gap-0.5 text-[#437A22]">
      <ArrowUp size={12} />
      <span className="text-xs">{value.toFixed(1)}%</span>
    </span>
  )
  if (value < 0) return (
    <span className="flex items-center gap-0.5 text-[#A12C7B]">
      <ArrowDown size={12} />
      <span className="text-xs">{Math.abs(value).toFixed(1)}%</span>
    </span>
  )
  return <Minus size={12} className="text-[var(--muted)]" />
}

function GrowthBadge({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-xs text-[var(--muted)]">—</span>
  const color = value > 0 ? 'text-[#437A22] bg-green-50' : value < 0 ? 'text-[#A12C7B] bg-pink-50' : 'text-[var(--muted)] bg-gray-50'
  return (
    <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${color}`}>
      {value > 0 ? '+' : ''}{value.toFixed(1)}%
    </span>
  )
}

// Simple sparkline SVG — CY line with PY as faded background
function Sparkline({ data, height = 48 }: { data: { month: number; cy: number | null; py: number | null }[]; height?: number }) {
  const width = 200
  const padding = 4
  const filtered = data.filter(d => d.cy != null || d.py != null)
  if (filtered.length < 2) return <div className="h-12 flex items-center justify-center text-xs text-[var(--muted)]">Not enough data</div>

  const allVals = filtered.flatMap(d => [d.cy, d.py].filter((v): v is number => v != null))
  const min = Math.min(...allVals)
  const max = Math.max(...allVals)
  const range = max - min || 1

  const toX = (i: number) => padding + (i / (filtered.length - 1)) * (width - 2 * padding)
  const toY = (v: number) => padding + (1 - (v - min) / range) * (height - 2 * padding)

  const cyPoints = filtered
    .map((d, i) => d.cy != null ? `${toX(i)},${toY(d.cy)}` : null)
    .filter(Boolean)
    .join(' ')

  const pyPoints = filtered
    .map((d, i) => d.py != null ? `${toX(i)},${toY(d.py)}` : null)
    .filter(Boolean)
    .join(' ')

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }}>
      {pyPoints && <polyline points={pyPoints} fill="none" stroke="var(--border)" strokeWidth="1.5" strokeDasharray="4 3" />}
      {cyPoints && <polyline points={cyPoints} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />}
      {/* Dot on last CY value */}
      {filtered.length > 0 && filtered[filtered.length - 1].cy != null && (
        <circle
          cx={toX(filtered.length - 1)}
          cy={toY(filtered[filtered.length - 1].cy!)}
          r="3"
          fill="var(--accent)"
        />
      )}
    </svg>
  )
}

// Metric grouping for the table
const METRIC_SECTIONS: { label: string; metrics: { key: string; label: string }[] }[] = [
  {
    label: 'Sales',
    metrics: [
      { key: 'sws_revenue', label: 'SWS Revenue' },
      { key: 'total_revenue', label: 'Total Revenue' },
      { key: 'royalty_revenue', label: 'Royalty Revenue' },
    ],
  },
  {
    label: 'Close Ratios',
    metrics: [
      { key: 'close_rate', label: 'Close Rate (Lead to Sold %)' },
      { key: 'close_rate_issued', label: 'Close Rate (Issued to Sold %)' },
    ],
  },
  {
    label: 'Job Metrics',
    metrics: [
      { key: 'avg_job_ticket', label: 'Avg Job Ticket' },
      { key: 'jobs_sold', label: 'Jobs Sold' },
      { key: 'jobs_completed', label: 'Jobs Completed' },
    ],
  },
  {
    label: 'Performance',
    metrics: [
      { key: 'leads', label: 'Leads' },
      { key: 'estimates_issued', label: 'Estimates Issued' },
      { key: 'active_owners', label: 'Active Owners' },
      { key: 'new_owners', label: 'New Owners' },
      { key: 'existing_owners', label: 'Existing Owners' },
      { key: 'open_territories', label: 'Open Territories' },
      { key: 'aov', label: 'AOV' },
      { key: 'auv', label: 'AUV' },
    ],
  },
]

export default function BrandDetailPage({ params }: { params: Promise<{ entityId: string }> }) {
  const { entityId } = use(params)
  const [data, setData] = useState<BrandDetailResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [year, setYear] = useState(CURRENT_YEAR)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/kpis?entity_id=${entityId}&year=${year}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [entityId, year])

  useEffect(() => {
    setLoading(true)
    fetchData()
  }, [fetchData])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const metrics = data?.metrics ?? []
  const monthsWithData = [...new Set(metrics.filter(m => m.cy_value != null).map(m => m.month))].sort((a, b) => a - b)

  // Build sparkline data for a metric
  function getSparklineData(metricKey: string): { month: number; cy: number | null; py: number | null }[] {
    return monthsWithData.map(month => {
      const match = metrics.find(m => m.month === month && m.metric === metricKey && m.segment === 'total')
      return { month, cy: match?.cy_value ?? null, py: match?.py_value ?? null }
    })
  }

  // Get metric for table
  function getMetric(month: number, metricKey: string, segment = 'total') {
    const match = metrics.find(m => m.month === month && m.metric === metricKey && m.segment === segment)
    return { cy: match?.cy_value ?? null, py: match?.py_value ?? null, growth: match?.growth_pct ?? null }
  }

  // Latest month for performance cards
  const latestMonth = monthsWithData.length > 0 ? monthsWithData[monthsWithData.length - 1] : 0

  // Check which metrics actually have data
  function hasMetricData(metricKey: string): boolean {
    return metrics.some(m => m.metric === metricKey && m.cy_value != null)
  }

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
          <Link href="/kpis" className="text-sm text-white/70 hover:text-white transition-colors flex items-center gap-1.5">
            <BarChart3 size={14} />
            KPIs
          </Link>
          {data && (
            <>
              <span className="text-white/20 select-none">/</span>
              <span className="text-sm text-white/70">{data.name}</span>
            </>
          )}
        </div>
        <nav className="flex items-center gap-6">
          <a href="/wiki" className="text-sm text-white/70 font-medium hover:text-white transition-colors">Wiki</a>
          <a href="/kpis" className="text-sm text-white font-medium">KPIs</a>
          <button onClick={handleSignOut} className="text-sm text-white/70 font-medium hover:text-white transition-colors">Sign out</button>
        </nav>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-6xl mx-auto px-6 py-8 space-y-6">
          {/* Back + title */}
          <div className="flex items-center gap-3">
            <Link href="/kpis" className="text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-2xl font-bold text-[var(--text)]">{data?.name ?? 'Loading…'}</h1>
            <span className="text-sm text-[var(--muted)]">{year}</span>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-[var(--muted)] text-sm">Loading brand data…</div>
            </div>
          ) : !data || metrics.length === 0 ? (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
              <BarChart3 size={48} className="mx-auto text-[var(--muted)] mb-4" />
              <h2 className="text-lg font-semibold text-[var(--text)] mb-2">No data for {year}</h2>
              <p className="text-sm text-[var(--muted)]">KPI data hasn&apos;t been uploaded for this brand yet.</p>
            </div>
          ) : (
            <>
              {/* Trend sparklines */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  { key: 'sws_revenue', label: 'SWS Revenue', format: formatCurrency },
                  { key: 'leads', label: 'Leads', format: formatNumber },
                  { key: 'close_rate', label: 'Close Rate', format: formatPct },
                  { key: 'avg_job_ticket', label: 'Avg Job Ticket', format: formatCurrency },
                ].map(({ key, label, format }) => {
                  const latest = getMetric(latestMonth, key)
                  return (
                    <div key={key} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[var(--muted)]">{label}</span>
                        <GrowthArrow value={latest.growth} />
                      </div>
                      <div className="text-xl font-bold tabular-nums text-[var(--text)] mb-2">
                        {format(latest.cy)}
                      </div>
                      <Sparkline data={getSparklineData(key)} />
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-[var(--muted)]">
                          <span className="inline-block w-3 h-0.5 bg-[var(--accent)] mr-1 align-middle" />
                          {year}
                        </span>
                        <span className="text-[10px] text-[var(--muted)]">
                          <span className="inline-block w-3 h-0.5 border-b border-dashed border-[var(--border)] mr-1 align-middle" />
                          {year - 1}
                        </span>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Data table */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
                <div className="px-4 py-3 border-b border-[var(--border)]">
                  <h2 className="text-sm font-bold text-[var(--text)]">Monthly Detail — {year}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="border-b border-[var(--border)]">
                        <th className="text-left px-4 py-2 text-[var(--muted)] font-medium sticky left-0 bg-[var(--surface)] z-10 min-w-[160px]">Metric</th>
                        {monthsWithData.map(m => (
                          <th key={m} colSpan={3} className="text-center px-1 py-2 text-[var(--muted)] font-medium border-l border-[var(--border)]">
                            {MONTH_NAMES[m]}
                          </th>
                        ))}
                      </tr>
                      <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)]">
                        <th className="sticky left-0 bg-[var(--surface-hover)] z-10" />
                        {monthsWithData.map(m => (
                          <th key={m} className="border-l border-[var(--border)]">
                            <div className="grid grid-cols-3">
                              <span className="px-2 py-1 text-[10px] text-[var(--muted)] font-normal">CY</span>
                              <span className="px-2 py-1 text-[10px] text-[var(--muted)] font-normal">PY</span>
                              <span className="px-2 py-1 text-[10px] text-[var(--muted)] font-normal">GRW%</span>
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {METRIC_SECTIONS.map(section => {
                        const visibleMetrics = section.metrics.filter(m => hasMetricData(m.key))
                        if (visibleMetrics.length === 0) return null
                        return (
                          <SectionRows key={section.label} label={section.label} monthsWithData={monthsWithData}>
                            {visibleMetrics.map(({ key, label }) => (
                              <tr key={key} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors">
                                <td className="px-4 py-1.5 text-[var(--text)] font-medium sticky left-0 bg-[var(--surface)] z-10">{label}</td>
                                {monthsWithData.map(m => {
                                  const v = getMetric(m, key)
                                  return (
                                    <td key={m} className="border-l border-[var(--border)]">
                                      <div className="grid grid-cols-3">
                                        <span className="px-2 py-1.5 tabular-nums text-right">{formatMetricValue(key, v.cy)}</span>
                                        <span className="px-2 py-1.5 tabular-nums text-right text-[var(--muted)]">{formatMetricValue(key, v.py)}</span>
                                        <span className="px-2 py-1.5 text-right"><GrowthBadge value={v.growth} /></span>
                                      </div>
                                    </td>
                                  )
                                })}
                              </tr>
                            ))}
                          </SectionRows>
                        )
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Performance summary cards */}
              <div>
                <h2 className="text-sm font-bold text-[var(--text)] mb-3 pb-2 border-b-2 border-[var(--accent)] inline-block">
                  Performance Summary — {MONTH_FULL[latestMonth]} {year}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {[
                    { key: 'active_owners', label: 'Active Owners' },
                    { key: 'new_owners', label: 'New Owners' },
                    { key: 'existing_owners', label: 'Existing Owners' },
                    { key: 'open_territories', label: 'Open Territories' },
                    { key: 'aov', label: 'AOV' },
                    { key: 'auv', label: 'AUV' },
                    { key: 'jobs_sold', label: 'Jobs Sold' },
                    { key: 'jobs_completed', label: 'Jobs Completed' },
                  ].filter(({ key }) => hasMetricData(key)).map(({ key, label }) => {
                    const v = getMetric(latestMonth, key)
                    return (
                      <div key={key} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3">
                        <span className="text-xs text-[var(--muted)]">{label}</span>
                        <div className="text-lg font-bold tabular-nums text-[var(--text)] mt-1">
                          {formatMetricValue(key, v.cy)}
                        </div>
                        <GrowthArrow value={v.growth} />
                        {v.py != null && (
                          <div className="text-[10px] text-[var(--muted)] mt-0.5">
                            PY: {formatMetricValue(key, v.py)}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>

                {/* Segment breakdown if available */}
                {(() => {
                  const segments = [...new Set(metrics.filter(m => m.segment && m.segment !== 'total' && m.month === latestMonth).map(m => m.segment))]
                  if (segments.length === 0) return null
                  return (
                    <div className="mt-4">
                      <h3 className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide mb-2">By Segment</h3>
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                        {segments.map(seg => {
                          const segRevenue = metrics.find(m => m.month === latestMonth && m.metric === 'sws_revenue' && m.segment === seg)
                          const segLeads = metrics.find(m => m.month === latestMonth && m.metric === 'leads' && m.segment === seg)
                          return (
                            <div key={seg} className="bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-4 py-3">
                              <h4 className="text-xs font-semibold text-[var(--text)] mb-2 capitalize">{seg}</h4>
                              <div className="space-y-1.5">
                                {segRevenue && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-[var(--muted)]">SWS Revenue</span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs font-semibold tabular-nums">{formatCurrency(segRevenue.cy_value)}</span>
                                      <GrowthArrow value={segRevenue.growth_pct} />
                                    </div>
                                  </div>
                                )}
                                {segLeads && (
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] text-[var(--muted)]">Leads</span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-xs font-semibold tabular-nums">{formatNumber(segLeads.cy_value)}</span>
                                      <GrowthArrow value={segLeads.growth_pct} />
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  )
                })()}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// Section header row component for the table
function SectionRows({ label, monthsWithData, children }: { label: string; monthsWithData: number[]; children: React.ReactNode }) {
  return (
    <>
      <tr className="bg-[var(--surface-hover)]">
        <td
          colSpan={1 + monthsWithData.length}
          className="px-4 py-1.5 text-xs font-bold text-[var(--accent)] uppercase tracking-wide sticky left-0 bg-[var(--surface-hover)] z-10"
        >
          {label}
        </td>
      </tr>
      {children}
    </>
  )
}
