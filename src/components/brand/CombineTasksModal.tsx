'use client'

import { useState, useEffect } from 'react'
import { X, GitMerge } from 'lucide-react'
import type { Task } from '@/types'

interface Props {
  tasks: Task[]
  brandId: string
  onClose: () => void
  onCombined: (newTask: Task) => void
}

export function CombineTasksModal({ tasks, brandId, onClose, onCombined }: Props) {
  const merged = tasks.map((t) => t.description).join('\n\n')
  const [description, setDescription] = useState(merged)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [onClose])

  async function handleCombine() {
    if (!description.trim()) return
    setLoading(true)
    setError(null)

    try {
      const res = await fetch('/api/tasks/merge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          task_ids: tasks.map((t) => t.id),
          description: description.trim(),
          brand_id: brandId,
        }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error ?? 'Combine failed')
        return
      }

      const { task } = await res.json()
      onCombined(task)
    } catch {
      setError('Network error')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-[var(--surface)] border border-[var(--border)] rounded-xl p-5 w-full max-w-lg shadow-2xl">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-sm font-semibold text-[var(--text)]">
            <GitMerge className="w-3.5 h-3.5 inline mr-1" />
            Combine {tasks.length} tasks
          </h3>
          <button
            onClick={onClose}
            className="text-[var(--muted)] hover:text-[var(--text)] transition-colors"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p className="text-xs text-[var(--muted)] mb-4">
          The selected tasks will be closed and replaced with one combined task.
          All entity links will be transferred.
        </p>

        {/* Source tasks preview */}
        <div className="mb-3">
          <label className="block text-xs text-[var(--muted)] mb-1.5">
            Tasks being combined:
          </label>
          <div className="space-y-1 max-h-32 overflow-y-auto">
            {tasks.map((t) => (
              <div
                key={t.id}
                className="text-xs text-[var(--text)] p-2 rounded bg-[var(--bg)] border border-[var(--border)]"
              >
                {t.description}
              </div>
            ))}
          </div>
        </div>

        {/* Combined description editor */}
        <label className="block text-xs text-[var(--muted)] mb-1.5">
          Combined task description:
        </label>
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={4}
          className="w-full bg-[var(--bg)] border border-[var(--border)] rounded-lg px-3 py-2 text-sm
                     text-[var(--text)] focus:outline-none focus:border-[var(--accent)] mb-4
                     resize-y"
          placeholder="Describe the combined task..."
        />

        {error && (
          <p className="text-xs text-[var(--danger)] mb-3">{error}</p>
        )}

        {/* Actions */}
        <div className="flex justify-end gap-2">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs rounded-lg border border-[var(--border)] text-[var(--muted)]
                       hover:text-[var(--text)] hover:border-[var(--accent)] transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleCombine}
            disabled={!description.trim() || loading}
            className="px-3 py-1.5 text-xs rounded-lg bg-[var(--accent)] text-white
                       hover:bg-[var(--accent-hover)] disabled:opacity-40 disabled:cursor-not-allowed
                       transition-colors"
          >
            {loading ? 'Combining...' : (
              <>
                <GitMerge className="w-3.5 h-3.5 inline mr-1" />
                Combine
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  )
}
