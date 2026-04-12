'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { Clock, Search, ChevronDown, ChevronUp, Mail, MessageSquare, ClipboardPaste, Mic, Eye, Link2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/browser'
import { AutoLinkText } from '@/components/ui/AutoLinkText'
import { LinkChips } from '@/components/ui/LinkChips'

interface HistoryEntity {
  id: string
  name: string
  type: string
  relationship: string
}

interface HistoryEntry {
  id: string
  subject: string | null
  sender: string | null
  source: string
  snippet: string
  links: string[]
  created_at: string
  entities: HistoryEntity[]
  task_count: number
}

interface HistoryResponse {
  entries: HistoryEntry[]
  total: number
  page: number
  limit: number
  hasMore: boolean
}

const TYPE_PILL_STYLES: Record<string, string> = {
  brand: 'bg-blue-50 text-blue-700 border-blue-200',
  contact: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  vendor: 'bg-purple-50 text-purple-700 border-purple-200',
  department: 'bg-amber-50 text-amber-700 border-amber-200',
  franchisee: 'bg-orange-50 text-orange-700 border-orange-200',
  vendor_team: 'bg-violet-50 text-violet-700 border-violet-200',
  freelancer: 'bg-teal-50 text-teal-700 border-teal-200',
  topic: 'bg-gray-50 text-gray-600 border-gray-200',
}

const SOURCE_ICONS: Record<string, { icon: typeof Mail; label: string }> = {
  email: { icon: Mail, label: 'Email' },
  chat: { icon: MessageSquare, label: 'Chat' },
  paste: { icon: ClipboardPaste, label: 'Paste' },
  meeting_notes: { icon: Mic, label: 'Meeting' },
}

