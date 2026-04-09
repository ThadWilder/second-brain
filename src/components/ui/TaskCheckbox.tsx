'use client'

import { useState } from 'react'

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
      className="flex items-center justify-center w-5 h-5 rounded border border-slate-600 
                 hover:border-green-500 transition-colors disabled:opacity-50 shrink-0
                 focus:outline-none focus:ring-2 focus:ring-green-500/50"
      aria-label={done ? 'Task complete' : 'Mark complete'}
    >
      {loading ? (
        <span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
      ) : done ? (
        <svg className="w-3 h-3 text-green-400" viewBox="0 0 12 12" fill="none">
          <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : null}
    </button>
  )
}
