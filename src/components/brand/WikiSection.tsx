'use client'

import Link from 'next/link'

interface WikiPage {
  id: string
  slug: string
  title: string
  content: string | null
  summary: string | null
  source_count: number
  updated_at: string
}

interface Props {
  wikiPage: WikiPage | null
  brandName: string
  slug: string
}

export function WikiSection({ wikiPage, brandName, slug }: Props) {
  if (!wikiPage || (!wikiPage.content && !wikiPage.summary)) {
    return (
      <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] px-5 py-8 text-center">
        <p className="text-sm text-[var(--muted)]">
          No wiki content yet — dump some info about {brandName} to get started
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">Wiki</h2>
        <Link
          href={`/wiki/${slug}`}
          className="text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] transition-colors"
        >
          Full page &rarr;
        </Link>
      </div>

      {wikiPage.summary && (
        <div className="p-4 rounded-lg bg-amber-50 border border-amber-200">
          <p className="text-sm text-[var(--text)] leading-relaxed">{wikiPage.summary}</p>
        </div>
      )}

      {wikiPage.content && (
        <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-5">
          <WikiContent content={wikiPage.content} />
        </div>
      )}

      <p className="text-[10px] text-[var(--muted)]">
        {wikiPage.source_count} source{wikiPage.source_count !== 1 ? 's' : ''} &middot; updated {formatAge(wikiPage.updated_at)}
      </p>
    </div>
  )
}

function WikiContent({ content }: { content: string }) {
  return (
    <div className="text-sm text-[var(--text)] leading-relaxed space-y-3">
      {content.split('\n\n').map((block, i) => {
        const trimmed = block.trim()
        if (!trimmed) return null

        if (trimmed.startsWith('## ')) {
          return <h2 key={i} className="text-base font-semibold text-[var(--text)] mt-4 mb-2">{trimmed.slice(3)}</h2>
        }
        if (trimmed.startsWith('### ')) {
          return <h3 key={i} className="text-sm font-semibold text-[var(--text)] mt-3 mb-1">{trimmed.slice(4)}</h3>
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('\u2022 ')) {
          return (
            <ul key={i} className="space-y-1 ml-4">
              {trimmed.split('\n').map((line, j) => {
                const text = line.replace(/^[-\u2022]\s*/, '')
                return <li key={j} className="text-sm text-[var(--text)] list-disc">{renderInlineLinks(text)}</li>
              })}
            </ul>
          )
        }
        if (trimmed.startsWith('---')) {
          return <hr key={i} className="border-[var(--border)] my-4" />
        }

        return <p key={i}>{renderInlineLinks(trimmed)}</p>
      })}
    </div>
  )
}

function renderInlineLinks(text: string): React.ReactNode {
  const parts = text.split(/(\[\[[\w-]+\]\]|\*\*.*?\*\*)/g)
  return parts.map((part, i) => {
    const wikiMatch = part.match(/^\[\[([\w-]+)\]\]$/)
    if (wikiMatch) {
      return (
        <Link
          key={i}
          href={`/wiki/${wikiMatch[1]}`}
          className="text-[var(--accent)] hover:text-[var(--accent-hover)] underline underline-offset-2"
        >
          {wikiMatch[1].replace(/-/g, ' ')}
        </Link>
      )
    }
    const boldMatch = part.match(/^\*\*(.*?)\*\*$/)
    if (boldMatch) {
      return <strong key={i} className="text-[var(--text)] font-medium">{boldMatch[1]}</strong>
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
