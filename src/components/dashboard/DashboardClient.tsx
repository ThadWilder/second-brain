'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import Image from 'next/image'
import { StatusSummary } from './StatusSummary'
import { BrandCards } from './BrandCards'
import { EntityCards } from './EntityCards'
import { Priorities } from './Priorities'
import { Heatmap } from './Heatmap'
import { ClarificationBanner } from './ClarificationBanner'
import { ChatInput } from '@/components/chat/ChatInput'
import { ChatMessage } from '@/components/chat/ChatMessage'
import { useToast } from '@/components/ui/Toast'
import { createClient } from '@/lib/supabase/browser'
import type { ChatMessage as ChatMessageType, Attachment, IngestResult } from '@/types'

const POLL_INTERVAL = 10_000

/** Simple heuristic: if the text looks like a question, route to chat; otherwise ingest. */
function looksLikeQuestion(text: string): boolean {
  const trimmed = text.trim()
  if (trimmed.endsWith('?')) return true
  const lower = trimmed.toLowerCase()
  const questionStarts = ['what', 'who', 'where', 'when', 'why', 'how', 'is ', 'are ', 'can ', 'do ', 'does ', 'did ', 'will ', 'should ', 'could ', 'would ', 'show me', 'tell me', 'list ']
  return questionStarts.some((q) => lower.startsWith(q))
}

function buildIngestSummary(result: IngestResult): string {
  const parts: string[] = []
  if (result.tasks_created > 0) parts.push(`${result.tasks_created} task${result.tasks_created !== 1 ? 's' : ''}`)
  if (result.decisions_created > 0) parts.push(`${result.decisions_created} decision${result.decisions_created !== 1 ? 's' : ''}`)
  if (result.pending_responses_created > 0) parts.push(`${result.pending_responses_created} pending response${result.pending_responses_created !== 1 ? 's' : ''}`)
  if (result.entities_created > 0) parts.push(`${result.entities_created} new entit${result.entities_created !== 1 ? 'ies' : 'y'}`)
  if (result.entities_resolved > 0) parts.push(`linked to ${result.entities_resolved} entit${result.entities_resolved !== 1 ? 'ies' : 'y'}`)
  if (parts.length === 0) return '🥟 Dumpling processed — no new items extracted.'
  return `🥟 Dumpling processed — ${parts.join(', ')}.`
}

