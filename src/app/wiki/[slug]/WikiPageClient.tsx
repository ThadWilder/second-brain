'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, BookOpen, Lock, Loader2, Pencil, Pin, PinOff, Plus, Save, Send, Unlock, X } from 'lucide-react'
import { useParams } from 'next/navigation'

interface PinnedSection {
  title: string
  content: string
}

interface WikiPage {
  id: string
  slug: string
  title: string
  content: string
  summary: string
  source_count: number
  updated_at: string
  pinned_sections: PinnedSection[]
  locked: boolean
  last_manual_edit: string | null
  entity_id: string | null
  entities: { type: string; name: string } | null
}

interface WikiLink {
  context?: string
  wiki_pages?: { slug: string; title: string }
}

/** Parse markdown content into sections by ## headers */
function parseSections(content: string): Array<{ header: string; body: string }> {
  const sections: Array<{ header: string; body: string }> = []
  const lines = content.split('\n')
  let currentHeader = ''
  let currentBody: string[] = []

  for (const line of lines) {
    const headerMatch = line.match(/^## (.+)/)
    if (headerMatch) {
      if (currentHeader || currentBody.length > 0) {
        sections.push({ header: currentHeader, body: currentBody.join('\n').trim() })
      }
      currentHeader = headerMatch[1]
      currentBody = []
    } else {
      currentBody.push(line)
    }
  }

  if (currentHeader || currentBody.length > 0) {
    sections.push({ header: currentHeader, body: currentBody.join('\n').trim() })
  }

  return sections
}

export default function WikiPageClient() {
  const { slug } = useParams<{ slug: string }>()
  const [page, setPage] = useState<WikiPage | null>(null)
  const [outLinks, setOutLinks] = useState<WikiLink[]>([])
  const [inLinks, setInLinks] = useState<WikiLink[]>([])
  const [loading, setLoading] = useState(true)
  const [notFound, setNotFound] = useState(false)

  // Full-page edit mode state
  const [editing, setEditing] = useState(false)
  const [editContent, setEditContent] = useState('')
  const [saving, setSaving] = useState(false)

  // Section edit mode state
  const [editingSection, setEditingSection] = useState<string | null>(null)
  const [sectionEditContent, setSectionEditContent] = useState('')
  const [savingSection, setSavingSection] = useState(false)

  // Lock state
  const [locked, setLocked] = useState(false)
  const [togglingLock, setTogglingLock] = useState(false)

  // Pinned sections state
  const [pinnedSections, setPinnedSections] = useState<PinnedSection[]>([])
  const [addingPin, setAddingPin] = useState(false)
  const [newPinTitle, setNewPinTitle] = useState('')
  const [newPinContent, setNewPinContent] = useState('')

  // "Tell Claude" instruct state
  const [instruction, setInstruction] = useState('')
  const [instructing, setInstructing] = useState(false)

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
          setPinnedSections(data.page.pinned_sections ?? [])
          setLocked(data.page.locked ?? false)
          setOutLinks(data.outbound_links ?? [])
          setInLinks(data.inbound_links ?? [])
        }
      })
      .finally(() => setLoading(false))
  }, [slug])

  // ── Full page edit ──

  function startEditing() {
    if (!page) return
    const aiContent = stripPinnedFromContent(page.content, pinnedSections)
    setEditContent(aiContent)
    setEditing(true)
    setEditingSection(null)
  }

  async function saveContent() {
    if (!page) return
    setSaving(true)
    try {
      const res = await fetch(`/api/wiki/${page.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: editContent }),
      })
      if (res.ok) {
        setPage({ ...page, content: editContent })
        setEditing(false)
      }
    } finally {
      setSaving(false)
    }
  }

  // ── Section edit ──

  function startSectionEdit(header: string, body: string) {
    setEditingSection(header)
    setSectionEditContent(body)
    setEditing(false)
  }

  async function saveSectionEdit() {
    if (!page || !editingSection) return
    setSavingSection(true)
    try {
      const res = await fetch(`/api/wiki/${page.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: editingSection, content: sectionEditContent }),
      })
      if (res.ok) {
        // Re-fetch page to get updated content
        const refetch = await fetch(`/api/wiki/${page.slug}`)
        if (refetch.ok) {
          const data = await refetch.json()
          setPage(data.page)
          setPinnedSections(data.page.pinned_sections ?? [])
        }
        setEditingSection(null)
      }
    } finally {
      setSavingSection(false)
    }
  }

  // ── Lock toggle ──

  async function toggleLock() {
    if (!page) return
    setTogglingLock(true)
    try {
      const res = await fetch(`/api/wiki/${page.slug}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locked: !locked }),
      })
      if (res.ok) {
        setLocked(!locked)
        setPage({ ...page, locked: !locked })
      }
    } finally {
      setTogglingLock(false)
    }
  }

  // ── Pinned sections ──

  async function savePinnedSections(sections: PinnedSection[]) {
    if (!page) return
    const res = await fetch(`/api/wiki/${page.slug}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pinned_sections: sections }),
    })
    if (res.ok) {
      setPinnedSections(sections)
      setPage({ ...page, pinned_sections: sections })
    }
  }

  async function addPinnedSection() {
    if (!newPinTitle.trim() || !newPinContent.trim()) return
    const updated = [...pinnedSections, { title: newPinTitle.trim(), content: newPinContent.trim() }]
    await savePinnedSections(updated)
    setNewPinTitle('')
    setNewPinContent('')
    setAddingPin(false)
  }

  async function removePinnedSection(index: number) {
    const updated = pinnedSections.filter((_, i) => i !== index)
    await savePinnedSections(updated)
  }

  // ── Tell Claude ──

  async function submitInstruction() {
    if (!page || !instruction.trim()) return
    setInstructing(true)
    try {
      const res = await fetch(`/api/wiki/${page.slug}/instruct`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ instruction: instruction.trim() }),
      })
      if (res.ok) {
        const data = await res.json()
        setPage({ ...page, content: data.content })
        setInstruction('')
      }
    } finally {
      setInstructing(false)
    }
  }

  // ── Loading / not found ──

  if (loading) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
        <p className="text-sm text-[var(--muted)]">Loading...</p>
      </div>
    )
  }

  if (notFound || !page) {
    return (
      <div className="min-h-screen bg-[var(--bg)] flex flex-col items-center justify-center gap-3">
        <p className="text-[var(--muted)]">Wiki page not found.</p>
        <Link href="/wiki" className="text-sm text-[var(--accent)] hover:text-[var(--accent-hover)] flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to Wiki
        </Link>
      </div>
    )
  }

  // Get AI-generated content (without pinned section markdown)
  const aiContent = stripPinnedFromContent(page.content, pinnedSections)
  const sections = parseSections(aiContent)

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Header */}
      <header className="border-b border-[var(--border)] px-4 py-3 flex items-center gap-3">
        <Link href="/wiki" className="text-[var(--muted)] hover:text-[var(--text)] text-sm transition-colors flex items-center gap-1">
          <ArrowLeft className="w-3.5 h-3.5" />
          Wiki
        </Link>
        <span className="text-[var(--border)]">/</span>
        <span className="text-[var(--text)] font-semibold text-sm flex items-center gap-1">
          <BookOpen className="w-3.5 h-3.5" />
          {page.title}
        </span>
        <div className="ml-auto flex items-center gap-3 text-xs text-[var(--muted)]">
          <span>{page.source_count} sources</span>
          <span>updated {formatAge(page.updated_at)}</span>

          {/* Lock toggle */}
          <button
            onClick={toggleLock}
            disabled={togglingLock}
            className={`flex items-center gap-1 px-2 py-1 rounded transition-colors border ${
              locked
                ? 'text-amber-600 bg-amber-50 border-amber-200 hover:bg-amber-100'
                : 'text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] border-transparent hover:border-[var(--border)]'
            }`}
            title={locked ? 'Locked — auto-updates paused. Click to unlock.' : 'Click to lock and pause auto-updates'}
          >
            {locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
            {locked ? 'Locked' : 'Lock'}
          </button>

          {/* Edit full page button */}
          {!editing && !editingSection && (
            <button
              onClick={startEditing}
              className="flex items-center gap-1 px-2 py-1 rounded text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] border border-transparent hover:border-[var(--border)] transition-colors"
            >
              <Pencil className="w-3 h-3" />
              Edit
            </button>
          )}

          {/* Archive */}
          {page.entity_id && (
            <button
              onClick={async () => {
                if (!confirm('Archive this wiki page? It will be hidden from the index.')) return
                await fetch('/api/entities/update', {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ entity_id: page.entity_id, archived: true }),
                })
                window.location.href = '/wiki'
              }}
              className="flex items-center gap-1 px-2 py-1 rounded text-[var(--muted)] hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
            >
              Archive
            </button>
          )}
        </div>
      </header>

      {/* Locked indicator */}
      {locked && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex items-center gap-2 text-xs text-amber-700">
          <Lock className="w-3 h-3" />
          <span>Locked — auto-updates paused. Unlock to re-enable AI regeneration.</span>
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-6">
        {/* Summary */}
        {page.summary && (
          <div className="mb-6 p-4 rounded-lg bg-amber-50 border border-amber-200">
            <p className="text-sm text-[var(--text)] leading-relaxed">{page.summary}</p>
          </div>
        )}

        {/* Pinned Sections */}
        {pinnedSections.length > 0 && (
          <div className="mb-6 space-y-3">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)]">
              <Pin className="w-3 h-3" />
              Pinned by you
            </div>
            {pinnedSections.map((section, i) => (
              <div
                key={i}
                className="rounded-lg bg-amber-50/50 border border-amber-200/60 border-l-4 border-l-[var(--accent)] p-4"
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <h3 className="text-sm font-semibold text-[var(--text)] flex items-center gap-1.5">
                    <span>📌</span>
                    {section.title}
                  </h3>
                  <button
                    onClick={() => removePinnedSection(i)}
                    className="flex items-center gap-1 px-1.5 py-0.5 rounded text-xs text-[var(--muted)] hover:text-[var(--danger)] hover:bg-red-50 transition-colors"
                    title="Unpin — content will be overwritten on next regeneration"
                  >
                    <PinOff className="w-3 h-3" />
                    Unpin
                  </button>
                </div>
                <div className="text-sm text-[var(--text)] leading-relaxed">
                  <WikiContent content={section.content} />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Add pinned section */}
        {!editing && !editingSection && (
          <div className="mb-6">
            {addingPin ? (
              <div className="rounded-lg border border-amber-200/60 bg-amber-50/30 p-4 space-y-3">
                <input
                  type="text"
                  placeholder="Section title"
                  value={newPinTitle}
                  onChange={(e) => setNewPinTitle(e.target.value)}
                  className="w-full px-3 py-1.5 rounded border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)]"
                />
                <textarea
                  placeholder="Section content (markdown)"
                  value={newPinContent}
                  onChange={(e) => setNewPinContent(e.target.value)}
                  rows={4}
                  className="w-full px-3 py-2 rounded border border-[var(--border)] bg-[var(--surface)] text-sm font-mono text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] resize-y"
                />
                <div className="flex gap-2">
                  <button
                    onClick={addPinnedSection}
                    disabled={!newPinTitle.trim() || !newPinContent.trim()}
                    className="flex items-center gap-1 px-3 py-1.5 rounded text-xs font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
                  >
                    <Pin className="w-3 h-3" />
                    Pin section
                  </button>
                  <button
                    onClick={() => { setAddingPin(false); setNewPinTitle(''); setNewPinContent('') }}
                    className="px-3 py-1.5 rounded text-xs text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setAddingPin(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-[var(--accent)] hover:text-[var(--accent-hover)] hover:bg-amber-50/50 border border-amber-200/40 hover:border-amber-200 transition-colors"
              >
                <Plus className="w-3 h-3" />
                Add pinned section
              </button>
            )}
          </div>
        )}

        {/* Divider between pinned and generated */}
        {pinnedSections.length > 0 && aiContent.trim() && !editing && (
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-4">
            <span>🤖</span>
            Generated by Claude
          </div>
        )}

        {/* Content — full-page edit mode */}
        {editing ? (
          <div className="space-y-3">
            <textarea
              value={editContent}
              onChange={(e) => setEditContent(e.target.value)}
              className="w-full min-h-[400px] px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)] resize-y leading-relaxed"
            />
            <div className="flex gap-2">
              <button
                onClick={saveContent}
                disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
              >
                <Save className="w-3.5 h-3.5" />
                {saving ? 'Saving...' : 'Save'}
              </button>
              <button
                onClick={() => setEditing(false)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
              >
                <X className="w-3.5 h-3.5" />
                Cancel
              </button>
            </div>
          </div>
        ) : aiContent.trim() ? (
          /* Content — section-by-section view with inline edit buttons */
          <div>
            {sections.map((section, i) => {
              const isPinned = section.header.startsWith('📌')

              // Inline section editing
              if (editingSection === section.header) {
                return (
                  <div key={i} className="mb-6">
                    <h2 className="text-base font-semibold text-[var(--text)] mb-3">{section.header}</h2>
                    <textarea
                      value={sectionEditContent}
                      onChange={(e) => setSectionEditContent(e.target.value)}
                      className="w-full min-h-[200px] px-4 py-3 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm font-mono text-[var(--text)] focus:outline-none focus:border-[var(--accent)] resize-y leading-relaxed"
                    />
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={saveSectionEdit}
                        disabled={savingSection}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-50 transition-colors"
                      >
                        <Save className="w-3 h-3" />
                        {savingSection ? 'Saving...' : 'Save section'}
                      </button>
                      <button
                        onClick={() => setEditingSection(null)}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] transition-colors"
                      >
                        <X className="w-3 h-3" />
                        Cancel
                      </button>
                    </div>
                  </div>
                )
              }

              // Normal view — show section with edit icon on header
              if (section.header && !isPinned) {
                return (
                  <div key={i} className="group mb-2">
                    <div className="flex items-center gap-2 mt-6 mb-2">
                      <h2 className="text-base font-semibold text-[var(--text)]">{section.header}</h2>
                      <button
                        onClick={() => startSectionEdit(section.header, section.body)}
                        className="opacity-0 group-hover:opacity-100 p-1 rounded text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface)] transition-all"
                        title={`Edit "${section.header}" section`}
                      >
                        <Pencil className="w-3 h-3" />
                      </button>
                    </div>
                    <WikiContent content={section.body} />
                  </div>
                )
              }

              // No header (preamble content) or pinned — just render
              return (
                <div key={i} className="mb-2">
                  {section.header && (
                    <h2 className="text-base font-semibold text-[var(--text)] mt-6 mb-2">{section.header}</h2>
                  )}
                  <WikiContent content={section.body} />
                </div>
              )
            })}
          </div>
        ) : !pinnedSections.length ? (
          <div className="text-center py-12">
            <p className="text-[var(--muted)] mb-2">This page is empty.</p>
            <p className="text-xs text-[var(--muted)]">
              It will be populated automatically when you ingest data related to {page.title}.
            </p>
          </div>
        ) : null}

        {/* Tell Claude */}
        {!editing && !editingSection && (
          <div className="mt-8 pt-6 border-t border-[var(--border)]">
            <div className="flex gap-2">
              <input
                type="text"
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !instructing) submitInstruction() }}
                placeholder="Tell Claude what to change..."
                disabled={instructing}
                className="flex-1 px-3 py-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] text-sm text-[var(--text)] placeholder:text-[var(--muted)] focus:outline-none focus:border-[var(--accent)] disabled:opacity-50"
              />
              <button
                onClick={submitInstruction}
                disabled={instructing || !instruction.trim()}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium bg-[var(--accent)] text-white hover:bg-[var(--accent-hover)] disabled:opacity-40 transition-colors"
              >
                {instructing ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Updating...
                  </>
                ) : (
                  <>
                    <Send className="w-3.5 h-3.5" />
                    Update
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Links */}
        {(outLinks.length > 0 || inLinks.length > 0) && (
          <div className="mt-8 pt-6 border-t border-[var(--border)]">
            {outLinks.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">
                  Links to
                </h3>
                <div className="flex flex-wrap gap-2">
                  {outLinks.map((link, i) => (
                    <Link
                      key={i}
                      href={`/wiki/${link.wiki_pages?.slug}`}
                      className="px-2.5 py-1 text-xs rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--accent)] hover:text-[var(--accent-hover)] hover:border-[var(--accent)] transition-colors"
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
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">
                  Linked from
                </h3>
                <div className="flex flex-wrap gap-2">
                  {inLinks.map((link, i) => (
                    <Link
                      key={i}
                      href={`/wiki/${link.wiki_pages?.slug}`}
                      className="px-2.5 py-1 text-xs rounded-md bg-[var(--surface)] border border-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] transition-colors"
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

/**
 * Strip pinned section markdown from the stored content to get just the AI-generated part.
 * Pinned sections are stored as "## 📌 Title\n\ncontent" blocks separated by "---" from AI content.
 */
function stripPinnedFromContent(content: string, pinnedSections: PinnedSection[]): string {
  if (!pinnedSections.length || !content) return content
  // The stored content has pinned sections prepended with a --- divider before AI content
  // Find the divider after pinned sections
  const dividerIndex = content.indexOf('\n\n---\n\n')
  if (dividerIndex === -1) return content
  // Check if the content starts with pinned section markers
  if (content.startsWith('## 📌')) {
    return content.slice(dividerIndex + '\n\n---\n\n'.length)
  }
  return content
}

/** Render wiki markdown content with [[slug]] link support */
function WikiContent({ content }: { content: string }) {
  return (
    <div className="text-sm text-[var(--text)] leading-relaxed space-y-3">
      {content.split('\n\n').map((block, i) => {
        const trimmed = block.trim()
        if (!trimmed) return null

        if (trimmed.startsWith('## ')) {
          return <h2 key={i} className="text-base font-semibold text-[var(--text)] mt-6 mb-2">{trimmed.slice(3)}</h2>
        }
        if (trimmed.startsWith('### ')) {
          return <h3 key={i} className="text-sm font-semibold text-[var(--text)] mt-4 mb-1">{trimmed.slice(4)}</h3>
        }
        if (trimmed.startsWith('- ') || trimmed.startsWith('• ')) {
          return (
            <ul key={i} className="space-y-1 ml-4">
              {trimmed.split('\n').map((line, j) => {
                const text = line.replace(/^[-•]\s*/, '')
                return <li key={j} className="text-sm text-[var(--text)] list-disc">{renderInlineLinks(text)}</li>
              })}
            </ul>
          )
        }
        if (trimmed.startsWith('---')) {
          return <hr key={i} className="border-[var(--border)] my-4" />
        }
        // Skip raw JSON blocks that leaked through wiki synthesis
        if (trimmed.startsWith('```json') || trimmed.startsWith('{"summary"')) {
          return null
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
