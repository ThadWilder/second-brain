'use client'

import { useState, useEffect, useCallback } from 'react'
import { Menu, X as XIcon } from 'lucide-react'
import Image from 'next/image'
import { StatusSummary } from './StatusSummary'
import { EditEntityModal } from './EditEntityModal'
import { BrandCards } from './BrandCards'
import { EntityCards } from './EntityCards'
import { PeopleSection } from './PeopleSection'
import { Priorities } from './Priorities'
import { Heatmap } from './Heatmap'
import { ClarificationBanner } from './ClarificationBanner'
import { ChatInput } from '@/components/chat/ChatInput'
import { ChatPanel } from '@/components/chat/ChatPanel'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/browser'
import { useChat } from '@/hooks/useChat'
import { Clock, Link2, MessageCircle, Tag } from 'lucide-react'
import { AutoLinkText } from '@/components/ui/AutoLinkText'

const POLL_INTERVAL = 10_000

export function DashboardClient({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initialData)
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const [chatOpen, setChatOpen] = useState(false)
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
    escalatedTasks, overdueTasks, regularTasks, inboxTasks, watchingTasks,
    overdueFollowUps, staleTracking,
    pendingResponses, needsReplyTaskIds, clarifications,
    consolidationTaskIds, commentCounts,
    heatmapCells, heatmapDays, brandNames,
    allEntities,
    entityRelationships,
  } = data

  return (
    <div className="min-h-screen flex flex-col">
      {/* Header */}
      <header className="bg-[#2c2014] px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between shrink-0">
        <div className="flex items-center gap-2 sm:gap-3">
          <a href="/" className="flex items-center gap-2 sm:gap-3 hover:opacity-80 transition-opacity">
            <Image src="/logo-icon-white.png" alt="Dumpbox" width={28} height={28} />
            <span className="text-white font-bold tracking-tight text-base sm:text-lg">Dumpbox</span>
          </a>
          <span className="text-white/20 select-none hidden sm:inline">/</span>
          <span className="text-xs sm:text-sm text-white/70 hidden sm:inline">
            {new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </span>
        </div>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-6">
          <a href="/projects" className="text-base text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5">Projects</a>
          <a href="/resources" className="text-base text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5">Resources</a>
          <button
            onClick={() => setChatOpen(true)}
            className="text-base text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5"
          >
            <MessageCircle size={15} />
            Chat
          </button>
          <span className="text-white/10 select-none">|</span>
          <a href="/history" className="text-sm text-white/50 font-medium hover:text-white transition-colors flex items-center gap-1.5"><Clock size={13} />History</a>
          <button
            onClick={handleSignOut}
            className="text-sm text-white/50 font-medium hover:text-white transition-colors"
          >
            Sign out
          </button>
        </nav>

        {/* Mobile hamburger */}
        <div className="md:hidden flex items-center gap-3">
          {stats.escalations > 0 && (
            <span className="text-sm text-orange-300 font-medium">{stats.escalations}🔥</span>
          )}
          <MobileMenu onSignOut={handleSignOut} />
        </div>
      </header>

      {/* Main content — single scrollable column */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-3 sm:px-4 py-4 sm:py-8 space-y-4 sm:space-y-8">
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
                        <AutoLinkText text={msg.content} />
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
                    <AutoLinkText text={streamingMessage.content} />
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
                <h2 className="text-base font-bold text-[var(--text)] mb-3 pb-2 border-b-2 border-[var(--accent)] inline-block">Status</h2>
                <StatusSummary stats={stats} />
              </div>
              <div className="hidden lg:block">
                <h2 className="text-base font-bold text-[var(--text)] mb-3 pb-2 border-b-2 border-[var(--accent)] inline-block">Activity (10 days)</h2>
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
            <h2 className="text-base font-bold text-[var(--text)] mb-4 pb-2 border-b-2 border-[var(--accent)] inline-block">
              Today&apos;s Priorities
            </h2>
            <Priorities
              escalated={escalatedTasks}
              needsResponse={pendingResponses}
              needsReplyTaskIds={new Set(needsReplyTaskIds ?? [])}
              overdueTasks={overdueTasks}
              tasks={regularTasks}
              inboxTasks={inboxTasks}
              watchingTasks={watchingTasks ?? []}
              overdueFollowUps={overdueFollowUps ?? []}
              staleTracking={staleTracking ?? []}
              consolidationTaskIds={new Set(consolidationTaskIds ?? [])}
              commentCounts={commentCounts ?? {}}
              brands={brands}
              onRefresh={fetchData}
            />
          </div>

          {/* ── Directory ── */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 shadow-sm space-y-7" id="entity-cards-section">
            <h2 className="text-lg font-bold text-[var(--text)]">Directory</h2>
            <BrandCards brands={brands} defaultCollapsed />
            <EntityCards title="Internal Team" entities={departments} type="department" allEntities={allEntities} defaultCollapsed />
            <PeopleSection
              contacts={people}
              vendorTeam={vendorTeam}
              freelancers={freelancers}
              allEntities={allEntities}
              entityRelationships={entityRelationships}
              onRefresh={fetchData}
            />
            <EntityCards title="Franchisees" entities={franchisees} type="franchisee" allEntities={allEntities} entityRelationships={entityRelationships} onRefresh={fetchData} defaultCollapsed />
            <EntityCards title="Vendors" entities={vendors} type="vendor" allEntities={allEntities} defaultCollapsed />
            <TopicsList entities={allEntities.filter((e: any) => e.type === 'topic')} allEntities={allEntities} onRefresh={fetchData} />
          </div>
        </div>
      </div>

      {/* Floating chat button (mobile) */}
      {!chatOpen && (
        <button
          onClick={() => setChatOpen(true)}
          className="md:hidden fixed bottom-6 right-6 w-14 h-14 rounded-full bg-[var(--accent)] text-white shadow-lg flex items-center justify-center hover:bg-[var(--accent-hover)] transition-colors z-40"
        >
          <MessageCircle size={24} />
        </button>
      )}

      {/* Chat drawer */}
      {chatOpen && (
        <>
          <div className="fixed inset-0 bg-black/30 z-40" onClick={() => setChatOpen(false)} />
          <div className="fixed top-0 right-0 bottom-0 w-full sm:w-[420px] bg-[var(--surface)] border-l border-[var(--border)] shadow-xl z-50 flex flex-col">
            <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--border)]">
              <h2 className="text-sm font-semibold text-[var(--text)]">Ask the Chef</h2>
              <button
                onClick={() => setChatOpen(false)}
                className="p-1 text-[var(--muted)] hover:text-[var(--text)] transition-colors"
              >
                <XIcon size={18} />
              </button>
            </div>
            <div className="flex-1 min-h-0">
              <ChatPanel />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function TopicsList({ entities, allEntities, onRefresh }: { entities: any[]; allEntities: any[]; onRefresh: () => void }) {
  const [expanded, setExpanded] = useState(false)
  const [editTarget, setEditTarget] = useState<any>(null)

  if (!entities.length) return null

  return (
    <>
      <div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-2 text-sm text-[var(--muted)] hover:text-[var(--text)] transition-colors"
        >
          <span className="font-mono text-xs">{expanded ? '▼' : '▶'}</span>
          <span className="font-semibold uppercase tracking-wider">Topics</span>
          <span className="text-xs">{entities.length}</span>
        </button>
        {expanded && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {entities.sort((a: any, b: any) => a.name.localeCompare(b.name)).map((e: any) => (
              <button
                key={e.id}
                onClick={() => setEditTarget(e)}
                className="text-xs px-2 py-1 rounded-full border border-[var(--border)] bg-[var(--surface)] text-[var(--text)] hover:border-[var(--accent)] transition-colors"
              >
                {e.name}
              </button>
            ))}
          </div>
        )}
      </div>
      {editTarget && (
        <EditEntityModal
          entity={editTarget}
          allEntities={allEntities}
          onClose={() => setEditTarget(null)}
          onSaved={() => { setEditTarget(null); onRefresh() }}
        />
      )}
    </>
  )
}

function MobileMenu({ onSignOut }: { onSignOut: () => void }) {
  const [open, setOpen] = useState(false)
  const links = [
    { href: '/projects', label: 'Projects' },
    { href: '/resources', label: 'Resources' },
    { href: '/history', label: 'History' },
    { href: '/tags', label: 'Tags' },
  ]
  return (
    <>
      <button onClick={() => setOpen(!open)} className="text-white p-1">
        {open ? <XIcon size={22} /> : <Menu size={22} />}
      </button>
      {open && (
        <div className="absolute top-full left-0 right-0 bg-[#2c2014] border-t border-white/10 z-50 px-4 py-3 space-y-1">
          {links.map((l) => (
            <a key={l.href} href={l.href} className="block py-2 text-base text-white/80 hover:text-white">{l.label}</a>
          ))}
          <button onClick={onSignOut} className="block py-2 text-base text-white/50 hover:text-white w-full text-left">Sign out</button>
        </div>
      )}
    </>
  )
}

// Type for all dashboard data
interface DashboardData {
  stats: { escalations: number; needs_response: number; open_tasks: number; closed_7d: number; waiting_on: number; tracking: number; unresolved_comments: number }
  brands: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null; health: 'green' | 'amber' | 'red' }>
  people: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null }>
  vendors: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null }>
  departments: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null }>
  franchisees: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null }>
  vendorTeam: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null }>
  freelancers: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null }>
  escalatedTasks: any[]
  overdueTasks: any[]
  regularTasks: any[]
  inboxTasks: any[]
  watchingTasks: any[]
  overdueFollowUps: any[]
  staleTracking: any[]
  pendingResponses: Array<{ id: string; summary: string; created_at: string }>
  clarifications: Array<{ id: string; entity_id: string | null; entry_id: string | null; question: string; context: string | null; field: string; suggestions: string[] | null }>
  consolidationSuggestions: Array<{ id: string; new_task_id: string; existing_task_id: string; merged_description: string; reason: string; created_at: string }>
  needsReplyTaskIds: string[]
  consolidationTaskIds: string[]
  commentCounts: Record<string, number>
  heatmapCells: Array<{ brand_id: string; brand_name: string; date: string; count: number }>
  heatmapDays: string[]
  brandNames: string[]
  allEntities: any[]
  entityRelationships: Array<{ from_entity_id: string; to_entity_id: string; relationship: string }>
}
