'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { ClipboardCheck, RefreshCw, BarChart3, Users, CheckCircle, AlertTriangle } from 'lucide-react'
import { Header } from '@/components/ui/Header'
import { useToast } from '@/components/ui/Toast'

interface AuditBrand {
  entity_id: string
  name: string
  franchisee_count: number
  avg_score: number
  franchisees: { name: string; score: number }[]
}

interface AuditResponse {
  brands: AuditBrand[]
}

function scoreColor(score: number): string {
  if (score >= 80) return '#437A22'
  if (score >= 50) return '#d4943a'
  return '#A12C7B'
}

function scoreBg(score: number): string {
  if (score >= 80) return 'bg-green-50 border-green-200'
  if (score >= 50) return 'bg-amber-50 border-amber-200'
  return 'bg-pink-50 border-pink-200'
}

function ScoreRing({ score, size = 56 }: { score: number; size?: number }) {
  const strokeWidth = 5
  const radius = (size - strokeWidth) / 2
  const circumference = 2 * Math.PI * radius
  const offset = circumference - (score / 100) * circumference
  const color = scoreColor(score)

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="var(--border)"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className="transition-all duration-500"
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold tabular-nums" style={{ color }}>
          {Math.round(score)}%
        </span>
      </div>
    </div>
  )
}

export default function AuditsPage() {
  const [data, setData] = useState<AuditResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [lastSynced, setLastSynced] = useState<Date | null>(null)
  const { showToast } = useToast()

  const fetchAudits = useCallback(async () => {
    try {
      const res = await fetch(`/api/audits?t=${Date.now()}`)
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
    fetchAudits()
  }, [fetchAudits])

  const handleSync = async () => {
    setSyncing(true)
    try {
      const res = await fetch('/api/audits/sync', { method: 'POST' })
      if (res.ok) {
        showToast({ type: 'success', message: 'Audit data synced successfully' })
        await fetchAudits()
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

  const brands = data?.brands ?? []
  const totalFranchisees = brands.reduce((sum, b) => sum + b.franchisee_count, 0)
  const overallAvgScore = brands.length > 0
    ? brands.reduce((sum, b) => sum + b.avg_score * b.franchisee_count, 0) / Math.max(totalFranchisees, 1)
    : 0
  const fullyCompliant = brands.reduce((sum, b) => sum + b.franchisees.filter(f => f.score === 100).length, 0)
  const needsAttention = brands.reduce((sum, b) => sum + b.franchisees.filter(f => f.score < 50).length, 0)

  return (
    <div className="min-h-screen flex flex-col">
      <Header activePage="audits" />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-4 py-8 space-y-6">
          {/* Title + Sync */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-[var(--text)]">Marketing Audits</h1>
              {lastSynced && (
                <p className="text-xs text-[var(--muted)] mt-1">
                  Last synced {lastSynced.toLocaleString('en-US', {
                    timeZone: 'America/New_York',
                    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true,
                  })} ET
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
              <div className="text-[var(--muted)] text-sm">Loading audit data…</div>
            </div>
          ) : brands.length === 0 ? (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
              <ClipboardCheck size={48} className="mx-auto text-[var(--muted)] mb-4" />
              <h2 className="text-lg font-semibold text-[var(--text)] mb-2">No audit data yet</h2>
              <p className="text-sm text-[var(--muted)] mb-4">Sync audit data to get started with franchise compliance tracking.</p>
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
              {/* Summary stats */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xs font-medium text-[var(--muted)] uppercase tracking-wide">Overview</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="bg-[var(--surface-hover)] rounded-lg px-5 py-4">
                    <div className="flex items-center gap-1.5 mb-1">
                      <Users size={14} className="text-[var(--muted)]" />
                      <span className="text-sm text-[var(--muted)]">Total Franchisees</span>
                    </div>
                    <div className="text-2xl font-bold tabular-nums text-[var(--text)]">{totalFranchisees}</div>
                  </div>
                  <div className="bg-[var(--surface-hover)] rounded-lg px-5 py-4">
                    <div className="flex items-center gap-1.5 mb-1">
                      <BarChart3 size={14} className="text-[var(--muted)]" />
                      <span className="text-sm text-[var(--muted)]">Average Score</span>
                    </div>
                    <div className="text-2xl font-bold tabular-nums" style={{ color: scoreColor(overallAvgScore) }}>
                      {Math.round(overallAvgScore)}%
                    </div>
                  </div>
                  <div className="bg-[var(--surface-hover)] rounded-lg px-5 py-4">
                    <div className="flex items-center gap-1.5 mb-1">
                      <CheckCircle size={14} className="text-[#437A22]" />
                      <span className="text-sm text-[var(--muted)]">Fully Compliant</span>
                    </div>
                    <div className="text-2xl font-bold tabular-nums text-[#437A22]">{fullyCompliant}</div>
                  </div>
                  <div className="bg-[var(--surface-hover)] rounded-lg px-5 py-4">
                    <div className="flex items-center gap-1.5 mb-1">
                      <AlertTriangle size={14} className="text-[#A12C7B]" />
                      <span className="text-sm text-[var(--muted)]">Needs Attention</span>
                    </div>
                    <div className="text-2xl font-bold tabular-nums text-[#A12C7B]">{needsAttention}</div>
                  </div>
                </div>
              </div>

              {/* Brand cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {brands.map(brand => (
                  <Link
                    key={brand.entity_id}
                    href={`/audits/${brand.entity_id}`}
                    className="group bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 shadow-sm hover:bg-[var(--surface-hover)] hover:border-[var(--accent)] transition-all"
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div>
                        <h3 className="font-semibold text-[var(--text)] group-hover:text-[var(--accent)] transition-colors">{brand.name}</h3>
                        <span className="text-xs text-[var(--muted)]">{brand.franchisee_count} franchisee{brand.franchisee_count !== 1 ? 's' : ''}</span>
                      </div>
                      <ScoreRing score={brand.avg_score} />
                    </div>

                    {/* Score bar */}
                    <div className="mb-3">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs text-[var(--muted)]">Avg Score</span>
                        <span className="text-xs font-semibold tabular-nums" style={{ color: scoreColor(brand.avg_score) }}>
                          {Math.round(brand.avg_score)}%
                        </span>
                      </div>
                      <div className="h-2 bg-[var(--border)] rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${Math.min(brand.avg_score, 100)}%`,
                            backgroundColor: scoreColor(brand.avg_score),
                          }}
                        />
                      </div>
                    </div>

                    {/* Quick breakdown */}
                    <div className="flex items-center gap-3 text-[10px]">
                      {brand.franchisees.filter(f => f.score === 100).length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full border bg-green-50 text-green-700 border-green-200">
                          {brand.franchisees.filter(f => f.score === 100).length} perfect
                        </span>
                      )}
                      {brand.franchisees.filter(f => f.score < 50).length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full border bg-pink-50 text-pink-700 border-pink-200">
                          {brand.franchisees.filter(f => f.score < 50).length} low
                        </span>
                      )}
                    </div>
                  </Link>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
