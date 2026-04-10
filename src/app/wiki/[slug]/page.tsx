'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

interface WikiPage {
  id: string
  slug: string
  title: string
  content: string
  summary: string
  source_count: number
  updated_at: string
  entities: { type: string; name: string } | null
}

interface WikiLink {
  context?: string
  wiki_pages?: { slug: string; title: string }
}

export default function WikiPageView() {
  const { slug } = useParams<{ slug: string }>()
  const [page, setPage] = useState<WikiPage | null>(null)
  const [outLinks, setOutLinks] = useState<WikiLink[]>([])
  const [inLinks, setInLinks] = useState<WikiLink[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  useEffect(() => {
    if (!slug) return
    fetch(`/api/wiki/${slug}`)
      .then((res) => {
        if (!res.ok) { setNotFound(true); return null }
        return res.json()
      })
      .then((data) => {
        if (data) {
          setPage(data.page)
          setOutLinks(data.outbound_links ?? [])
          setInLinks(data.inbound_links ?? [])
        }
      })
      .finally(() => setLoading(false))
  }, [slug])

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex items-center justify-center">
        <p className="text-sm text-slate-500">Loading...</p>
      </div>
    )
  }

  if (notFound || !page) {
    return (
      <div className="min-h-screen bg-[#0f1117] flex flex-col items-center justify-center gap-3">
        <p className="text-slate-400">Wiki page not found.</p>
        <Link href="/wiki" className="text-sm text-blue-400 hover:text-blue-300">← Back to Wiki</Link>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#0f1117] text-slate-200">
      {/* Header */}
      <header className="border-b border-[#2a2d3a] px-4 py-3 flex items-center gap-3">
        <Link href="/wiki" className="text-slate-500 hover:text-slate-300 text-sm transition-colors">
          ← Wiki
        </Link>
        <span className="text-slate-600">/</span>
        <span className="text-slate-200 font-semibold text-sm">{page.title}</span>
        <div className="ml-auto flex items-center gap-3 text-xs text-slate-500">
          <span>{page.source_count} sources</span>
          <span>updated {formatAge(page.updated_at)}</span>
        </div>
      </header>

      <div className="max-w-3xl mx-auto p-6">
        {/* Summary */}
        {page.summary && (
          <div className="mb-6 p-4 rounded-lg bg-blue-500/5 border border-blue-500/15">
            <p className="text-sm text-slate-300 leading-relaxed">{page.summary}</p>
          </div>
        )}

        {/* Content */}
        {page.content ? (
          <div className="prose-dark">
            <WikiContent content={page.content} />
          </div>
        ) : (
          <div className="text-center py-12">
            <p className="text-slate-500 mb-2">This page is empty.</p>
            <p className="text-xs text-slate-600">
              It will be populated automatically when you ingest data related to {page.title}.
            </p>
          </div>
        )}

        {/* Links */}
        {(outLinks.length > 0 || inLinks.length > 0) && (
          <div className="mt-8 pt-6 border-t border-[#2a2d3a]">
            {outLinks.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Links to
                </h3>
                <div className="flex flex-wrap gap-2">
                  {outLinks.map((link, i) => (
                    <Link
                      key={i}
                      href={`/wiki/${link.wiki_pages?.slug}`}
                      className="px-2.5 py-1 text-xs rounded-md bg-[#1a1d27] border border-[#2a2d3a] text-blue-400 hover:text-blue-300 hover:border-blue-500/30 transition-colors"
                      title={link.context ?? undefined}
                    >
                      {link.wiki_pages?.title}
                    </Link>
                  ))}
                </div>
              </div>
            )}
            {inLinks.length > 0 && (
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Linked from
                </h3>
                <div className="flex flex-wrap gap-2">
                  {inLinks.map((link, i) => (
                    <Link
                      key={i}
                      href={`/wiki/${link.wiki_pages?.slug}`}
                      className="px-2.5 py-1 text-xs rounded-md bg-[#1a1d27] border border-[#2a2d3a] text-slate-400 hover:text-slate-200 transition-colors"
                    >
                      {link.wiki_pages?.title}
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

/** Render wiki markdown content with [[slug]] link support */
function WikiContent({ content }: { content: string }) {
  // Split on [[slug]] patterns and render as links
  const parts = content.split(/(\[\[[\w-]+\]\])/g)

  return (
    <div className="text-sm text-slate-300 leading-relaxed space-y-3">
      {content.split('\n\n').map((block, i) => {
        const trimmed = block.trim()
        if (!trimmed) return null

        if (trimmed.startsWith('## ')) {
          return <h2 key={i} className="text-base font-semibold text-slate-200 mt-6 mb-2">{trimmed.slice(3)}</h2>
        }
        if (trimmed.startsWith('### ')) {
          return <h3 key={i} className="text-sm font-semibold text-slate-300 mt-4 mb-1">{trimmed.slice(4)}</h3>
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return (
            <ul key={i} className="space-y-1 ml-4">
              {trimmed.split('\n').map((line, j) => {
                const text = line.replace(/^[-•]\s*/, '')
                return <li key={j} className="text-sm text-slate-300 list-disc">{renderInlineLinks(text)}</li>
              })}
            </ul>
          )
        }
        if (trimmed.startsWith('---')) {
          return <hr key={i} className="border-[#2a2d3a] my-4" />
        }

        return <p key={i}>{renderInlineLinks(trimmed)}</p>
      })}
    </div>
  )
}

function renderInlineLinks(text: string): React.ReactNode {
  const parts = text.split(/(\[\[[\w-]+\]\])/g)
  return parts.map((part, i) => {
    const match = part.match(/^\[\[([\w-]+)\]\]$/)
    if (match) {
      return (
        <Link
          key={i}
          href={`/wiki/${match[1]}`}
          className="text-blue-400 hover:text-blue-300 underline underline-offset-2"
        >
          {match[1].replace(/-/g, ' ')}
        </Link>
      )
    }
    // Bold
    const bolded = part.replace(/\*\*(.*?)\*\*/g, '<strong class="text-slate-200 font-medium">$1</strong>')
    if (bolded !== part) {
      return <span key={i} dangerouslySetInnerHTML={{ __html: bolded }} />
    }
    return part
  })
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
