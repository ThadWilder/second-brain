'use client'

import { useState, useEffect } from 'react'
import type { Entity } from '@/types'

interface Props {
  entity: Entity        // the entity card the user clicked "merge" on
  allEntities: Entity[] // all entities of the same type (to pick merge target)
  onClose: () => void
  onMerged: () => void  // refresh after merge
}

export function MergeModal({ entity, allEntities, onClose, onMerged }: Props) {
  const [canonicalId, setCanonicalId] = useState<string>('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Filter to same-type entities, excluding self
  const candidates = allEntities.filter(
    (e) => e.id !== entity.id && e.type === entity.type
  )

  async function handleMerge() {
    if (!canonicalId) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/entities/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonical_id: canonicalId,
          duplicate_id: entity.id,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Merge failed')
        return
      }

      onMerged()
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  // Close on Escape
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[#1a1d27] border border-[#2a2d3a] rounded-xl p-5 w-full max-w-md shadow-2xl">
        <h3 className="text-sm font-semibold text-slate-200 mb-1">
          Merge entity
        </h3>
        <p className="text-xs text-slate-400 mb-4">
          Merge <span className="text-slate-200 font-medium">"{entity.name}"</span> into
          another {entity.type}. All tasks, entries, decisions, and wiki content will be
          moved to the target. "{entity.name}" will become an alias.
        </p>

        {/* Target picker */}
        <label className="block text-xs text-slate-400 mb-1.5">
          Merge into:
        </label>
        <select
          value={canonicalId}
          onChange={(e) => setCanonicalId(e.target.value)}
          className="w-full bg-[#0f1117] border border-[#2a2d3a] rounded-lg px-3 py-2 text-sm
                     text-slate-200 focus:outline-none focus:border-blue-500 mb-4
                     appearance-none cursor-pointer"
        >
          <option value="">Select the canonical entity...</option>
          {candidates.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
              {c.metadata && (c.metadata as Record<string, string>).category
                ? ` (${(c.metadata as Record<string, string>).category})`
                : ''}
            </option>
          ))}
        </select>

        {/* Preview */}
        {canonicalId && (
          <div className="text-xs text-slate-400 mb-4 p-2 rounded bg-[#0f1117] border border-[#2a2d3a]">
            <span className="text-red-400 line-through">{entity.name}</span>
            {' → '}
            <span className="text-green-400">
              {candidates.find((c) => c.id === canonicalId)?.name}
            </span>
            <p className="mt-1 text-slate-500">
              "{entity.name}" will be added as an alias. All linked data moves to the target.
            </p>
          </div>
        )}

        {error && (
          <p className="text-xs text-red-400 mb-3">{error}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-lg border border-[#2a2d3a] text-slate-400
                       hover:text-slate-200 hover:border-slate-500 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleMerge}
            disabled={!canonicalId || loading}
            className="px-3 py-1.5 text-xs rounded-lg bg-blue-600 text-white
                       hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            {loading ? 'Merging...' : 'Merge'}
          </button>
        </div>
      </div>
    </div>
  )
}
