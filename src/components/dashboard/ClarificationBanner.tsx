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
  { value: 'team', label: 'Team member' },
  { value: 'client_contact', label: 'Client contact' },
  { value: 'freelancer', label: 'Freelancer' },
  { value: 'external', label: 'External' },
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
      <h2 className="text-xs font-semibold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
        <span>❓</span>
        Help me categorize
        <span className="text-slate-500 font-normal">({items.length})</span>
      </h2>
      {items.map((c) => (
        <div
          key={c.id}
          className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3"
        >
          <p className="text-sm text-slate-200 mb-1">{c.question}</p>
          {c.context && (
            <p className="text-xs text-slate-500 mb-2 italic">
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
                className="px-2.5 py-1 text-xs rounded-md border border-amber-500/30 
                           bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 
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
                  className="px-2.5 py-1 text-xs rounded-md border border-[#2a3150] 
                             bg-[#1a2035] text-slate-400 hover:text-slate-200 hover:border-slate-500
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
    team: 'Team member',
    client_contact: 'Client contact',
    freelancer: 'Freelancer',
    external: 'External',
    unknown: 'Unknown',
  }
  return map[value] ?? value
}
