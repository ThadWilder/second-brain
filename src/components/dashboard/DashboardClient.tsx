'use client'

import { useState, useEffect, useCallback } from 'react'
import Image from 'next/image'
import { StatusSummary } from './StatusSummary'
import { BrandCards } from './BrandCards'
import { EntityCards } from './EntityCards'
import { PeopleSection } from './PeopleSection'
import { Priorities } from './Priorities'
import { Heatmap } from './Heatmap'
import { ClarificationBanner } from './ClarificationBanner'
import { ChatInput } from '@/components/chat/ChatInput'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/browser'
import { useChat } from '@/hooks/useChat'
import { BarChart3, Clock } from 'lucide-react'

const POLL_INTERVAL = 10_000

export function DashboardClient({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initialData)
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const { showToast } = useToast()

  const handleSignOut = useCallback(async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }, [])

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/dashboard?t=${Date.now()}`)
      if (res.ok) {
        const newData = await res.json()
        setData(newData)
        setLastUpdated(new Date())
      }
    } catch {
      // silent — keep showing stale data
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchData])

  useEffect(() => {
    const handleFocus = () => fetchData()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetchData])

  const {
    messages,
    isStreaming,
    isIngesting,
    streamingMessage,
    recentResponses,
    messagesEndRef,
    handleSend,
    dismissMessage,
  } = useChat({ showToast, fetchData })

  const {
    stats, brands, people, vendors, departments, franchisees, vendorTeam, freelancers,
    escalatedTasks, regularTasks, staleFromYesterday,
    pendingResponses, clarifications,
    consolidationTaskIds,
    heatmapCells, heatmapDays, brandNames,
    allEntities,
    entityRelationships,
  } = data

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-[#2c2014] px-6 py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-3">
          <Image src="/logo-icon-white.png" alt="Dumpbox" width={32} height={32} />
          <span className="text-white font-bold tracking-tight text-lg">Dumpbox</span>
          <span className="text-white/20 select-none">/</span>
          <span className="text-sm text-white/70">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </div>
        <nav className="flex items-center gap-6">
          {stats.escalations > 0 && (
            <span className="text-sm text-orange-300 font-medium">
              {stats.escalations} escalation{stats.escalations !== 1 ? 's' : ''}
            </span>
          )}
          <a
            href="/wiki"
            className="text-sm text-white/70 font-medium hover:text-white transition-colors"
          >
            Wiki
          </a>
          <a
            href="/kpis"
            className="text-sm text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5"
          >
            <BarChart3 size={14} />
            KPIs
          </a>
          <a
            href="/history"
            className="text-sm text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5"
          >
            <Clock size={14} />
            History
          </a>
          <button
            onClick={handleSignOut}
            className="text-sm text-white/70 font-medium hover:text-white transition-colors"
          >
            Sign out
          </button>
        </nav>
      </header>

      {/* Main content — single scrollable column */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
          {/* ── Hero dump box ── */}
          <div className="bg-[var(--surface)] border border-[var(--border)] border-l-[4px] border-l-[var(--accent)] rounded-xl px-3 py-3 shadow-sm">
            <ChatInput
              onSend={handleSend}
              disabled={isStreaming || isIngesting}
              placeholder="throw it in the basket 🥟"
              autoFocus
              large
            />
            {(isStreaming || isIngesting) && (
              <p className="text-xs text-[var(--muted)] mt-2 text-center">
                {isIngesting ? 'steaming your dumpling...' : 'thinking...'}
              </p>
            )}
          </div>

          {/* ── Inline responses ── */}
          {(streamingMessage || recentResponses.length > 0) && (
            <div className="space-y-2">
              {recentResponses.map((msg, i) => {
                const globalIndex = messages.indexOf(msg)
                return (
                  <div key={globalIndex} className="group relative">
                    <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3">
                      <p className="text-sm text-[var(--text)] whitespace-pre-wrap break-words line-clamp-4">
                        {msg.content}
                      </p>
                      {msg.created_at && (
                        <p className="text-[10px] text-[var(--muted)] mt-1.5">
                          {new Date(msg.created_at).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => dismissMessage(globalIndex)}
                      className="absolute top-2 right-2 w-5 h-5 rounded-full bg-[var(--border)] text-[var(--muted)]
                                 hover:text-[var(--text)] flex items-center justify-center text-xs
                                 opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Dismiss"
                    >
                      &times;
                    </button>
                  </div>
                )
              })}
              {streamingMessage && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-3">
                  <p className="text-sm text-[var(--text)] whitespace-pre-wrap break-words streaming-cursor">
                    {streamingMessage.content}
                  </p>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>
          )}

          {/* ── Status + Heatmap ── */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 shadow-sm">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div>
                <h2 className="text-sm font-bold text-[var(--text)] mb-3 pb-2 border-b-2 border-[var(--accent)] inline-block">Status</h2>
                <StatusSummary stats={stats} />
              </div>
              <div>
                <h2 className="text-sm font-bold text-[var(--text)] mb-3 pb-2 border-b-2 border-[var(--accent)] inline-block">Activity (10 days)</h2>
                <Heatmap data={heatmapCells} brands={brandNames} days={heatmapDays} />
              </div>
            </div>
          </div>

          {/* Clarifications */}
          {clarifications.length > 0 && (
            <ClarificationBanner clarifications={clarifications} />
          )}

          {/* ── Priorities ── */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 shadow-sm" id="priorities-section">
            <h2 className="text-sm font-bold text-[var(--text)] mb-4 pb-2 border-b-2 border-[var(--accent)] inline-block">
              Today&apos;s Priorities
            </h2>
            <Priorities
              escalated={escalatedTasks}
              needsResponse={pendingResponses}
              tasks={regularTasks}
              staleFromYesterday={staleFromYesterday}
              consolidationTaskIds={new Set(consolidationTaskIds ?? [])}
              onRefresh={fetchData}
            />
          </div>

          {/* ── Entity Cards ── */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 shadow-sm space-y-6" id="entity-cards-section">
            <BrandCards brands={brands} />
            <EntityCards title="Internal Team" entities={departments} type="department" allEntities={allEntities} />
            <PeopleSection
              contacts={people}
              vendorTeam={vendorTeam}
              freelancers={freelancers}
              allEntities={allEntities}
              entityRelationships={entityRelationships}
              onRefresh={fetchData}
            />
            <EntityCards title="Franchisees" entities={franchisees} type="franchisee" allEntities={allEntities} defaultCollapsed />
            <EntityCards title="Vendors" entities={vendors} type="vendor" allEntities={allEntities} />
          </div>
        </div>
      </div>
    </div>
  )
}

// Type for all dashboard data
interface DashboardData {
  stats: { escalations: number; needs_response: number; open_tasks: number; closed_7d: number; waiting_on: number }
  brands: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null; health: 'green' | 'amber' | 'red' }>
  people: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null }>
  vendors: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null }>
  departments: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null }>
  franchisees: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null }>
  vendorTeam: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null }>
  freelancers: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null }>
  escalatedTasks: any[]
  regularTasks: any[]
  staleFromYesterday: any[]
  pendingResponses: Array<{ id: string; summary: string; created_at: string }>
  clarifications: Array<{ id: string; entity_id: string | null; entry_id: string | null; question: string; context: string | null; field: string; suggestions: string[] | null }>
  consolidationSuggestions: Array<{ id: string; new_task_id: string; existing_task_id: string; merged_description: string; reason: string; created_at: string }>
  consolidationTaskIds: string[]
  heatmapCells: Array<{ brand_id: string; brand_name: string; date: string; count: number }>
  heatmapDays: string[]
  brandNames: string[]
  allEntities: any[]
  entityRelationships: Array<{ from_entity_id: string; to_entity_id: string; relationship: string }>
}
