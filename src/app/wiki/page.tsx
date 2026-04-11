'use client'

import { useState, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { CollapsibleSection } from '@/components/dashboard/CollapsibleSection'

interface WikiPageSummary {
  id: string
  slug: string
  title: string
  summary: string
  source_count: number
  updated_at: string
  entities: { type: string; name: string } | null
}

type SortMode = 'az' | 'recent'

const ENTITY_SECTIONS: { key: string; label: string; icon: string; types: string[] }[] = [
  { key: 'brands', label: 'Brands', icon: '🏢', types: ['brand'] },
  { key: 'internal', label: 'Internal Team', icon: '🏠', types: ['department'] },
  { key: 'people', label: 'People', icon: '👤', types: ['contact', 'vendor_team', 'freelancer'] },
  { key: 'franchisees', label: 'Franchisees', icon: '🏪', types: ['franchisee'] },
  { key: 'vendors', label: 'Vendors', icon: '🤝', types: ['vendor'] },
]

const KNOWN_TYPES = new Set(ENTITY_SECTIONS.flatMap((s) => s.types))

const TYPE_ICONS: Record<string, string> = {
  brand: '🏢',
  vendor: '🤝',
  contact: '👤',
  vendor_team: '👤',
  freelancer: '👤',
  department: '🏠',
  franchisee: '🏪',
  topic: '🏷️',
}

function sortAZ(a: WikiPageSummary, b: WikiPageSummary) {
  return a.title.localeCompare(b.title)
}

function sortRecent(a: WikiPageSummary, b: WikiPageSummary) {
  return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime()
}

export default function WikiIndex() {
  const [pages, setPages] = useState<WikiPageSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [sort, setSort] = useState<SortMode>('az')

  useEffect(() => {
    fetch('/api/wiki')
      .then((res) => res.json())
      .then((data) => setPages(data.pages ?? []))
      .finally(() => setLoading(false))
  }, [])

  // Group pages by entity type sections
  const { sections, other } = useMemo(() => {
    const cmp = sort === 'az' ? sortAZ : sortRecent
    const grouped: Record<string, WikiPageSummary[]> = {}
    const other: WikiPageSummary[] = []

    for (const page of pages) {
      const type = page.entities?.type
      if (!type || !KNOWN_TYPES.has(type)) {
        other.push(page)
        continue
      }
      const section = ENTITY_SECTIONS.find((s) => s.types.includes(type))
      if (section) {
        ;(grouped[section.key] ??= []).push(page)
      } else {
        other.push(page)
      }
    }

    const sections = ENTITY_SECTIONS
      .filter((s) => grouped[s.key]?.length)
      .map((s) => ({ ...s, pages: grouped[s.key].sort(cmp) }))

    return { sections, other: other.sort(cmp) }
  }, [pages, sort])

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <header className="border-b border-[var(--border)] px-4 py-3 flex items-center gap-3">
        <Link href="/" className="text-[var(--muted)] hover:text-[var(--text)] text-sm transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          Dashboard
        </Link>
        <span className="text-[var(--border)]">/</span>
        <span className="text-[var(--text)] font-semibold text-sm flex items-center gap-1">
          <BookOpen className="w-3.5 h-3.5" />
          Wiki
        </span>
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
            {/* Sort toggle */}
            <div className="flex items-center gap-1">
              <span className="text-xs text-[var(--muted)] mr-2">Sort:</span>
              <SortButton active={sort === 'az'} onClick={() => setSort('az')}>A-Z</SortButton>
              <SortButton active={sort === 'recent'} onClick={() => setSort('recent')}>Recently Updated</SortButton>
            </div>

            {sort === 'az' ? (
              <>
                {/* Grouped by entity type */}
                {sections.map((section) => (
                  <CollapsibleSection
                    key={section.key}
                    title={section.label}
                    icon={section.icon}
                    count={section.pages.length}
                    defaultExpanded={false}
                  >
                    <div className="space-y-2">
                      {section.pages.map((page) => (
                        <WikiCard key={page.id} page={page} />
                      ))}
                    </div>
                  </CollapsibleSection>
                ))}

                {other.length > 0 && (
                  <CollapsibleSection
                    title="Other"
                    icon="📄"
                    count={other.length}
                    defaultExpanded={false}
                  >
                    <div className="space-y-2">
                      {other.map((page) => (
                        <WikiCard key={page.id} page={page} />
                      ))}
                    </div>
                  </CollapsibleSection>
                )}
              </>
            ) : (
              /* Flattened list sorted by recently updated */
              <div className="space-y-2">
                {[...pages].sort(sortRecent).map((page) => (
                  <WikiCard key={page.id} page={page} showTypeBadge />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

function SortButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-2.5 py-1 text-xs rounded-md transition-colors cursor-pointer ${
        active
          ? 'bg-[var(--accent)] text-white font-medium'
          : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)]'
      }`}
    >
      {children}
    </button>
  )
}

function WikiCard({ page, showTypeBadge }: { page: WikiPageSummary; showTypeBadge?: boolean }) {
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
          <div className="flex items-center gap-2 mb-1 flex-wrap">
            <span className="text-sm font-medium text-[var(--text)]">{page.title}</span>
            {showTypeBadge && page.entities?.type && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--border)] text-[var(--muted)]">
                {ENTITY_SECTIONS.find((s) => s.types.includes(page.entities!.type))?.label ?? page.entities.type}
              </span>
            )}
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
