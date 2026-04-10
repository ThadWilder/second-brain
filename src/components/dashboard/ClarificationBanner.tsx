'use client'

import { useState, useEffect } from 'react'
import { X, FileText } from 'lucide-react'

interface Clarification {
  id: string
  entity_id: string | null
  entry_id: string | null
  question: string
  context: string | null
  field: string
  suggestions: string[] | null
}

interface Props {
  clarifications: Clarification[]
}

const TYPE_LABELS: Record<string, string> = {
  brand: 'Brand',
  department: 'Internal Team',
  franchisee: 'Franchisee',
  contact: 'Team Member',
  vendor: 'Vendor',
  vendor_team: 'Vendor Team',
  freelancer: 'Freelancer',
}

const CATEGORY_OPTIONS = [
  { value: 'contact', label: 'Team Member' },
  { value: 'brand', label: 'Brand' },
  { value: 'department', label: 'Internal Team' },
  { value: 'franchisee', label: 'Franchisee' },
  { value: 'vendor', label: 'Vendor' },
  { value: 'vendor_team', label: 'Vendor Team' },
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'ignore', label: 'Ignore' },
]

export function ClarificationBanner({ clarifications }: Props) {
  const [items, setItems] = useState(clarifications)
  const [loading, setLoading] = useState<string | null>(null)
  const [sourcePanel, setSourcePanel] = useState<{ entryId: string; entityId: string | null; question: string } | null>(null)

  if (!items.length && !sourcePanel) return null

  async function resolve(id: string, resolution: string, entityId: string | null) {
    setLoading(id)
    try {
      const res = await fetch('/api/clarify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clarification_id: id, resolution, entity_id: entityId }),
      })
      if (res.ok) {
        setItems((prev) => prev.filter((c) => c.id !== id))
      }
    } finally {
      setLoading(null)
    }
  }

  return (
    <>
      <div className="space-y-2">
        <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-700 flex items-center gap-1.5">
          <span>❓</span>
          Help me categorize
          <span className="text-[var(--muted)] font-normal">({items.length})</span>
        </h2>
        {items.map((c) => (
          <div
            key={c.id}
            className="rounded-lg border border-amber-200 bg-amber-50 p-3"
          >
            <div className="flex items-start justify-between gap-2 mb-1">
              <p className="text-sm text-[var(--text)]">{c.question}</p>
              {c.entry_id && (
                <button
                  onClick={() => setSourcePanel({ entryId: c.entry_id!, entityId: c.entity_id, question: c.question })}
                  className="shrink-0 flex items-center gap-1 px-2 py-0.5 text-[10px] text-[var(--muted)] hover:text-[var(--accent)] border border-[var(--border)] rounded-md hover:border-[var(--accent)] transition-colors"
                  title="View source dumpling"
                >
                  <FileText className="w-3 h-3" />
                  Source
                </button>
              )}
            </div>
            {c.context && (
              <p className="text-xs text-[var(--muted)] mb-2 italic">
                &quot;{c.context}&quot;
              </p>
            )}
            <div className="flex flex-wrap gap-1.5">
              {(c.suggestions ?? []).map((s) => (
                <button
                  key={s}
                  onClick={() => resolve(c.id, s, c.entity_id)}
                  disabled={loading === c.id}
                  className="px-2.5 py-1 text-xs rounded-md border border-amber-300
                             bg-amber-100 text-amber-800 hover:bg-amber-200
                             transition-colors disabled:opacity-50"
                >
                  {formatCategory(s)}
                </button>
              ))}
              {CATEGORY_OPTIONS
                .filter((opt) => !(c.suggestions ?? []).includes(opt.value))
                .map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => resolve(c.id, opt.value, c.entity_id)}
                    disabled={loading === c.id}
                    className="px-2.5 py-1 text-xs rounded-md border border-[var(--border)]
                               bg-[var(--surface)] text-[var(--muted)] hover:text-[var(--text)] hover:border-[var(--accent)]
                               transition-colors disabled:opacity-50"
                  >
                    {opt.label}
                  </button>
                ))}
            </div>
          </div>
        ))}
      </div>

      {/* Source dumpling panel */}
      {sourcePanel && (
        <SourcePanel
          entryId={sourcePanel.entryId}
          entityId={sourcePanel.entityId}
          question={sourcePanel.question}
          onClose={() => setSourcePanel(null)}
        />
      )}
    </>
  )
}

