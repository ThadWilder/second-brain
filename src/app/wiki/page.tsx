'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

interface WikiPageSummary {
  id: string
  slug: string
  title: string
  summary: string
  source_count: number
  updated_at: string
  entities: { type: string; name: string } | null
}

const TYPE_ICONS: Record<string, string> = {
  brand: '🏢',
  vendor: '🤝',
  contact: '👤',
  topic: '🏷️',
}

export default function WikiIndex() {
  const [pages, setPages] = useState<WikiPageSummary[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/wiki')
      .then((res) => res.json())
      .then((data) => setPages(data.pages ?? []))
      .finally(() => setLoading(false))
  }, [])

  const withContent = pages.filter((p) => p.source_count > 0)
  const empty = pages.filter((p) => p.source_count === 0)

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="border-b border-[var(--border)] px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-[var(--muted)] hover:text-[var(--text)] text-sm transition-colors">
          ← Dashboard
        </Link>
        <span className="text-[var(--border)]">/</span>
        <span className="text-[var(--text)] font-semibold text-sm">Wiki</span>
        <span className="text-xs text-[var(--muted)] ml-auto">{pages.length} pages</span>
      </header>

      <div className="max-w-3xl mx-auto p-6">
        {loading ? (
          <p className="text-sm text-[var(--muted)]">Loading...</p>
        ) : pages.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-[var(--muted)] mb-2">No wiki pages yet.</p>
            <p className="text-sm text-[var(--muted)]">Wiki pages are created automatically when you ingest data.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Pages with content */}
            {withContent.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-3">
                  Active Pages ({withContent.length})
                </h2>
                <div className="space-y-2">
                  {withContent.map((page) => (
                    <WikiCard key={page.id} page={page} />
                  ))}
                </div>
              </div>
            )}

            {/* Empty pages */}
            {empty.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-3">
                  Empty Pages ({empty.length})
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {empty.map((page) => (
                    <Link
                      key={page.id}
                      href={`/wiki/${page.slug}`}
                      className="px-3 py-2 rounded-lg bg-[var(--surface)] border border-[var(--border)] text-sm text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
                    >
                      {TYPE_ICONS[page.entities?.type ?? ''] ?? '📄'} {page.title}
                    </Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function WikiCard({ page }: { page: WikiPageSummary }) {
  const icon = TYPE_ICONS[page.entities?.type ?? ''] ?? '📄'
  const age = formatAge(page.updated_at)

  return (
    <Link
      href={`/wiki/${page.slug}`}
      className="block p-4 rounded-lg bg-[var(--surface)] border border-[var(--border)] hover:border-[var(--accent)] transition-colors"
    >
      <div className="flex items-start gap-3">
        <span className="text-lg">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-[var(--text)]">{page.title}</span>
            <span className="text-[10px] text-[var(--muted)]">{page.source_count} sources</span>
            <span className="text-[10px] text-[var(--muted)]">{age}</span>
          </div>
          {page.summary && (
            <p className="text-xs text-[var(--muted)] line-clamp-2 leading-relaxed">{page.summary}</p>
          )}
        </div>
      </div>
    </Link>
  )
}

function formatAge(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}
