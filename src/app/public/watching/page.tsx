'use client'

import { useState, useEffect } from 'react'

interface WatchingTask {
  id: string
  description: string
  waiting_on: string | null
  tracked_owner: string | null
  follow_up_date: string | null
  due_date: string | null
  updated_at: string
  created_at: string
  brand: string | null
}

export default function PublicWatchingPage() {
  const [tasks, setTasks] = useState<WatchingTask[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const token = params.get('token')
    if (!token) {
      setError('Missing token')
      setLoading(false)
      return
    }

    fetch(`/api/public/watching?token=${token}`)
      .then((res) => {
        if (!res.ok) throw new Error('Unauthorized')
        return res.json()
      })
      .then((data) => setTasks(data.tasks))
      .catch(() => setError('Unable to load'))
      .finally(() => setLoading(false))
  }, [])

  // Group by brand
  const byBrand = new Map<string, WatchingTask[]>()
  for (const t of tasks) {
    const brand = t.brand ?? 'General'
    const existing = byBrand.get(brand) ?? []
    existing.push(t)
    byBrand.set(brand, existing)
  }
  const groups = Array.from(byBrand.entries()).sort((a, b) => b[1].length - a[1].length)

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">Loading...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">{error}</p>
      </div>
    )
  }

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-3xl mx-auto px-4 py-8">
        <div className="mb-6">
          <h1 className="text-xl font-bold text-gray-900">Watching</h1>
          <p className="text-sm text-gray-500 mt-1">
            {tasks.length} items being tracked
          </p>
        </div>

        <div className="space-y-4">
          {groups.map(([brand, brandTasks]) => (
            <div key={brand}>
              <h2 className="text-sm font-semibold text-gray-600 uppercase tracking-wider mb-2">
                {brand} <span className="text-gray-400 font-normal">{brandTasks.length}</span>
              </h2>
              <div className="space-y-1.5">
                {brandTasks.map((task) => {
                  const isOverdue = task.follow_up_date && task.follow_up_date <= today
                  return (
                    <div
                      key={task.id}
                      className={`bg-white rounded-lg border px-4 py-3 ${isOverdue ? 'border-red-200' : 'border-gray-200'}`}
                    >
                      <p className="text-sm text-gray-900">{task.description}</p>
                      <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                        {task.tracked_owner && (
                          <span className="text-xs text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                            {task.tracked_owner}
                          </span>
                        )}
                        {task.waiting_on && (
                          <span className="text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                            waiting on {task.waiting_on}
                          </span>
                        )}
                        {task.follow_up_date && (
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${isOverdue ? 'text-red-700 bg-red-50 border-red-200 font-medium' : 'text-gray-500 border-gray-200'}`}>
                            follow up {task.follow_up_date}
                            {isOverdue && ' (overdue)'}
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>

        {tasks.length === 0 && (
          <p className="text-center text-gray-400 py-12">Nothing being tracked right now.</p>
        )}
      </div>
    </div>
  )
}