export function DashboardClient({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState<DashboardData>(initialData)
  const [lastUpdated, setLastUpdated] = useState(new Date())
  const { showToast } = useToast()

  // Chat state (inline, not sidebar)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessageType[]>([])
  const [isStreaming, setIsStreaming] = useState(false)
  const [isIngesting, setIsIngesting] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  // Auto-scroll when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

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

  // Initialize chat session on mount
  useEffect(() => {
    fetch('/api/chat/session', { method: 'POST' })
      .then((res) => res.json())
      .then((data) => {
        if (data.conversation_id) setConversationId(data.conversation_id)
      })
      .catch(() => {})
  }, [])

  /** Send to ingest API */
  async function sendToIngest(text: string, attachments?: Attachment[]) {
    setIsIngesting(true)
    try {
      const res = await fetch('/api/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text,
          source: 'paste',
          attachments: attachments ?? [],
        }),
      })
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Ingest failed' }))
        showToast({ type: 'error', message: err.error || 'Ingest failed' })
        return
      }
      const result: IngestResult = await res.json()
      if (result.tasks_created !== undefined) {
        const summary = buildIngestSummary(result)
        showToast({
          type: 'success',
          message: summary,
          action: result.tasks_created > 0
            ? { label: 'View', onClick: () => {
                document.getElementById('priorities-section')?.scrollIntoView({ behavior: 'smooth' })
              }}
            : result.decisions_created > 0
            ? { label: 'View', onClick: () => {
                document.getElementById('entity-cards-section')?.scrollIntoView({ behavior: 'smooth' })
              }}
            : undefined,
        })
        // Refresh dashboard data after ingest
        fetchData()
      }
    } catch {
      showToast({ type: 'error', message: 'Failed to submit — check your connection.' })
    } finally {
      setIsIngesting(false)
    }
  }

  /** Send to chat API */
  async function sendToChat(text: string, attachments?: Attachment[]) {
    if (!conversationId || isStreaming) return

    const userMsg: ChatMessageType = {
      role: 'user',
      content: text,
      attachments,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, userMsg])

    const streamingMsg: ChatMessageType = {
      role: 'assistant',
      content: '',
      isStreaming: true,
      created_at: new Date().toISOString(),
    }
    setMessages((prev) => [...prev, streamingMsg])
    setIsStreaming(true)

    abortRef.current = new AbortController()

    try {
      const res = await fetch('/api/chat/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation_id: conversationId,
          message: text,
          attachments: attachments ?? [],
        }),
        signal: abortRef.current.signal,
      })

      if (!res.body) throw new Error('No response stream')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const event = JSON.parse(line.slice(6))
              handleSSEEvent(event)
            } catch {
              // ignore parse errors
            }
          }
        }
      }
    } catch (err) {
      if ((err as Error).name !== 'AbortError') {
        setMessages((prev) => prev.filter((m) => !m.isStreaming))
      }
    } finally {
      setIsStreaming(false)
      setMessages((prev) =>
        prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
      )
    }
  }

  function handleSSEEvent(event: { type: string; [key: string]: unknown }) {
    switch (event.type) {
      case 'content_delta':
        setMessages((prev) => {
          const last = prev[prev.length - 1]
          if (!last || last.role !== 'assistant') return prev
          return [
            ...prev.slice(0, -1),
            { ...last, content: last.content + (event.delta as string) },
          ]
        })
        break
      case 'message_stop':
        setMessages((prev) =>
          prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m))
        )
        break
      case 'error':
        showToast({ type: 'error', message: event.message as string })
        break
    }
  }

  /** Route message: question → chat, raw content → ingest */
  function handleSend(text: string, attachments?: Attachment[]) {
    if (looksLikeQuestion(text) && !attachments?.length) {
      sendToChat(text, attachments)
    } else {
      sendToIngest(text, attachments)
    }
  }

  function dismissMessage(index: number) {
    setMessages((prev) => prev.filter((_, i) => i !== index))
  }

  const {
    stats, brands, people, vendors, departments, franchisees, vendorTeam, freelancers,
    escalatedTasks, regularTasks, staleFromYesterday,
    pendingResponses, clarifications,
    heatmapCells, heatmapDays, brandNames,
    allEntities,
    entityRelationships,
  } = data

  // Show last 5 assistant responses for the inline response row
  const recentResponses = messages
    .filter((m) => m.role === 'assistant' && m.content && !m.isStreaming)
    .slice(-5)

  // Active streaming message
  const streamingMessage = messages.find((m) => m.isStreaming)

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
              onRefresh={fetchData}
            />
          </div>

          {/* ── Entity Cards ── */}
          <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-6 shadow-sm space-y-6" id="entity-cards-section">
            <BrandCards brands={brands} />
            <EntityCards title="Internal Team" entities={departments} type="department" allEntities={allEntities} />
            <EntityCards title="Franchisees" entities={franchisees} type="franchisee" allEntities={allEntities} />
            <EntityCards title="People" entities={people} type="contact" allEntities={allEntities} entityRelationships={entityRelationships} onRefresh={fetchData} />
            <EntityCards title="Vendors" entities={vendors} type="vendor" allEntities={allEntities} />
            <EntityCards title="Vendor Team" entities={vendorTeam} type="vendor_team" allEntities={allEntities} />
            <EntityCards title="Freelancers" entities={freelancers} type="freelancer" allEntities={allEntities} />
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
  departments: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null }>
  franchisees: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null }>
  vendorTeam: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null }>
  freelancers: Array<{ entity: any; open_tasks: number; escalated_tasks: number; last_activity: string | null }>
  escalatedTasks: any[]
  regularTasks: any[]
  staleFromYesterday: any[]
  pendingResponses: Array<{ id: string; summary: string; created_at: string }>
  clarifications: Array<{ id: string; entity_id: string | null; entry_id: string | null; question: string; context: string | null; field: string; suggestions: string[] | null }>
  heatmapCells: Array<{ brand_id: string; brand_name: string; date: string; count: number }>
  heatmapDays: string[]
  brandNames: string[]
  allEntities: any[]
  entityRelationships: Array<{ from_entity_id: string; to_entity_id: string; relationship: string }>
}
