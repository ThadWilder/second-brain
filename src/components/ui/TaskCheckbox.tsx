'use client'

import { useState } from 'react'
import { Check } from 'lucide-react'

interface TaskCheckboxProps {
  taskId: string
  checked: boolean
  onComplete?: (taskId: string) => void
}

export function TaskCheckbox({ taskId, checked, onComplete }: TaskCheckboxProps) {
  const [loading, setLoading] = useState(false)
  const [done, setDone] = useState(checked)

  async function handleChange() {
    if (done || loading) return
    setLoading(true)
    try {
      const res = await fetch('/api/tasks', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: taskId, status: 'done' }),
      })
      if (res.ok) {
        setDone(true)
        onComplete?.(taskId)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleChange}
      disabled={loading || done}
      className="flex items-center justify-center w-5 h-5 rounded border border-[var(--border)]
                 hover:border-green-600 transition-colors disabled:opacity-50 shrink-0
                 focus:outline-none focus:ring-2 focus:ring-green-500/50"
      aria-label={done ? 'Task complete' : 'Mark complete'}
    >
      {loading ? (
        <span className="w-3 h-3 border border-[var(--muted)] border-t-transparent rounded-full animate-spin" />
      ) : done ? (
        <Check className="w-3 h-3 text-green-700" />
      ) : null}
    </button>
  )
}
