'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import {
  Star,
  RefreshCw,
  BarChart3,
  Users,
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronRight,
  Zap,
  XCircle,
  TrendingDown,
  Activity,
  Link2,
  Eye,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'
import { useToast } from '@/components/ui/Toast'

interface ReviewCompany {
  id: string
  company_id: string | null
  company_name: string
  brand_name: string
  brand_entity_id: string | null
  campaign_objective: string | null
  active_in_nicejob: boolean
  api_status: string | null
  enrollments_all_time: number | null
  enrollments_monthly: number | null
  campaign_ready_since: string | null
  crm_id_confirmed: boolean
  toggled_on_fms: boolean
  has_anomaly: boolean
  anomaly_reasons: string[]
  synced_at: string
  entities: { id: string; name: string } | null
}

interface ReviewsResponse {
  companies: ReviewCompany[]
}

const ANOMALY_CONFIG: Record<string, { label: string; description: string; color: string; bgColor: string; borderColor: string; icon: typeof AlertTriangle }> = {
  api_needs_attention: {
    label: 'API Needs Attention',
    description: 'API status needs checking or activation',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: Zap,
  },
  active_zero_monthly: {
    label: 'Active — Zero Monthly',
    description: 'Active in NiceJob but zero monthly enrollments',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: XCircle,
  },
  active_zero_alltime: {
    label: 'Active — Zero All-Time',
    description: 'Active in NiceJob but zero all-time enrollments',
    color: 'text-red-700',
    bgColor: 'bg-red-50',
    borderColor: 'border-red-200',
    icon: XCircle,
  },
  low_monthly_enrollments: {
    label: 'Low Engagement',
    description: 'Active but fewer than 3 monthly enrollments',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    icon: TrendingDown,
  },
  not_active: {
    label: 'Not Active',
    description: 'Has a campaign objective but not active in NiceJob',
    color: 'text-amber-700',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
    icon: Activity,
  },
}

