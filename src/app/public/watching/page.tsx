'use client'

import { useState, useEffect } from 'react'

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

export default function PublicWatchingPage() {
  const [tasks, setTasks] = useState<WatchingTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [newDesc, setNewDesc] = useState('')
  const [newOwner, setNewOwner] = useState('')
  const [adding, setAdding] = useState(false)
  const [tokenRef, setTokenRef] = useState('')

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

  // Group by brand
  const byBrand = new Map<string, WatchingTask[]>()
  for (const t of tasks) {
    const brand = t.brand ?? 'General'
    const existing = byBrand.get(brand) ?? []
    existing.push(t)
    byBrand.set(brand, existing)
  }
  const groups = Array.from(byBrand.entries()).sort((a, b) => b[1].length - a[1].length)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">{error}</p>
      </div>
    )
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Watching</h1>
          <p className="text-sm text-gray-500 mt-1">
            {tasks.length} items being tracked
          </p>
        </div>

        {/* Add new item */}
        <form
          onSubmit={async (e) => {
            e.preventDefault()
            if (!newDesc.trim() || adding) return
            setAdding(true)
            try {
              const res = await fetch(`/api/public/watching?token=${tokenRef}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ description: newDesc.trim(), owner: newOwner.trim() || null }),
              })
              if (res.ok) {
                setNewDesc('')
                setNewOwner('')
                // Reload tasks
                const data = await fetch(`/api/public/watching?token=${tokenRef}`).then((r) => r.json())
                setTasks(data.tasks)
              }
            } finally {
              setAdding(false)
            }
          }}
          className="mb-6 bg-white rounded-lg border border-gray-200 p-4 space-y-2"
        >
          <input
            type="text"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
            placeholder="What are you tracking?"
            className="w-full text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-400"
          />
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newOwner}
              onChange={(e) => setNewOwner(e.target.value)}
              placeholder="Owner (optional)"
              className="flex-1 text-sm px-3 py-2 rounded-lg border border-gray-200 focus:outline-none focus:border-blue-400"
            />
            <button
              type="submit"
              disabled={!newDesc.trim() || adding}
              className="px-4 py-2 text-sm rounded-lg bg-gray-900 text-white hover:bg-gray-800 disabled:opacity-40 transition-colors"
            >
              {adding ? 'Adding...' : 'Add'}
            </button>
          </div>
        </form>

        <div className="space-y-4">
          {groups.map(([brand, brandTasks]) => (
            <div key={brand}>
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2">
                {brand} <span className="text-gray-400 font-normal">{brandTasks.length}</span>
              </h2>
              <div className="space-y-1.5">
                {brandTasks.map((task) => {
                  const isOverdue = task.follow_up_date && task.follow_up_date <= today
                  return (
                    <TaskCard
                      key={task.id}
                      task={task}
                      isOverdue={!!isOverdue}
                      token={tokenRef}
                    />
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {tasks.length === 0 && (
          <p className="text-center text-gray-400 py-12">Nothing being tracked right now.</p>
        )}
      </div>
    </div>
  )
}

function TaskCard({ task, isOverdue, token }: { task: WatchingTask; isOverdue: boolean; token: string }) {
  const [expanded, setExpanded] = useState(false)
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

  function handleToggle() {
    if (!expanded) {
      loadComments()
    }
    setExpanded(!expanded)
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!authorName.trim() || !commentText.trim() || submitting) return
    setSubmitting(true)
    try {
      // Remember author name
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
    <div className={`bg-white rounded-lg border ${isOverdue ? 'border-red-200' : 'border-gray-200'}`}>
      <div className="px-4 py-3">
        <p className="text-sm text-gray-900">{task.description}</p>
        <div className="flex items-center gap-3 mt-1.5 flex-wrap">
          {task.status === 'done' && (
            <span className="text-xs text-green-700 bg-green-50 px-1.5 py-0.5 rounded border border-green-200">done</span>
          )}
          {task.status === 'tracking' && (
            <span className="text-xs text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">tracking</span>
          )}
          {task.tracked_owner && (
            <span className="text-xs text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
              {task.tracked_owner}
            </span>
          )}
          {task.waiting_on && (
            <span className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
              waiting on {task.waiting_on}
            </span>
          )}
          {task.follow_up_date && (
            <span className={`text-xs px-1.5 py-0.5 rounded border ${isOverdue ? 'text-red-700 bg-red-50 border-red-200 font-medium' : 'text-gray-500 border-gray-200'}`}>
              follow up {task.follow_up_date}
              {isOverdue && ' (overdue)'}
            </span>
          )}
          <button
            onClick={handleToggle}
            className="ml-auto text-xs text-gray-400 hover:text-gray-700 transition-colors flex items-center gap-1"
          >
            {expanded ? '▾' : '▸'} Comments
            {unresolvedCount > 0 && (
              <span className="bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full text-[10px] font-medium">
                {unresolvedCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-gray-100 px-4 py-3 bg-gray-50/50 rounded-b-lg">
          {loadingComments ? (
            <p className="text-xs text-gray-400 text-center py-2">Loading...</p>
          ) : (
            <>
              {comments.length > 0 && (
                <div className="space-y-2 mb-3">
                  {comments.map((comment) => (
                    <div
                      key={comment.id}
                      className={`text-sm ${comment.is_resolved ? 'opacity-50' : ''}`}
                    >
                      <div className="flex items-baseline gap-2">
                        <span className="font-medium text-gray-900 text-xs">{comment.author_name}</span>
                        <span className="text-[10px] text-gray-400">{formatCommentTime(comment.created_at)}</span>
                        {comment.is_resolved && (
                          <span className="text-[10px] text-green-600">resolved</span>
                        )}
                      </div>
                      <p className="text-xs text-gray-700 mt-0.5">{comment.content}</p>
                    </div>
                  ))}
                </div>
              )}
              {comments.length === 0 && (
                <p className="text-xs text-gray-400 mb-3">No comments yet. Be the first to leave a note.</p>
              )}
              <form onSubmit={handleSubmit} className="space-y-2">
                {!authorName && (
                  <input
                    type="text"
                    value={authorName}
                    onChange={(e) => setAuthorName(e.target.value)}
                    placeholder="Your name"
                    className="w-full text-xs px-3 py-1.5 rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-amber-400"
                  />
                )}
                {authorName && (
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>Commenting as <strong className="text-gray-700">{authorName}</strong></span>
                    <button
                      type="button"
                      onClick={() => { setAuthorName(''); localStorage.removeItem('dumpbox_comment_author') }}
                      className="text-gray-400 hover:text-gray-600"
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
                  className="w-full text-xs px-3 py-2 rounded-lg border border-gray-200 bg-white focus:outline-none focus:border-amber-400 resize-none"
                />
                <button
                  type="submit"
                  disabled={!authorName.trim() || !commentText.trim() || submitting}
                  className="px-3 py-1.5 text-xs rounded-lg bg-amber-600 text-white hover:bg-amber-700 disabled:opacity-40 transition-colors"
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
