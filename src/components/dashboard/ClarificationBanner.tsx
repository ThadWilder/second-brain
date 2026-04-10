'use client'

import { useState } from 'react'

interface Clarification {
  id: string
  entity_id: string | null
  question: string
  context: string | null
  field: string
  suggestions: string[] | null
}

interface Props {
  clarifications: Clarification[]
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

  if (!items.length) return null

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
          <p className="text-sm text-[var(--text)] mb-1">{c.question}</p>
          {c.context && (
            <p className="text-xs text-[var(--muted)] mb-2 italic">
              "{c.context}"
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {/* Show suggestions first if any */}
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
            {/* Then all other options */}
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