function statusBadge(active: boolean) {
  if (active) {
    return (
      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">
        <CheckCircle size={10} />
        Active
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-gray-500 border border-gray-200">
      Inactive
    </span>
  )
}

function apiStatusBadge(status: string | null) {
  if (!status) return null
  const lower = status.toLowerCase()
  if (lower === 'good') {
    return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-green-50 text-green-700 border border-green-200">Good</span>
  }
  if (lower === 'verify if ok') {
    return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200">Verify</span>
  }
  if (lower.includes('needs to be turned on')) {
    return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-50 text-red-700 border border-red-200">Needs Activation</span>
  }
  if (lower === 'n/a') {
    return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-gray-500 border border-gray-200">N/A</span>
  }
  return <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-gray-50 text-gray-500 border border-gray-200">{status}</span>
}

export default function ReviewsPage() {
  const [data, setData] = useState<ReviewsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<Date | null>(null)
  const [expandedAnomalies, setExpandedAnomalies] = useState<Record<string, boolean>>({
    api_needs_attention: true,
    active_zero_monthly: true,
    active_zero_alltime: false,
    low_monthly_enrollments: true,
    not_active: false,
  })
  const [expandedBrands, setExpandedBrands] = useState<Record<string, boolean>>({})
  const { showToast } = useToast()

  const fetchReviews = useCallback(async () => {
    try {
      const res = await fetch(`/api/reviews?t=${Date.now()}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
        setLastSynced(new Date())
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchReviews()
  }, [fetchReviews])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/reviews/sync', { method: 'POST' })
      if (res.ok) {
        const result = await res.json()
        showToast({
          type: 'success',
          message: `Synced ${result.companies_synced} companies, found ${result.anomalies_found} anomalies`,
        })
        await fetchReviews()
      } else {
        const err = await res.json().catch(() => ({}))
        showToast({ type: 'error', message: err.error || 'Sync failed' })
      }
    } catch {
      showToast({ type: 'error', message: 'Sync failed — network error' })
    } finally {
      setSyncing(false)
    }
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const companies = data?.companies ?? []
  const totalLocations = companies.length
  const activeCount = companies.filter((c) => c.active_in_nicejob).length
  const anomalyCount = companies.filter((c) => c.has_anomaly).length
  const activeWithMonthly = companies.filter((c) => c.active_in_nicejob && c.enrollments_monthly !== null)
  const avgMonthlyEnrollments =
    activeWithMonthly.length > 0
      ? Math.round(
          (activeWithMonthly.reduce((sum, c) => sum + (c.enrollments_monthly ?? 0), 0) / activeWithMonthly.length) * 10
        ) / 10
      : 0

  // Group anomalies by type
  const anomaliesByType: Record<string, ReviewCompany[]> = {}
  for (const company of companies) {
    if (!company.has_anomaly) continue
    for (const reason of company.anomaly_reasons) {
      if (!anomaliesByType[reason]) anomaliesByType[reason] = []
      anomaliesByType[reason].push(company)
    }
  }

  // Group companies by brand
  const brandGroups: Record<string, ReviewCompany[]> = {}
  for (const company of companies) {
    const brand = company.brand_name || 'Unknown'
    if (!brandGroups[brand]) brandGroups[brand] = []
    brandGroups[brand].push(company)
  }
  const sortedBrands = Object.keys(brandGroups).sort()

  const toggleAnomaly = (key: string) => {
    setExpandedAnomalies((prev) => ({ ...prev, [key]: !prev[key] }))
  }

  const toggleBrand = (brand: string) => {
    setExpandedBrands((prev) => ({ ...prev, [brand]: !prev[brand] }))
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
          <span className="text-sm text-white/70 flex items-center gap-1.5">
            <Star size={14} />
            NiceJob Reviews
          </span>
        </div>
        <nav className="flex items-center gap-6">
          <a href="/wiki" className="text-base text-white/70 font-medium hover:text-white transition-colors">Wiki</a>
          <a href="/kpis" className="text-base text-white/70 font-medium hover:text-white transition-colors">KPIs</a>
          <a href="/tracking" className="text-base text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5">🍳 The Kitchen</a>
          <a href="/history" className="text-base text-white/70 font-medium hover:text-white transition-colors">History</a>
          <a href="/links" className="text-base text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5"><Link2 size={15} />Links</a>
          <button onClick={handleSignOut} className="text-base text-white/70 font-medium hover:text-white transition-colors">Sign out</button>
        </nav>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-4 py-8 space-y-6">
          {/* Title + Sync */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text)]">NiceJob Review Tracking</h1>
              {lastSynced && (
                <p className="text-xs text-[var(--muted)] mt-1">
                  Last synced{' '}
                  {lastSynced.toLocaleString('en-US', {
                    timeZone: 'America/New_York',
                    month: 'short',
                    day: 'numeric',
                    hour: 'numeric',
                    minute: '2-digit',
                    hour12: true,
                  })}{' '}
                  ET
                </p>
              )}
            </div>
            <button
              onClick={handleSync}
              disabled={syncing}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
            >
              <RefreshCw size={14} className={syncing ? 'animate-spin' : ''} />
              {syncing ? 'Syncing…' : 'Sync Now'}
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-[var(--muted)] text-sm">Loading review data…</div>
            </div>
          ) : companies.length === 0 ? (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
              <Star size={48} className="mx-auto text-[var(--muted)] mb-4" />
              <h2 className="text-lg font-semibold text-[var(--text)] mb-2">No review data yet</h2>
              <p className="text-sm text-[var(--muted)] mb-4">Sync NiceJob data to get started with review generation tracking.</p>
              <button
                onClick={handleSync}
                disabled={syncing}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-[var(--accent)] text-white text-sm font-medium hover:bg-[var(--accent-hover)] transition-colors disabled:opacity-50"
              >
                <RefreshCw size={14} />
                Sync Now
              </button>
            </div>
          ) : (
            <>
              {/* Summary Stats */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">Overview</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-[var(--surface-hover)] rounded-lg px-5 py-4">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Users size={14} className="text-[var(--muted)]" />
                      <span className="text-sm text-[var(--muted)]">Total Locations</span>
                    </div>
                    <div className="text-2xl font-bold tabular-nums text-[var(--text)]">{totalLocations}</div>
                  </div>
                  <div className="bg-[var(--surface-hover)] rounded-lg px-5 py-4">
                    <div className="flex items-center gap-1.5 mb-1">
                      <CheckCircle size={14} className="text-[#437A22]" />
                      <span className="text-sm text-[var(--muted)]">Active in NiceJob</span>
                    </div>
                    <div className="text-2xl font-bold tabular-nums text-[#437A22]">{activeCount}</div>
                  </div>
                  <div className="bg-[var(--surface-hover)] rounded-lg px-5 py-4">
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertTriangle size={14} className="text-[#A12C7B]" />
                      <span className="text-sm text-[var(--muted)]">With Anomalies</span>
                    </div>
                    <div className="text-2xl font-bold tabular-nums text-[#A12C7B]">{anomalyCount}</div>
                  </div>
                  <div className="bg-[var(--surface-hover)] rounded-lg px-5 py-4">
                    <div className="flex items-center gap-1.5 mb-1">
                      <BarChart3 size={14} className="text-[var(--muted)]" />
                      <span className="text-sm text-[var(--muted)]">Avg Monthly Enrollments</span>
                    </div>
                    <div className="text-2xl font-bold tabular-nums text-[var(--text)]">{avgMonthlyEnrollments}</div>
                  </div>
                </div>
              </div>

              {/* Anomalies Section */}
              {anomalyCount > 0 && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <AlertTriangle size={14} className="text-[#A12C7B]" />
                    <span className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">
                      Anomalies ({anomalyCount} locations)
                    </span>
                  </div>

                  <div className="space-y-3">
                    {Object.entries(ANOMALY_CONFIG).map(([key, config]) => {
                      const items = anomaliesByType[key]
                      if (!items || items.length === 0) return null
                      const Icon = config.icon
                      const expanded = expandedAnomalies[key] ?? false

                      return (
                        <div key={key} className={`border rounded-lg ${config.borderColor} ${config.bgColor}`}>
                          <button
                            onClick={() => toggleAnomaly(key)}
                            className="w-full flex items-center gap-2 px-4 py-3 text-left"
                          >
                            {expanded ? (
                              <ChevronDown size={14} className={config.color} />
                            ) : (
                              <ChevronRight size={14} className={config.color} />
                            )}
                            <Icon size={14} className={config.color} />
                            <span className={`text-sm font-medium ${config.color}`}>
                              {config.label}
                            </span>
                            <span className={`text-xs ${config.color} opacity-70`}>
                              — {items.length} location{items.length !== 1 ? 's' : ''}
                            </span>
                            <span className="ml-auto text-xs text-gray-500">{config.description}</span>
                          </button>

                          {expanded && (
                            <div className="px-4 pb-3">
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead>
                                    <tr className="border-b border-gray-200">
                                      <th className="text-left py-2 pr-3 font-medium text-gray-600">Company</th>
                                      <th className="text-left py-2 pr-3 font-medium text-gray-600">Brand</th>
                                      <th className="text-left py-2 pr-3 font-medium text-gray-600">API Status</th>
                                      <th className="text-right py-2 pr-3 font-medium text-gray-600">Monthly</th>
                                      <th className="text-right py-2 font-medium text-gray-600">All-Time</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {items.map((company) => (
                                      <tr key={company.id} className="border-b border-gray-100 last:border-0">
                                        <td className="py-2 pr-3 font-medium text-gray-800">{company.company_name}</td>
                                        <td className="py-2 pr-3 text-gray-600">{company.brand_name}</td>
                                        <td className="py-2 pr-3">{apiStatusBadge(company.api_status)}</td>
                                        <td className="py-2 pr-3 text-right tabular-nums text-gray-700">
                                          {company.enrollments_monthly ?? '—'}
                                        </td>
                                        <td className="py-2 text-right tabular-nums text-gray-700">
                                          {company.enrollments_all_time ?? '—'}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                </div>
              )}

              {/* Brand Breakdown */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">
                    Brand Breakdown ({sortedBrands.length} brands)
                  </span>
                </div>

                <div className="space-y-2">
                  {sortedBrands.map((brand) => {
                    const brandCompanies = brandGroups[brand]
                    const brandActive = brandCompanies.filter((c) => c.active_in_nicejob).length
                    const brandAnomalies = brandCompanies.filter((c) => c.has_anomaly).length
                    const expanded = expandedBrands[brand] ?? false

                    return (
                      <div key={brand} className="border border-[var(--border)] rounded-lg overflow-hidden">
                        <button
                          onClick={() => toggleBrand(brand)}
                          className="w-full flex items-center gap-2 px-4 py-3 text-left bg-[var(--surface-hover)] hover:bg-[var(--border)] transition-colors"
                        >
                          {expanded ? (
                            <ChevronDown size={14} className="text-[var(--muted)]" />
                          ) : (
                            <ChevronRight size={14} className="text-[var(--muted)]" />
                          )}
                          <span className="text-sm font-medium text-[var(--text)]">{brand}</span>
                          <span className="text-xs text-[var(--muted)]">
                            {brandCompanies.length} location{brandCompanies.length !== 1 ? 's' : ''}
                          </span>
                          <div className="ml-auto flex items-center gap-3">
                            <span className="text-xs text-[#437A22]">{brandActive} active</span>
                            {brandAnomalies > 0 && (
                              <span className="text-xs text-[#A12C7B]">{brandAnomalies} anomalies</span>
                            )}
                          </div>
                        </button>

                        {expanded && (
                          <div className="px-4 pb-3 pt-2">
                            <div className="overflow-x-auto">
                              <table className="w-full text-xs">
                                <thead>
                                  <tr className="border-b border-[var(--border)]">
                                    <th className="text-left py-2 pr-3 font-medium text-[var(--muted)]">Company</th>
                                    <th className="text-left py-2 pr-3 font-medium text-[var(--muted)]">Status</th>
                                    <th className="text-left py-2 pr-3 font-medium text-[var(--muted)]">API</th>
                                    <th className="text-right py-2 pr-3 font-medium text-[var(--muted)]">Monthly</th>
                                    <th className="text-right py-2 pr-3 font-medium text-[var(--muted)]">All-Time</th>
                                    <th className="text-left py-2 font-medium text-[var(--muted)]">Issues</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {brandCompanies.map((company) => (
                                    <tr
                                      key={company.id}
                                      className={`border-b border-[var(--border)] last:border-0 ${
                                        company.has_anomaly ? 'bg-red-50/30' : ''
                                      }`}
                                    >
                                      <td className="py-2 pr-3 font-medium text-[var(--text)]">
                                        {company.company_name}
                                      </td>
                                      <td className="py-2 pr-3">{statusBadge(company.active_in_nicejob)}</td>
                                      <td className="py-2 pr-3">{apiStatusBadge(company.api_status)}</td>
                                      <td className="py-2 pr-3 text-right tabular-nums text-[var(--text)]">
                                        {company.enrollments_monthly ?? '—'}
                                      </td>
                                      <td className="py-2 pr-3 text-right tabular-nums text-[var(--text)]">
                                        {company.enrollments_all_time ?? '—'}
                                      </td>
                                      <td className="py-2">
                                        {company.has_anomaly ? (
                                          <div className="flex flex-wrap gap-1">
                                            {company.anomaly_reasons.map((reason) => {
                                              const cfg = ANOMALY_CONFIG[reason]
                                              return cfg ? (
                                                <span
                                                  key={reason}
                                                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-medium border ${cfg.bgColor} ${cfg.color} ${cfg.borderColor}`}
                                                >
                                                  {cfg.label}
                                                </span>
                                              ) : null
                                            })}
                                          </div>
                                        ) : (
                                          <span className="text-[var(--muted)]">—</span>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
