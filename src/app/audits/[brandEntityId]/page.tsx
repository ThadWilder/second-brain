'use client'

import { useState, useEffect, useCallback, useMemo, use } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { ClipboardCheck, ArrowLeft, CheckCircle, XCircle, Users, BarChart3, AlertTriangle, ArrowUpDown, Star, Link2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'

interface Franchisee {
  name: string
  email: string
  location: string
  score: number
  fields: Record<string, unknown>
}

interface BrandAuditResponse {
  entity_id: string
  name: string
  franchisees: Franchisee[]
}

function scoreColor(score: number): string {
  if (score >= 80) return '#437A22'
  if (score >= 50) return '#d4943a'
  return '#A12C7B'
}

function rowTint(score: number): string {
  if (score >= 80) return 'bg-green-50/40'
  if (score >= 50) return ''
  return 'bg-pink-50/40'
}

function ScoreBar({ score }: { score: number }) {
  return (
    <div className="flex items-center gap-2 min-w-[120px]">
      <div className="flex-1 h-1.5 bg-[var(--border)] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-300"
          style={{
            width: `${Math.min(score, 100)}%`,
            backgroundColor: scoreColor(score),
          }}
        />
      </div>
      <span className="text-xs font-semibold tabular-nums w-[36px] text-right" style={{ color: scoreColor(score) }}>
        {Math.round(score)}%
      </span>
    </div>
  )
}

function DistributionBar({ franchisees }: { franchisees: Franchisee[] }) {
  const total = franchisees.length
  if (total === 0) return null
  const high = franchisees.filter(f => f.score >= 80).length
  const mid = franchisees.filter(f => f.score >= 50 && f.score < 80).length
  const low = franchisees.filter(f => f.score < 50).length

  return (
    <div>
      <div className="flex items-center gap-1 mb-1.5">
        <span className="text-xs text-[var(--muted)]">Score Distribution</span>
      </div>
      <div className="flex h-3 rounded-full overflow-hidden">
        {high > 0 && (
          <div
            className="bg-[#437A22] transition-all"
            style={{ width: `${(high / total) * 100}%` }}
            title={`${high} high (80%+)`}
          />
        )}
        {mid > 0 && (
          <div
            className="bg-[#d4943a] transition-all"
            style={{ width: `${(mid / total) * 100}%` }}
            title={`${mid} medium (50-79%)`}
          />
        )}
        {low > 0 && (
          <div
            className="bg-[#A12C7B] transition-all"
            style={{ width: `${(low / total) * 100}%` }}
            title={`${low} low (<50%)`}
          />
        )}
      </div>
      <div className="flex items-center gap-3 mt-1.5">
        {high > 0 && (
          <span className="text-[10px] text-[#437A22] font-medium">{high} high</span>
        )}
        {mid > 0 && (
          <span className="text-[10px] text-[#d4943a] font-medium">{mid} medium</span>
        )}
        {low > 0 && (
          <span className="text-[10px] text-[#A12C7B] font-medium">{low} low</span>
        )}
      </div>
    </div>
  )
}

type SortField = 'name' | 'location' | 'score'
type SortDir = 'asc' | 'desc'

export default function BrandAuditPage({ params }: { params: Promise<{ brandEntityId: string }> }) {
  const { brandEntityId } = use(params)
  const [data, setData] = useState<BrandAuditResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [sortField, setSortField] = useState<SortField>('score')
  const [sortDir, setSortDir] = useState<SortDir>('asc')

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/audits?brand_entity_id=${brandEntityId}&t=${Date.now()}`)
      if (res.ok) {
        const json = await res.json()
        setData(json)
      }
    } catch {
      // silent
    } finally {
      setLoading(false)
    }
  }, [brandEntityId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortField(field)
      setSortDir(field === 'score' ? 'asc' : 'asc')
    }
  }

  const franchisees = data?.franchisees ?? []

  // Collect all unique field names across franchisees
  const auditFieldNames = useMemo(() => {
    const fieldSet = new Set<string>()
    for (const f of franchisees) {
      for (const key of Object.keys(f.fields)) {
        fieldSet.add(key)
      }
    }
    return Array.from(fieldSet).sort()
  }, [franchisees])

  // Separate boolean and non-boolean fields
  const booleanFields = useMemo(() => {
    return auditFieldNames.filter(name =>
      franchisees.some(f => typeof f.fields[name] === 'boolean')
    )
  }, [auditFieldNames, franchisees])

  const nonBooleanFields = useMemo(() => {
    return auditFieldNames.filter(name =>
      !franchisees.some(f => typeof f.fields[name] === 'boolean')
    )
  }, [auditFieldNames, franchisees])

  const sortedFranchisees = useMemo(() => {
    return [...franchisees].sort((a, b) => {
      let cmp = 0
      if (sortField === 'score') cmp = a.score - b.score
      else if (sortField === 'name') cmp = a.name.localeCompare(b.name)
      else if (sortField === 'location') cmp = (a.location || '').localeCompare(b.location || '')
      return sortDir === 'desc' ? -cmp : cmp
    })
  }, [franchisees, sortField, sortDir])

  const avgScore = franchisees.length > 0
    ? franchisees.reduce((sum, f) => sum + f.score, 0) / franchisees.length
    : 0
  const fullyCompliant = franchisees.filter(f => f.score === 100).length
  const needsAttention = franchisees.filter(f => f.score < 50).length

  function SortableHeader({ field, label, className = '' }: { field: SortField; label: string; className?: string }) {
    const active = sortField === field
    return (
      <th
        className={`px-3 py-2 text-left text-[var(--muted)] font-medium cursor-pointer hover:text-[var(--text)] transition-colors select-none ${className}`}
        onClick={() => handleSort(field)}
      >
        <span className="flex items-center gap-1">
          {label}
          <ArrowUpDown size={10} className={active ? 'text-[var(--accent)]' : 'opacity-30'} />
        </span>
      </th>
    )
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
          <Link href="/audits" className="text-sm text-white/70 hover:text-white transition-colors flex items-center gap-1.5">
            <ClipboardCheck size={14} />
            Audits
          </Link>
          {data && (
            <>
              <span className="text-white/20 select-none">/</span>
              <span className="text-sm text-white/70">{data.name}</span>
            </>
          )}
        </div>
        <nav className="flex items-center gap-6">
          <a href="/wiki" className="text-base text-white/70 font-medium hover:text-white transition-colors">Wiki</a>
          <a href="/kpis" className="text-base text-white/70 font-medium hover:text-white transition-colors">KPIs</a>
          <a href="/audits" className="text-base text-white font-medium">Audits</a>
          <a href="/reviews" className="text-base text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5"><Star size={15} />Reviews</a>
          <a href="/history" className="text-base text-white/70 font-medium hover:text-white transition-colors">History</a>
          <a href="/links" className="text-base text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5"><Link2 size={15} />Links</a>
          <button onClick={handleSignOut} className="text-base text-white/70 font-medium hover:text-white transition-colors">Sign out</button>
        </nav>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[90rem] mx-auto px-4 py-8 space-y-6">
          {/* Back + title */}
          <div className="flex items-center gap-3">
            <Link href="/audits" className="text-[var(--muted)] hover:text-[var(--text)] transition-colors">
              <ArrowLeft size={20} />
            </Link>
            <h1 className="text-2xl font-bold text-[var(--text)]">{data?.name ?? 'Loading…'}</h1>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-20">
              <div className="text-[var(--muted)] text-sm">Loading audit data…</div>
            </div>
          ) : !data || franchisees.length === 0 ? (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
              <ClipboardCheck size={48} className="mx-auto text-[var(--muted)] mb-4" />
              <h2 className="text-lg font-semibold text-[var(--text)] mb-2">No audit data</h2>
              <p className="text-sm text-[var(--muted)]">No franchisee audit data found for this brand.</p>
            </div>
          ) : (
            <>
              {/* Summary cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Users size={14} className="text-[var(--muted)]" />
                    <span className="text-sm text-[var(--muted)]">Franchisees</span>
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-[var(--text)]">{franchisees.length}</div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-1">
                    <BarChart3 size={14} className="text-[var(--muted)]" />
                    <span className="text-sm text-[var(--muted)]">Avg Score</span>
                  </div>
                  <div className="text-2xl font-bold tabular-nums" style={{ color: scoreColor(avgScore) }}>
                    {Math.round(avgScore)}%
                  </div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle size={14} className="text-[#437A22]" />
                    <span className="text-sm text-[var(--muted)]">Fully Compliant</span>
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-[#437A22]">{fullyCompliant}</div>
                </div>
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 shadow-sm">
                  <div className="flex items-center gap-1.5 mb-1">
                    <AlertTriangle size={14} className="text-[#A12C7B]" />
                    <span className="text-sm text-[var(--muted)]">Needs Attention</span>
                  </div>
                  <div className="text-2xl font-bold tabular-nums text-[#A12C7B]">{needsAttention}</div>
                </div>
              </div>

              {/* Distribution */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4 shadow-sm">
                <DistributionBar franchisees={franchisees} />
              </div>

              {/* Franchisee table */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden">
                <div className="px-5 py-4 border-b border-[var(--border)]">
                  <h2 className="text-base font-bold text-[var(--text)]">Franchisee Audit Results</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border)] bg-[var(--surface-hover)]">
                        <SortableHeader field="name" label="Franchisee" className="sticky left-0 bg-[var(--surface-hover)] z-10 min-w-[180px]" />
                        <SortableHeader field="location" label="Location" className="min-w-[140px]" />
                        <SortableHeader field="score" label="Score" className="min-w-[140px]" />
                        {booleanFields.map(field => (
                          <th key={field} className="px-2 py-2 text-center text-[var(--muted)] font-medium whitespace-nowrap min-w-[80px]">
                            {formatFieldName(field)}
                          </th>
                        ))}
                        {nonBooleanFields.map(field => (
                          <th key={field} className="px-2 py-2 text-left text-[var(--muted)] font-medium whitespace-nowrap min-w-[100px]">
                            {formatFieldName(field)}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sortedFranchisees.map((f, idx) => (
                        <tr
                          key={`${f.email}-${idx}`}
                          className={`border-b border-[var(--border)] hover:bg-[var(--surface-hover)] transition-colors ${rowTint(f.score)}`}
                        >
                          <td className="px-3 py-2 font-medium text-[var(--text)] sticky left-0 z-10" style={{ backgroundColor: 'inherit' }}>
                            <div>{f.name}</div>
                            {f.email && <div className="text-[10px] text-[var(--muted)] truncate max-w-[180px]">{f.email}</div>}
                          </td>
                          <td className="px-3 py-2 text-[var(--muted)]">{f.location || '—'}</td>
                          <td className="px-3 py-2">
                            <ScoreBar score={f.score} />
                          </td>
                          {booleanFields.map(field => (
                            <td key={field} className="px-2 py-2 text-center">
                              {f.fields[field] === true ? (
                                <CheckCircle size={14} className="inline-block text-[#437A22]" />
                              ) : f.fields[field] === false ? (
                                <XCircle size={14} className="inline-block text-[#A12C7B]" />
                              ) : (
                                <span className="text-[var(--muted)]">—</span>
                              )}
                            </td>
                          ))}
                          {nonBooleanFields.map(field => (
                            <td key={field} className="px-2 py-2 text-[var(--text)] whitespace-nowrap">
                              {f.fields[field] != null ? String(f.fields[field]) : '—'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

function formatFieldName(name: string): string {
  return name
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}