function formatDateET(dateStr: string): string {
  const d = new Date(dateStr)
  return d.toLocaleString('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }) + ' ET'
}

function parseSenderName(sender: string | null): { name: string; email: string } {
  if (!sender) return { name: '', email: '' }
  // Format: "Name <email>" or just "email"
  const match = sender.match(/^(.+?)\s*<([^>]+)>$/)
  if (match) return { name: match[1].trim().replace(/^"|"$/g, ''), email: match[2] }
  return { name: '', email: sender }
}

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [page, setPage] = useState(1)
  const [hasMore, setHasMore] = useState(false)
  const [total, setTotal] = useState(0)
  const [search, setSearch] = useState('')
  const [searchInput, setSearchInput] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [expandedContent, setExpandedContent] = useState<Record<string, string>>({})

  const fetchHistory = useCallback(async (pageNum: number, query: string, append: boolean) => {
    if (append) setLoadingMore(true); else setLoading(true)
    try {
      const params = new URLSearchParams({ page: String(pageNum), limit: '20' })
      if (query) params.set('q', query)
      const res = await fetch(`/api/history?${params}`)
      if (!res.ok) return
      const data: HistoryResponse = await res.json()
      setEntries(prev => append ? [...prev, ...data.entries] : data.entries)
      setHasMore(data.hasMore)
      setTotal(data.total)
      setPage(pageNum)
    } finally {
      setLoading(false)
      setLoadingMore(false)
    }
  }, [])

  useEffect(() => {
    fetchHistory(1, search, false)
  }, [search, fetchHistory])

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault()
    setSearch(searchInput)
  }

  const handleLoadMore = () => {
    fetchHistory(page + 1, search, true)
  }

  const handleSignOut = async () => {
    const supabase = createClient()
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  const toggleExpand = async (entryId: string) => {
    if (expandedId === entryId) {
      setExpandedId(null)
      return
    }
    setExpandedId(entryId)
    // Load full content if not already cached
    if (!expandedContent[entryId]) {
      try {
        const res = await fetch(`/api/entries/${entryId}`)
        if (res.ok) {
          const data = await res.json()
          setExpandedContent(prev => ({ ...prev, [entryId]: data.entry.raw_text }))
        }
      } catch {
        // silent
      }
    }
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
            <Clock size={14} />
            History
          </span>
        </div>
        <nav className="flex items-center gap-6">
          <a href="/wiki" className="text-base text-white/70 font-medium hover:text-white transition-colors">Wiki</a>
          <a href="/kpis" className="text-base text-white/70 font-medium hover:text-white transition-colors">KPIs</a>
          <a href="/tracking" className="text-base text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5">🍳 The Kitchen</a>
          <a href="/history" className="text-base text-white font-medium">History</a>
          <a href="/links" className="text-base text-white/70 font-medium hover:text-white transition-colors flex items-center gap-1.5"><Link2 size={15} />Links</a>
          <button onClick={handleSignOut} className="text-base text-white/70 font-medium hover:text-white transition-colors">Sign out</button>
        </nav>
      </header>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-4 py-8 space-y-6">
          {/* Title + Search */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h1 className="text-xl font-bold text-[var(--text)]">Dumpling History</h1>
              {!loading && (
                <p className="text-sm text-[var(--muted)] mt-0.5">
                  {total} dumpling{total !== 1 ? 's' : ''} ingested
                </p>
              )}
            </div>
            <form onSubmit={handleSearch} className="flex gap-2">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
                <input
                  type="text"
                  value={searchInput}
                  onChange={e => setSearchInput(e.target.value)}
                  placeholder="Search dumplings..."
                  className="pl-9 pr-3 py-2 text-sm bg-[var(--surface)] border border-[var(--border)] rounded-lg
                             text-[var(--text)] placeholder:text-[var(--muted)]
                             focus:outline-none focus:ring-2 focus:ring-[var(--accent)] focus:border-transparent
                             w-64"
                />
              </div>
              <button
                type="submit"
                className="px-3 py-2 text-sm font-medium bg-[var(--accent)] text-white rounded-lg
                           hover:bg-[var(--accent-hover)] transition-colors"
              >
                Search
              </button>
            </form>
          </div>

          {/* Loading state */}
          {loading && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
              <p className="text-sm text-[var(--muted)]">Loading dumplings...</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && entries.length === 0 && (
            <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-12 text-center">
              <p className="text-[var(--muted)]">
                {search ? `No dumplings matching "${search}"` : 'No dumplings yet'}
              </p>
            </div>
          )}

          {/* Entry cards */}
          {!loading && entries.length > 0 && (
            <div className="space-y-3">
              {entries.map(entry => {
                const { name: senderName, email: senderEmail } = parseSenderName(entry.sender)
                const sourceInfo = SOURCE_ICONS[entry.source] ?? SOURCE_ICONS.paste
                const SourceIcon = sourceInfo.icon
                const isExpanded = expandedId === entry.id
                const brands = entry.entities.filter(e => e.type === 'brand')
                const otherEntities = entry.entities.filter(e => e.type !== 'brand')

                return (
                  <div
                    key={entry.id}
                    className="bg-[var(--surface)] border border-[var(--border)] rounded-xl overflow-hidden
                               hover:border-[var(--accent)]/30 transition-colors"
                  >
                    <button
                      onClick={() => toggleExpand(entry.id)}
                      className="w-full text-left px-5 py-5 focus:outline-none"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 min-w-0">
                          {/* Subject line */}
                          <div className="flex items-center gap-2 mb-1">
                            <SourceIcon size={15} className="text-[var(--muted)] shrink-0" />
                            <h3 className="text-base font-semibold text-[var(--text)] truncate">
                              {entry.subject || 'No subject'}
                            </h3>
                          </div>

                          {/* Sender + date */}
                          <div className="flex items-center gap-2 text-xs text-[var(--muted)] mb-2">
                            {(senderName || senderEmail) && (
                              <>
                                <span className="truncate max-w-[200px]">
                                  {senderName || senderEmail}
                                </span>
                                <span className="text-[var(--border)]">&middot;</span>
                              </>
                            )}
                            <span className="shrink-0">{formatDateET(entry.created_at)}</span>
                            {entry.task_count > 0 && (
                              <>
                                <span className="text-[var(--border)]">&middot;</span>
                                <span className="shrink-0">
                                  {entry.task_count} task{entry.task_count !== 1 ? 's' : ''}
                                </span>
                              </>
                            )}
                          </div>

                          {/* Snippet */}
                          {!isExpanded && (
                            <p className="text-xs text-[var(--muted)] line-clamp-2 leading-relaxed">
                              <AutoLinkText text={entry.snippet} />
                            </p>
                          )}

                          {/* Entity pills */}
                          {(brands.length > 0 || otherEntities.length > 0) && (
                            <div className="flex flex-wrap gap-1.5 mt-2">
                              {brands.map(e => (
                                <span
                                  key={e.id}
                                  className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_PILL_STYLES[e.type] ?? TYPE_PILL_STYLES.topic}`}
                                >
                                  {e.name}
                                </span>
                              ))}
                              {otherEntities.slice(0, 5).map(e => (
                                <span
                                  key={e.id}
                                  className={`text-xs px-2 py-0.5 rounded-full border ${TYPE_PILL_STYLES[e.type] ?? TYPE_PILL_STYLES.topic}`}
                                >
                                  {e.name}
                                </span>
                              ))}
                              {otherEntities.length > 5 && (
                                <span className="text-xs px-2 py-0.5 rounded-full border border-[var(--border)] text-[var(--muted)]">
                                  +{otherEntities.length - 5}
                                </span>
                              )}
                            </div>
                          )}
                        </div>

                        {/* Expand/collapse chevron */}
                        <div className="shrink-0 mt-1">
                          {isExpanded ? (
                            <ChevronUp size={16} className="text-[var(--muted)]" />
                          ) : (
                            <ChevronDown size={16} className="text-[var(--muted)]" />
                          )}
                        </div>
                      </div>
                    </button>

                    {/* Expanded content */}
                    {isExpanded && (
                      <div className="px-5 pb-4 border-t border-[var(--border)]">
                        <div className="pt-3">
                          {senderName && senderEmail && (
                            <p className="text-xs text-[var(--muted)] mb-2">
                              From: {senderName} &lt;{senderEmail}&gt;
                            </p>
                          )}
                          <div className="text-sm text-[var(--text)] whitespace-pre-wrap break-words leading-relaxed max-h-96 overflow-y-auto">
                            <AutoLinkText text={expandedContent[entry.id] ?? entry.snippet} />
                          </div>
                          <LinkChips links={entry.links} />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}

          {/* Load more */}
          {hasMore && !loading && (
            <div className="text-center pt-2 pb-8">
              <button
                onClick={handleLoadMore}
                disabled={loadingMore}
                className="px-6 py-2.5 text-sm font-medium bg-[var(--surface)] border border-[var(--border)]
                           text-[var(--text)] rounded-lg hover:bg-[var(--surface-hover)] transition-colors
                           disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loadingMore ? 'Loading...' : 'Load more dumplings'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
