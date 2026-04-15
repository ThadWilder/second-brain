'use client'

import { useState, useEffect, useMemo } from 'react'
import Image from 'next/image'
import { ChevronDown, ChevronRight, Search, X } from 'lucide-react'

// ─── Types ───────────────────────────────────────────

interface WatchingTask {
  id: string
  description: string
  status: string
  waiting_on: string | null
  tracked_owner: string | null
  follow_up_date: string | null
  due_date: string | null
  updated_at: string
  created_at: string
  tags: string[]
  brand: string | null
}

interface TaskComment {
  id: string
  author_name: string
  author_email: string | null
  content: string
  is_resolved: boolean
  created_at: string
}

// ─── Tag color palette (matches internal app) ───────

const TAG_PALETTE = [
  { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  { bg: '#f3e8ff', text: '#6b21a8', border: '#c4b5fd' },
  { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  { bg: '#ffe4e6', text: '#9f1239', border: '#fda4af' },
  { bg: '#e0f2fe', text: '#075985', border: '#7dd3fc' },
  { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
]

function tagColor(tag: string): { bg: string; text: string; border: string } {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  }
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length]
}

// ─── Helpers ─────────────────────────────────────────

function formatAge(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return 'just now'
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d`
  const weeks = Math.floor(days / 7)
  if (weeks < 5) return `${weeks}w`
  const months = Math.floor(days / 30)
  return `${months}mo`
}

function formatCommentTime(iso: string): string {
  const d = new Date(iso)
  const now = new Date()
  const diff = now.getTime() - d.getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 7) return `${days}d ago`
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

// ─── Main page ───────────────────────────────────────

export default function PublicWatchingPage() {
  const [tasks, setTasks] = useState<WatchingTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [tokenRef, setTokenRef] = useState('')

  // Filters
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedBrand, setSelectedBrand] = useState<string | null>(null)
  const [selectedTag, setSelectedTag] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (!token) {
      setError('Missing token')
      setLoading(false)
      return
    }
    setTokenRef(token)

    fetch(`/api/public/watching?token=${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('Unauthorized')
        return res.json()
      })
      .then((data) => setTasks(data.tasks))
      .catch(() => setError('Unable to load'))
      .finally(() => setLoading(false))
  }, [])

  // Collect all brands and tags for filters
  const allBrands = useMemo(() => {
    const set = new Set<string>()
    tasks.forEach((t) => { if (t.brand) set.add(t.brand) })
    return Array.from(set).sort()
  }, [tasks])

  const allTags = useMemo(() => {
    const set = new Set<string>()
    tasks.forEach((t) => t.tags?.forEach((tag) => set.add(tag)))
    return Array.from(set).sort()
  }, [tasks])

  // Apply filters
  const filteredTasks = useMemo(() => {
    let result = tasks
    if (selectedBrand) {
      result = result.filter((t) => (t.brand ?? 'Other') === selectedBrand)
    }
    if (selectedTag) {
      result = result.filter((t) => t.tags?.includes(selectedTag))
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase()
      result = result.filter(
        (t) =>
          t.description.toLowerCase().includes(q) ||
          t.waiting_on?.toLowerCase().includes(q) ||
          t.tracked_owner?.toLowerCase().includes(q) ||
          t.tags?.some((tag) => tag.toLowerCase().includes(q))
      )
    }
    return result
  }, [tasks, selectedBrand, selectedTag, searchQuery])

  // Group filtered tasks by brand
  const groups = useMemo(() => {
    const byBrand = new Map<string, WatchingTask[]>()
    for (const t of filteredTasks) {
      const brand = t.brand ?? 'Other'
      const existing = byBrand.get(brand) ?? []
      existing.push(t)
      byBrand.set(brand, existing)
    }
    // Sort: named brands first (alphabetically), "Other" last
    return Array.from(byBrand.entries()).sort((a, b) => {
      if (a[0] === 'Other') return 1
      if (b[0] === 'Other') return -1
      return a[0].localeCompare(b[0])
    })
  }, [filteredTasks])

  // Last updated timestamp
  const lastUpdated = useMemo(() => {
    if (tasks.length === 0) return null
    return tasks.reduce((latest, t) =>
      t.updated_at > latest ? t.updated_at : latest
    , tasks[0].updated_at)
  }, [tasks])

  const hasActiveFilters = !!selectedBrand || !!selectedTag || !!searchQuery.trim()

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#faf6f1' }}>
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-[#d4943a] border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm" style={{ color: '#9a8b7a' }}>Loading watch board...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#faf6f1' }}>
        <div className="text-center">
          <p className="text-lg font-medium" style={{ color: '#3d2c1e' }}>Access Denied</p>
          <p className="text-sm mt-1" style={{ color: '#9a8b7a' }}>{error}</p>
        </div>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen flex flex-col"
      style={{
        background: '#faf6f1',
        backgroundImage:
          'radial-gradient(ellipse at 20% 0%, #f0e6d8 0%, transparent 50%), radial-gradient(ellipse at 80% 100%, #ede0d0 0%, transparent 50%)',
        backgroundAttachment: 'fixed',
      }}
    >
      {/* ─── Header ───────────────────────────────── */}
      <header
        className="px-4 sm:px-6 py-4 sm:py-5"
        style={{ background: '#2c2014' }}
      >
        <div className="max-w-4xl mx-auto">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <Image src="/logo-icon-white.png" alt="Dumpbox" width={28} height={28} />
              <div>
                <h1 className="text-white font-bold tracking-tight text-lg">Watch Board</h1>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs" style={{ color: '#9a8b7a' }}>
                {tasks.length} item{tasks.length !== 1 ? 's' : ''} tracked
              </p>
              {lastUpdated && (
                <p className="text-[11px] mt-0.5" style={{ color: '#6b5d4f' }}>
                  Updated {formatTimestamp(lastUpdated)}
                </p>
              )}
            </div>
          </div>
        </div>
      </header>

      {/* ─── Content ──────────────────────────────── */}
      <main className="flex-1 max-w-4xl mx-auto w-full px-4 sm:px-6 py-5 sm:py-6">
        {/* ─── Filter Bar ─────────────────────────── */}
        <div className="mb-5 space-y-3">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: '#9a8b7a' }} />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search tasks..."
              className="w-full text-sm pl-9 pr-8 py-2.5 rounded-lg border focus:outline-none focus:ring-2 transition-colors"
              style={{
                background: '#fff8f0',
                borderColor: '#e8ddd0',
                color: '#3d2c1e',
              }}
              onFocus={(e) => (e.target.style.borderColor = '#d4943a')}
              onBlur={(e) => (e.target.style.borderColor = '#e8ddd0')}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 rounded hover:bg-black/5 transition-colors"
              >
                <X className="w-3.5 h-3.5" style={{ color: '#9a8b7a' }} />
              </button>
            )}
          </div>

          {/* Filter pills */}
          {(allBrands.length > 0 || allTags.length > 0) && (
            <div className="flex flex-wrap gap-1.5">
              {/* Brand pills */}
              {allBrands.map((brand) => (
                <button
                  key={`brand-${brand}`}
                  onClick={() => setSelectedBrand(selectedBrand === brand ? null : brand)}
                  className="px-2.5 py-1 text-xs rounded-full border transition-all"
                  style={
                    selectedBrand === brand
                      ? { background: '#2c2014', color: '#fff', borderColor: '#2c2014' }
                      : { background: '#fff8f0', color: '#3d2c1e', borderColor: '#e8ddd0' }
                  }
                >
                  {brand}
                </button>
              ))}

              {/* Separator if both brands and tags exist */}
              {allBrands.length > 0 && allTags.length > 0 && (
                <div className="w-px h-5 self-center mx-1" style={{ background: '#e8ddd0' }} />
              )}

              {/* Tag pills */}
              {allTags.map((tag) => {
                const color = tagColor(tag)
                return (
                  <button
                    key={`tag-${tag}`}
                    onClick={() => setSelectedTag(selectedTag === tag ? null : tag)}
                    className="px-2.5 py-1 text-xs rounded-full border transition-all"
                    style={
                      selectedTag === tag
                        ? { background: color.text, color: '#fff', borderColor: color.text }
                        : { background: color.bg, color: color.text, borderColor: color.border }
                    }
                  >
                    #{tag}
                  </button>
                )
              })}

              {/* Clear filters */}
              {hasActiveFilters && (
                <button
                  onClick={() => {
                    setSelectedBrand(null)
                    setSelectedTag(null)
                    setSearchQuery('')
                  }}
                  className="px-2.5 py-1 text-xs rounded-full border transition-colors"
                  style={{ color: '#9a8b7a', borderColor: '#e8ddd0' }}
                >
                  Clear filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* ─── Task groups ────────────────────────── */}
        <div className="space-y-5">
          {groups.map(([brand, brandTasks]) => (
            <BrandGroup
              key={brand}
              brand={brand}
              tasks={brandTasks}
              token={tokenRef}
            />
          ))}
        </div>

        {filteredTasks.length === 0 && tasks.length > 0 && (
          <p className="text-center text-sm py-12" style={{ color: '#9a8b7a' }}>
            No tasks match your filters.
          </p>
        )}

        {tasks.length === 0 && (
          <p className="text-center text-sm py-12" style={{ color: '#9a8b7a' }}>
            Nothing being tracked right now.
          </p>
        )}
      </main>

      {/* ─── Footer ───────────────────────────────── */}
      <footer className="py-4 text-center">
        <p className="text-[11px]" style={{ color: '#9a8b7a' }}>
          Powered by <span className="font-medium" style={{ color: '#3d2c1e' }}>Dumpbox</span>
        </p>
      </footer>
    </div>
  )
}

// ─── Brand Group (collapsible section) ───────────────

function BrandGroup({
  brand,
  tasks,
  token,
}: {
  brand: string
  tasks: WatchingTask[]
  token: string
}) {
  const [expanded, setExpanded] = useState(true)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center gap-2 mb-2.5 group cursor-pointer text-left"
      >
        {expanded
          ? <ChevronDown className="w-4 h-4 shrink-0" style={{ color: '#9a8b7a' }} />
          : <ChevronRight className="w-4 h-4 shrink-0" style={{ color: '#9a8b7a' }} />
        }
        <h2
          className="text-sm font-semibold uppercase tracking-wider flex items-center gap-2"
          style={{ color: '#2c2014' }}
        >
          {brand}
          <span className="font-normal text-xs" style={{ color: '#9a8b7a' }}>
            {tasks.length}
          </span>
        </h2>
      </button>

      {expanded && (
        <div className="space-y-2 ml-6">
          {tasks.map((task) => {
            const isOverdue = task.follow_up_date != null && task.follow_up_date <= today
            return (
              <TaskCard
                key={task.id}
                task={task}
                isOverdue={isOverdue}
                token={token}
              />
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Status Badge ────────────────────────────────────

function StatusBadge({ task }: { task: WatchingTask }) {
  if (task.waiting_on) {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border whitespace-nowrap"
        style={{ background: '#fffbeb', color: '#92400e', borderColor: '#fcd34d' }}
      >
        Waiting on {task.waiting_on}
      </span>
    )
  }

  if (task.status === 'tracking' && task.tracked_owner) {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border whitespace-nowrap"
        style={{ background: '#f3e8ff', color: '#6b21a8', borderColor: '#c4b5fd' }}
      >
        Tracking {task.tracked_owner}
      </span>
    )
  }

  if (task.status === 'tracking') {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border whitespace-nowrap"
        style={{ background: '#f3e8ff', color: '#6b21a8', borderColor: '#c4b5fd' }}
      >
        Tracking
      </span>
    )
  }

  if (task.status === 'done') {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border whitespace-nowrap"
        style={{ background: '#dcfce7', color: '#166534', borderColor: '#86efac' }}
      >
        Done
      </span>
    )
  }

  if (task.status === 'blocked') {
    return (
      <span
        className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border whitespace-nowrap"
        style={{ background: '#fef2f2', color: '#991b1b', borderColor: '#fca5a5' }}
      >
        Blocked
      </span>
    )
  }

  // Open / default
  return (
    <span
      className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border whitespace-nowrap"
      style={{ background: '#dcfce7', color: '#166534', borderColor: '#86efac' }}
    >
      Open
    </span>
  )
}

// ─── Task Card ───────────────────────────────────────

function TaskCard({
  task,
  isOverdue,
  token,
}: {
  task: WatchingTask
  isOverdue: boolean
  token: string
}) {
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [comments, setComments] = useState<TaskComment[]>([])
  const [loadingComments, setLoadingComments] = useState(false)
  const [authorName, setAuthorName] = useState(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('dumpbox_comment_author') ?? ''
    }
    return ''
  })
  const [commentText, setCommentText] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function loadComments() {
    setLoadingComments(true)
    try {
      const res = await fetch(`/api/public/watching/comments?token=${token}&task_id=${task.id}`)
      if (res.ok) {
        const data = await res.json()
        setComments(data.comments ?? [])
      }
    } finally {
      setLoadingComments(false)
    }
  }

  function handleToggleComments() {
    if (!commentsOpen) {
      loadComments()
    }
    setCommentsOpen(!commentsOpen)
  }

  async function handleSubmitComment(e: React.FormEvent) {
    e.preventDefault()
    if (!authorName.trim() || !commentText.trim() || submitting) return
    setSubmitting(true)
    try {
      localStorage.setItem('dumpbox_comment_author', authorName.trim())
      const res = await fetch(`/api/public/watching/comments?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_id: task.id,
          author_name: authorName.trim(),
          content: commentText.trim(),
        }),
      })
      if (res.ok) {
        const data = await res.json()
        setComments((prev) => [...prev, data.comment])
        setCommentText('')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const unresolvedCount = comments.filter((c) => !c.is_resolved).length

  return (
    <div
      className="rounded-lg border transition-shadow"
      style={{
        background: '#fff',
        borderColor: isOverdue ? '#fca5a5' : '#e8ddd0',
      }}
    >
      {/* Card body */}
      <div className="px-4 py-3">
        {/* Description */}
        <p className="text-sm leading-relaxed" style={{ color: '#3d2c1e' }}>
          {task.description}
        </p>

        {/* Meta row */}
        <div className="flex items-center flex-wrap gap-2 mt-2">
          <StatusBadge task={task} />

          {/* Tags */}
          {task.tags?.map((tag) => {
            const color = tagColor(tag)
            return (
              <span
                key={tag}
                className="inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border"
                style={{ background: color.bg, color: color.text, borderColor: color.border }}
              >
                #{tag}
              </span>
            )
          })}

          {/* Follow up date */}
          {task.follow_up_date && (
            <span
              className="text-[11px] px-1.5 py-0.5 rounded border font-medium"
              style={
                isOverdue
                  ? { color: '#991b1b', background: '#fef2f2', borderColor: '#fca5a5' }
                  : { color: '#9a8b7a', borderColor: '#e8ddd0' }
              }
            >
              Follow up {task.follow_up_date}{isOverdue && ' (overdue)'}
            </span>
          )}

          {/* Age */}
          <span className="text-[11px] ml-auto" style={{ color: '#9a8b7a' }}>
            {formatAge(task.created_at)}
          </span>

          {/* Comments toggle */}
          <button
            onClick={handleToggleComments}
            className="text-[11px] flex items-center gap-1 hover:opacity-80 transition-opacity"
            style={{ color: '#9a8b7a' }}
          >
            {commentsOpen ? '▾' : '▸'} Comments
            {unresolvedCount > 0 && (
              <span
                className="px-1.5 py-0.5 rounded-full text-[10px] font-medium"
                style={{ background: '#fef3c7', color: '#92400e' }}
              >
                {unresolvedCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Comments section */}
      {commentsOpen && (
        <div
          className="border-t px-4 py-3 rounded-b-lg"
          style={{ borderColor: '#e8ddd0', background: '#faf6f1' }}
        >
          {loadingComments ? (
            <p className="text-xs text-center py-2" style={{ color: '#9a8b7a' }}>Loading...</p>
          ) : (
            <>
              {comments.length > 0 && (
                <div className="space-y-2.5 mb-3">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className={`text-sm ${comment.is_resolved ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium text-xs" style={{ color: '#3d2c1e' }}>
                          {comment.author_name}
                        </span>
                        <span className="text-[10px]" style={{ color: '#9a8b7a' }}>
                          {formatCommentTime(comment.created_at)}
                        </span>
                        {comment.is_resolved && (
                          <span className="text-[10px]" style={{ color: '#166534' }}>resolved</span>
                        )}
                      </div>
                      <p className="text-xs mt-0.5" style={{ color: '#6b5d4f' }}>
                        {comment.content}
                      </p>
                    </div>
                  ))}
                </div>
              )}
              {comments.length === 0 && (
                <p className="text-xs mb-3" style={{ color: '#9a8b7a' }}>
                  No comments yet. Be the first to leave a note.
                </p>
              )}
              <form onSubmit={handleSubmitComment} className="space-y-2">
                {!authorName && (
                  <input
                    type="text"
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="Your name"
                    className="w-full text-xs px-3 py-1.5 rounded-lg border focus:outline-none transition-colors"
                    style={{ background: '#fff', borderColor: '#e8ddd0', color: '#3d2c1e' }}
                    onFocus={(e) => (e.target.style.borderColor = '#d4943a')}
                    onBlur={(e) => (e.target.style.borderColor = '#e8ddd0')}
                  />
                )}
                {authorName && (
                  <div className="flex items-center gap-2 text-xs" style={{ color: '#9a8b7a' }}>
                    <span>
                      Commenting as{' '}
                      <strong style={{ color: '#3d2c1e' }}>{authorName}</strong>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAuthorName('')
                        localStorage.removeItem('dumpbox_comment_author')
                      }}
                      className="hover:opacity-70 transition-opacity"
                      style={{ color: '#9a8b7a' }}
                    >
                      change
                    </button>
                  </div>
                )}
                <textarea
                  value={commentText}
                  onChange={(e) => setCommentText(e.target.value)}
                  placeholder="Leave a note for Brandy..."
                  rows={2}
                  className="w-full text-xs px-3 py-2 rounded-lg border focus:outline-none resize-none transition-colors"
                  style={{ background: '#fff', borderColor: '#e8ddd0', color: '#3d2c1e' }}
                  onFocus={(e) => (e.target.style.borderColor = '#d4943a')}
                  onBlur={(e) => (e.target.style.borderColor = '#e8ddd0')}
                />
                <button
                  type="submit"
                  disabled={!authorName.trim() || !commentText.trim() || submitting}
                  className="px-3 py-1.5 text-xs rounded-lg text-white disabled:opacity-40 transition-colors"
                  style={{ background: '#d4943a' }}
                  onMouseEnter={(e) => ((e.target as HTMLElement).style.background = '#b87a2a')}
                  onMouseLeave={(e) => ((e.target as HTMLElement).style.background = '#d4943a')}
                >
                  {submitting ? 'Posting...' : 'Post Comment'}
                </button>
              </form>
            </>
          )}
        </div>
      )}
    </div>
  )
}