function SourcePanel({ entryId, entityId, question, onClose }: { entryId: string; entityId: string | null; question: string; onClose: () => void }) {
  const [entry, setEntry] = useState<{ raw_text: string; source: string; created_at: string; source_meta: Record<string, string> } | null>(null)
  const [entity, setEntity] = useState<{ name: string; type: string; normalized_name: string } | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function load() {
      try {
        const [entryRes, entityRes] = await Promise.all([
          fetch(`/api/entries/${entryId}`),
          entityId ? fetch(`/api/entities/${entityId}`) : Promise.resolve(null),
        ])
        if (entryRes.ok) {
          const data = await entryRes.json()
          setEntry(data.entry)
        }
        if (entityRes?.ok) {
          const data = await entityRes.json()
          setEntity(data.entity)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [entryId, entityId])

  useEffect(() => {
    function handleKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative w-full max-w-md bg-[var(--surface)] border-l border-[var(--border)] shadow-xl overflow-y-auto animate-panel-slide-in">
        <div className="sticky top-0 bg-[var(--surface)] border-b border-[var(--border)] px-5 py-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-[var(--text)]">Source Dumpling</h3>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--text)] transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-5 py-4 space-y-4">
          <div>
            <p className="text-xs text-[var(--muted)] mb-1">Question</p>
            <p className="text-sm text-[var(--text)]">{question}</p>
          </div>

          {entity && (
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3">
              <p className="text-xs text-[var(--muted)] mb-1">Entity Claude Found</p>
              <p className="text-sm text-[var(--text)] font-medium">{entity.name}</p>
              <p className="text-xs text-[var(--muted)] mt-1">
                Resolved as: <span className="text-[var(--accent)] font-medium">{TYPE_LABELS[entity.type] ?? entity.type}</span>
              </p>
            </div>
          )}

          {!entity && !loading && entityId && (
            <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3">
              <p className="text-xs text-[var(--muted)] mb-1">Entity Claude Found</p>
              <p className="text-sm text-[var(--text)] italic">Unknown — could not resolve to an existing entity</p>
            </div>
          )}

          {loading ? (
            <p className="text-xs text-[var(--muted)]">Loading...</p>
          ) : entry ? (
            <>
              {entry.source_meta?.subject && (
                <div>
                  <p className="text-xs text-[var(--muted)] mb-1">Subject</p>
                  <p className="text-sm text-[var(--text)] font-medium">{entry.source_meta.subject}</p>
                </div>
              )}
              {entry.source_meta?.from && (
                <div>
                  <p className="text-xs text-[var(--muted)] mb-1">From</p>
                  <p className="text-sm text-[var(--text)]">{entry.source_meta.from}</p>
                </div>
              )}
              <div>
                <p className="text-xs text-[var(--muted)] mb-1">Full Content</p>
                <div className="bg-[var(--bg)] border border-[var(--border)] rounded-lg p-3 text-xs text-[var(--text)] whitespace-pre-wrap max-h-[60vh] overflow-y-auto leading-relaxed">
                  {entry.raw_text}
                </div>
              </div>
              <div>
                <p className="text-xs text-[var(--muted)]">
                  {entry.source} · {new Date(entry.created_at).toLocaleString()}
                </p>
              </div>
            </>
          ) : (
            <p className="text-xs text-[var(--muted)]">Source not found</p>
          )}
        </div>
      </div>
    </div>
  )
}

function formatCategory(value: string): string {
  const map: Record<string, string> = {
    contact: 'Team Member',
    brand: 'Brand',
    department: 'Internal Team',
    franchisee: 'Franchisee',
    vendor: 'Vendor',
    vendor_team: 'Vendor Team',
    freelancer: 'Freelancer',
    ignore: 'Ignore',
  }
  return map[value] ?? value
}
