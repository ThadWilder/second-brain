'use client'

import { useState, useEffect, useCallback, use } from 'react'
import Link from 'next/link'
import { BarChart3, ArrowLeft, ArrowUp, ArrowDown, Minus } from 'lucide-react'
import { Header } from '@/components/ui/Header'
import dynamic from 'next/dynamic'

const TrendChart = dynamic(() => import('@/components/kpi/TrendChart'), { ssr: false })

interface KpiMetric {
  month: number
  metric: string
  cy_value: number | null
  py_value: number | null
  growth_pct: number | null
  segment: string
}

interface BrandDetailResponse {
  entity: { id: string; name: string }
  metrics: KpiMetric[]
  year: number
  latest_month: number | null
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
  if (metric.includes('revenue') || metric.includes('ticket') || metric.includes('volume')) return formatCurrency(value)
  if (metric.includes('pct')) return formatPct(value * 100)
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

// Metric grouping for the table
const METRIC_SECTIONS: { label: string; metrics: { key: string; label: string; segment?: string }[] }[] = [
  {
    label: 'Sales',
    metrics: [
      { key: 'sws_revenue', label: 'SWS Revenue', segment: 'total' },
      { key: 'sold_jobs_revenue', label: 'Sold Jobs Revenue' },
    ],
  },
  {
    label: 'Close Ratios',
    metrics: [
      { key: 'lead_to_sold_pct', label: 'Lead to Sold %' },
      { key: 'lead_to_est_pct', label: 'Lead to Est %' },
      { key: 'est_to_sold_pct', label: 'Est to Sold %' },
    ],
  },
  {
    label: 'Job Metrics',
    metrics: [
      { key: 'avg_job_ticket', label: 'Avg Job Ticket' },
      { key: 'avg_daily_job_count', label: 'Avg Daily Job Count' },
      { key: 'sold_jobs', label: 'Jobs Sold' },
      { key: 'jobs_completed', label: 'Jobs Completed' },
    ],
  },
  {
    label: 'Performance',
    metrics: [
      { key: 'leads', label: 'Leads' },
      { key: 'estimates', label: 'Estimates' },
      { key: 'active_owners', label: 'Active Owners', segment: 'total' },
      { key: 'open_territories', label: 'Open Territories', segment: 'total' },
      { key: 'avg_owner_volume', label: 'AOV', segment: 'total' },
      { key: 'avg_territory_volume', label: 'AUV', segment: 'total' },
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

  const metrics = data?.metrics ?? []
  const monthsWithData = [...new Set(metrics.filter(m => m.cy_value != null && m.cy_value !== 0).map(m => m.month))].sort((a, b) => a - b)

  // Get metric for table
  function getMetric(month: number, metricKey: string, segment = '') {
    const match = metrics.find(m => m.month === month && m.metric === metricKey && m.segment === segment)
    return { cy: match?.cy_value ?? null, py: match?.py_value ?? null, growth: match?.growth_pct ?? null }
  }

  // Latest month for performance cards — prefer API-detected latest_month
  const latestMonth = data?.latest_month ?? (monthsWithData.length > 0 ? monthsWithData[monthsWithData.length - 1] : 0)

  // Check which metrics actually have data
  function hasMetricData(metricKey: string, segment = ''): boolean {
    return metrics.some(m => m.metric === metricKey && m.segment === segment && m.cy_value != null && m.cy_value !== 0)
  }

  // Build chart data: 12 months (Jan-Dec), CY from current year, PY from prior year
  // CY line stops after the latest reported month (nulls beyond that)
  function getChartData(metricKey: string, segment = ''): { month: string; cy: number | null; py: number | null }[] {
    return Array.from({ length: 12 }, (_, i) => {
      const monthNum = i + 1
      const match = metrics.find(m => m.month === monthNum && m.metric === metricKey && m.segment === segment)
      const cyVal = match?.cy_value ?? null
      const pyVal = match?.py_value ?? null
      // Don't plot CY zeros or values beyond the latest reported month
      const cy = (monthNum <= latestMonth && cyVal != null && cyVal !== 0) ? cyVal : null
      const py = pyVal
      return { month: MONTH_NAMES[monthNum], cy, py }
    })
  }

  // Get YoY growth % for a metric at the latest month
  function getLatestGrowth(metricKey: string, segment = ''): number | null {
    const match = metrics.find(m => m.month === latestMonth && m.metric === metricKey && m.segment === segment)
    return match?.growth_pct ?? null
  }

  // Chart format helpers
  function chartFormatCurrency(value: number): string {
    if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
    if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
    return `$${value.toFixed(0)}`
  }
  function chartFormatNumber(value: number): string {
    if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`
    return value.toLocaleString()
  }
  function chartFormatPct(value: number): string {
    return `${(value * 100).toFixed(1)}%`
  }

  const CHART_CONFIGS = [
    { key: 'sws_revenue', label: 'SWS Revenue', segment: 'total', format: chartFormatCurrency },
    { key: 'leads', label: 'Leads', segment: '', format: chartFormatNumber },
    { key: 'lead_to_sold_pct', label: 'Close Rate (Lead to Sold %)', segment: '', format: chartFormatPct },
    { key: 'avg_job_ticket', label: 'Avg Job Ticket', segment: '', format: chartFormatCurrency },
    { key: 'sold_jobs', label: 'Sold Jobs', segment: '', format: chartFormatNumber },
    { key: 'jobs_completed', label: 'Jobs Completed', segment: '', format: chartFormatNumber },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <Header activePage="kpis" />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-4 py-8 space-y-6">
          {/* Back + title */}
          <div className="flex items-center gap-3">
            <Link href="/kpis" className="text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-2xl font-bold text-[var(--text)]">{data?.entity?.name ?? 'Loading…'}</h1>
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
              {/* Summary metric cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                {[
                  { key: 'sws_revenue', label: 'SWS Revenue', segment: 'total', format: formatCurrency },
                  { key: 'leads', label: 'Leads', segment: '', format: formatNumber },
                  { key: 'lead_to_sold_pct', label: 'Close Rate', segment: '', format: (v: number | null | undefined) => formatPct(v != null ? v * 100 : null) },
                  { key: 'avg_job_ticket', label: 'Avg Job Ticket', segment: '', format: formatCurrency },
                ].map(({ key, label, segment, format }) => {
                  const latest = getMetric(latestMonth, key, segment)
                  return (
                    <div key={key} className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-sm">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-[var(--muted)]">{label}</span>
                        <GrowthArrow value={latest.growth} />
                      </div>
                      <div className="text-2xl font-bold tabular-nums text-[var(--text)]">
                        {format(latest.cy)}
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Trend charts */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {CHART_CONFIGS
                  .filter(({ key, segment }) => hasMetricData(key, segment))
                  .map(({ key, label, segment, format }) => (
                    <TrendChart
                      key={key}
                      data={getChartData(key, segment)}
                      title={label}
                      yoyGrowth={getLatestGrowth(key, segment)}
                      cyYear={year}
                      pyYear={year - 1}
                      formatValue={format}
                    />
                  ))}
              </div>

              {/* Data table */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border)]">
                  <h2 className="text-base font-bold text-[var(--text)]">Monthly Detail — {year}</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
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
                        const visibleMetrics = section.metrics.filter(m => hasMetricData(m.key, m.segment ?? ''))
                        if (visibleMetrics.length === 0) return null
                        return (
                          <SectionRows key={section.label} label={section.label} monthsWithData={monthsWithData}>
                            {visibleMetrics.map(({ key, label, segment }) => (
                              <tr key={key} className="border-b border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors">
                                <td className="px-4 py-1.5 text-[var(--text)] font-medium sticky left-0 bg-[var(--surface)] z-10">{label}</td>
                                {monthsWithData.map(m => {
                                  const v = getMetric(m, key, segment ?? '')
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
                <h2 className="text-base font-bold text-[var(--text)] mb-3 pb-2 border-b-2 border-[var(--accent)] inline-block">
                  Performance Summary — {MONTH_FULL[latestMonth]} {year}
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                  {[
                    { key: 'active_owners', label: 'Active Owners', segment: 'total' },
                    { key: 'open_territories', label: 'Open Territories', segment: 'total' },
                    { key: 'avg_owner_volume', label: 'AOV', segment: 'total' },
                    { key: 'avg_territory_volume', label: 'AUV', segment: 'total' },
                    { key: 'sold_jobs', label: 'Jobs Sold', segment: '' },
                    { key: 'jobs_completed', label: 'Jobs Completed', segment: '' },
                  ].filter(({ key, segment }) => hasMetricData(key, segment)).map(({ key, label, segment }) => {
                    const v = getMetric(latestMonth, key, segment)
                    return (
                      <div key={key} className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-5 py-4">
                        <span className="text-sm text-[var(--muted)]">{label}</span>
                        <div className="text-xl font-bold tabular-nums text-[var(--text)] mt-1">
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
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {segments.map(seg => {
                          const segRevenue = metrics.find(m => m.month === latestMonth && m.metric === 'sws_revenue' && m.segment === seg)
                          const segLeads = metrics.find(m => m.month === latestMonth && m.metric === 'leads' && m.segment === seg)
                          return (
                            <div key={seg} className="bg-[var(--surface-hover)] border border-[var(--border)] rounded-lg px-5 py-4">
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
