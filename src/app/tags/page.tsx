'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Tag } from 'lucide-react'
import { Header } from '@/components/ui/Header'

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

function tagColor(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  }
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length]
}

interface TagCount {
  tag: string
  count: number
}

export default function TagsPage() {
  const [tags, setTags] = useState<TagCount[]>([])
  const [loading, setLoading] = useState(true)

  const fetchTags = useCallback(async () => {
    try {
      const res = await fetch('/api/tags')
      if (!res.ok) return
      const data = await res.json()
      setTags(data.tags ?? [])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTags()
  }, [fetchTags])

  return (
    <div className="min-h-screen flex flex-col">
      <Header activePage="tags" />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-4 py-8 space-y-6">
          <div>
            <h1 className="text-xl font-bold text-[var(--text)]">Tags</h1>
            {!loading && (
              <p className="text-sm text-[var(--muted)] mt-0.5">
                {tags.length} tag{tags.length !== 1 ? 's' : ''} in use
              </p>
            )}
          </div>

          {loading && (
            <div className="text-center py-12 text-[var(--muted)]">Loading...</div>
          )}

          {!loading && tags.length === 0 && (
            <div className="text-center py-16">
              <Tag size={40} className="mx-auto text-[var(--muted)] mb-3 opacity-40" />
              <p className="text-[var(--muted)] text-sm">No tags yet</p>
              <p className="text-[var(--muted)] text-xs mt-1">Add tags to tasks from the task detail panel</p>
            </div>
          )}

          {!loading && tags.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tags.map(({ tag, count }) => {
                const color = tagColor(tag)
                return (
                  <Link
                    key={tag}
                    href={`/tags/${encodeURIComponent(tag)}`}
                    className="group flex items-center gap-3 px-4 py-3 rounded-xl bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] hover:shadow-sm transition-all"
                  >
                    <span
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium"
                      style={{
                        backgroundColor: color.bg,
                        color: color.text,
                        borderColor: color.border,
                        border: '1px solid',
                      }}
                    >
                      {tag}
                    </span>
                    <span className="ml-auto text-sm text-[var(--muted)] group-hover:text-[var(--text)] transition-colors">
                      {count} task{count !== 1 ? 's' : ''}
                    </span>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
