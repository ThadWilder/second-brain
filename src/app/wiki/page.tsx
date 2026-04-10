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
    <div className="min-h-screen bg-[#0d1321] text-slate-200">
      <header className="border-b border-[#2a3150] px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
          ← Dashboard
        </Link>
        <span className="text-slate-600">/</span>
        <span className="text-slate-200 font-semibold text-sm">Wiki</span>
        <span className="text-xs text-slate-500 ml-auto">{pages.length} pages</span>
      </header>

      <div className="max-w-3xl mx-auto p-6">
        {loading ? (
          <p className="text-sm text-slate-500">Loading...</p>
        ) : pages.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-slate-400 mb-2">No wiki pages yet.</p>
            <p className="text-sm text-slate-500">Wiki pages are created automatically when you ingest data.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Pages with content */}
            {withContent.length > 0 && (
              <div>
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3">
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
                <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">
                  Empty Pages ({empty.length})
                </h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {empty.map((page) => (
                    <Link
                      key={page.id}
                      href={`/wiki/${page.slug}`}
                      className="px-3 py-2 rounded-lg bg-[#1a2035] border border-[#2a3150] text-sm text-slate-400 hover:text-slate-200 hover:border-slate-500 transition-colors"
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
      className="block p-4 rounded-lg bg-[#1a2035] border border-[#2a3150] hover:border-slate-500 transition-colors"
    >
      <div className="flex items-start gap-3">
        <span className="text-lg">{icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-sm font-medium text-slate-200">{page.title}</span>
            <span className="text-[10px] text-slate-500">{page.source_count} sources</span>
            <span className="text-[10px] text-slate-600">{age}</span>
          </div>
          {page.summary && (
            <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">{page.summary}</p>
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
