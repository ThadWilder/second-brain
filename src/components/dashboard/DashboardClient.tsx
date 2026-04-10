'use client'

import { useState, useEffect, useCallback } from 'react'
import { StatusSummary } from './StatusSummary'
import { BrandCards } from './BrandCards'
import { EntityCards } from './EntityCards'
import { Priorities } from './Priorities'
import { Heatmap } from './Heatmap'
import { ClarificationBanner } from './ClarificationBanner'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { createClient } from '@/lib/supabase/browser'

const POLL_INTERVAL = 10_000 // 10 seconds

export function DashboardClient({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initialData)
  const [lastUpdated, setLastUpdated] = useState(new Date())

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

  // Fetch immediately on mount, then poll
  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [fetchData])

  // Also refresh when window regains focus
  useEffect(() => {
    const handleFocus = () => fetchData()
    window.addEventListener('focus', handleFocus)
    return () => window.removeEventListener('focus', handleFocus)
  }, [fetchData])

  const {
    stats, brands, people, vendors,
    escalatedTasks, regularTasks, staleFromYesterday,
    pendingResponses, clarifications,
    heatmapCells, heatmapDays, brandNames,
    allEntities,
  } = data

  return (
    <div className="min-h-screen bg-[#0f1117] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#2a2d3a] px-4 py-3 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-slate-200 font-semibold tracking-tight text-sm">DUMPBOX</span>
          <span className="text-xs text-slate-500">
            {new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </div>
        <div className="flex items-center gap-3">
          {stats.escalations > 0 && (
            <span className="text-xs bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded">
              {stats.escalations} escalation{stats.escalations !== 1 ? 's' : ''}
            </span>
          )}
          <a
            href="/wiki"
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Wiki
          </a>
          <span className="text-[10px] text-slate-600" title={lastUpdated.toLocaleTimeString()}>
            live
          </span>
          <button
            onClick={handleSignOut}
            className="text-xs text-slate-500 hover:text-slate-300 transition-colors"
          >
            Sign out
          </button>
        </div>
      </header>

      {/* Main layout */}
      <div className="flex-1 flex flex-col lg:flex-row gap-0 overflow-hidden">
        <div className="flex-1 overflow-y-auto">
          <div className="p-4 space-y-5">
            {/* Status + Heatmap */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Status</h2>
                <StatusSummary stats={stats} />
              </div>
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">Activity (14 days)</h2>
                <Heatmap data={heatmapCells} brands={brandNames} days={heatmapDays} />
              </div>
            </div>

            {/* Clarifications */}
            {clarifications.length > 0 && (
              <ClarificationBanner clarifications={clarifications} />
            )}

            {/* Priorities */}
            <div>
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
                Today's Priorities
              </h2>
              <Priorities
                escalated={escalatedTasks}
                needsResponse={pendingResponses}
                tasks={regularTasks}
                staleFromYesterday={staleFromYesterday}
              />
            </div>

            {/* Entity Cards */}
            <div className="space-y-5">
              <BrandCards brands={brands} />
              <EntityCards title="People" entities={people} type="contact" allEntities={allEntities} />
              <EntityCards title="Vendors" entities={vendors} type="vendor" allEntities={allEntities} />
            </div>
          </div>
        </div>

        {/* Chat Panel */}
        <div className="lg:w-[380px] border-t lg:border-t-0 lg:border-l border-[#2a2d3a] flex flex-col h-[500px] lg:h-auto">
          <div className="px-4 py-3 border-b border-[#2a2d3a] shrink-0">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">Chat</h2>
          </div>
          <div className="flex-1 min-h-0">
            <ChatPanel />
          </div>
        </div>
      </div>
    </div>
  )
}

// Type for all dashboard data
interface DashboardData {
  stats: { escalations: number; needs_response: number; open_tasks: number; closed_7d: number }
  brands: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null; health: 'green' | 'amber' | 'red' }>
  people: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null }>
  vendors: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null }>
  escalatedTasks: any[]
  regularTasks: any[]
  staleFromYesterday: any[]
  pendingResponses: Array<{ id: string; summary: string; created_at: string }>
  clarifications: Array<{ id: string; entity_id: string | null; question: string; context: string | null; field: string; suggestions: string[] | null }>
  heatmapCells: Array<{ brand_id: string; brand_name: string; date: string; count: number }>
  heatmapDays: string[]
  brandNames: string[]
  allEntities: any[]
}
