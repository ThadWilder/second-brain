'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Tag, ArrowLeft } from 'lucide-react'
import { Header } from '@/components/ui/Header'
import { StatusBadge } from '@/components/ui/StatusBadge'
import { AutoLinkText } from '@/components/ui/AutoLinkText'
import type { TaskStatus } from '@/types'

const TAG_PALETTE = [
  { bg: '#fef3c7', text: '#92400e', border: '#fcd34d' },
  { bg: '#dbeafe', text: '#1e40af', border: '#93c5fd' },
  { bg: '#f3e8ff', text: '#6b21a8', border: '#c4b5fd' },
  { bg: '#dcfce7', text: '#166534', border: '#86efac' },
  { bg: '#ffe4e6', text: '#9f1239', border: '#fda4af' },
  { bg: '#e0f2fe', text: '#075985', border: '#7dd3fc' },
  { bg: '#fef9c3', text: '#854d0e', border: '#fde047' },
  { bg: '#fce7f3', text: '#9d174d', border: '#f9a8d4' },
]

function tagColor(tag: string) {
  let hash = 0
  for (let i = 0; i < tag.length; i++) {
    hash = tag.charCodeAt(i) + ((hash << 5) - hash)
  }
  return TAG_PALETTE[Math.abs(hash) % TAG_PALETTE.length]
}

interface TaskWithEntities {
  id: string
  description: string
  status: TaskStatus
  escalation: boolean
  due_date: string | null
  waiting_on: string | null
  tracked_owner: string | null
  follow_up_date: string | null
  tags: string[]
  created_at: string
  entities: Array<{ id: string; name: string; type: string; role: string }>
}

export default function TagDetailPage() {
  const params = useParams()
  const tag = decodeURIComponent(params.tag as string)
  const [tasks, setTasks] = useState<TaskWithEntities[]>([])
  const [loading, setLoading] = useState(true)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tags/${encodeURIComponent(tag)}`)
      if (!res.ok) return
      const data = await res.json()
      setTasks(data.tasks ?? [])
    } finally {
      setLoading(false)
    }
  }, [tag])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Group tasks by brand
  const grouped: Record<string, { brand: string; tasks: TaskWithEntities[] }> = {}
  for (const task of tasks) {
    const brand = task.entities?.find((e) => e.role === 'brand')
    const brandName = brand?.name ?? 'Unassigned'
    if (!grouped[brandName]) {
      grouped[brandName] = { brand: brandName, tasks: [] }
    }
    grouped[brandName].tasks.push(task)
  }
  const groups = Object.values(grouped).sort((a, b) => a.brand.localeCompare(b.brand))

  // Stats
  const total = tasks.length
  const openCount = tasks.filter((t) => t.status === 'open' || t.status === 'blocked').length
  const trackingCount = tasks.filter((t) => t.status === 'tracking').length
  const platedCount = tasks.filter((t) => t.status === 'done').length
  const completionPct = total > 0 ? Math.round((platedCount / total) * 100) : 0

  const color = tagColor(tag)

  return (
    <div className="min-h-screen flex flex-col">
      <Header activePage="tags" />

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-[1100px] mx-auto px-4 py-8 space-y-6">
          {/* Back link + Title */}
          <div>
            <Link href="/tags" className="inline-flex items-center gap-1 text-xs text-[var(--muted)] hover:text-[var(--accent)] transition-colors mb-3">
              <ArrowLeft className="w-3 h-3" />
              All tags
            </Link>
            <div className="flex items-center gap-3">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium"
                style={{
                  backgroundColor: color.bg,
                  color: color.text,
                  borderColor: color.border,
                  border: '1px solid',
                }}
              >
                <Tag className="w-3.5 h-3.5" />
                {tag}
              </span>
              {!loading && (
                <span className="text-sm text-[var(--muted)]">
                  {total} task{total !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          </div>

          {loading && (
            <div className="text-center py-12 text-[var(--muted)]">Loading...</div>
          )}

          {!loading && tasks.length === 0 && (
            <div className="text-center py-16">
              <Tag size={40} className="mx-auto text-[var(--muted)] mb-3 opacity-40" />
              <p className="text-[var(--muted)] text-sm">No tasks with this tag</p>
            </div>
          )}

          {!loading && tasks.length > 0 && (
            <>
              {/* Stats bar */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl p-4">
                <div className="flex items-center gap-6 text-sm">
                  <div>
                    <span className="text-[var(--muted)]">Total</span>
                    <span className="ml-1.5 font-semibold text-[var(--text)]">{total}</span>
                  </div>
                  <div>
                    <span className="text-blue-600">Open</span>
                    <span className="ml-1.5 font-semibold text-blue-700">{openCount}</span>
                  </div>
                  <div>
                    <span className="text-purple-600">Tracking</span>
                    <span className="ml-1.5 font-semibold text-purple-700">{trackingCount}</span>
                  </div>
                  <div>
                    <span className="text-green-600">Plated</span>
                    <span className="ml-1.5 font-semibold text-green-700">{platedCount}</span>
                  </div>
                </div>
                {/* Progress bar */}
                <div className="mt-3 h-2 bg-[var(--bg)] rounded-full overflow-hidden">
                  <div
                    className="h-full bg-green-500 rounded-full transition-all"
                    style={{ width: `${completionPct}%` }}
                  />
                </div>
                <p className="text-xs text-[var(--muted)] mt-1.5">{completionPct}% complete</p>
              </div>

              {/* Tasks grouped by brand */}
              <div className="space-y-6">
                {groups.map(({ brand, tasks: brandTasks }) => (
                  <div key={brand}>
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)] mb-2">
                      {brand}
                    </h2>
                    <div className="space-y-1.5">
                      {brandTasks.map((task) => {
                        const brandEntity = task.entities?.find((e) => e.role === 'brand')
                        return (
                          <div
                            key={task.id}
                            className={`flex items-start gap-3 py-3 px-4 rounded-lg border transition-colors ${
                              task.escalation
                                ? 'bg-red-50 border-red-200'
                                : 'bg-[var(--surface)] border-[var(--border)]'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <p className="text-base text-[var(--text)] leading-snug">
                                <AutoLinkText text={task.description} />
                              </p>
                              <div className="flex items-center gap-2 mt-1 flex-wrap">
                                <StatusBadge status={task.status} />
                                {brandEntity && (
                                  <span className="text-xs bg-blue-50 text-blue-700 border border-blue-200 px-1.5 py-0.5 rounded-full">
                                    {brandEntity.name}
                                  </span>
                                )}
                                {task.entities
                                  ?.filter((e) => e.role !== 'brand')
                                  .map((e) => (
                                    <span key={e.id} className="text-xs text-[var(--muted)]">
                                      {e.name}
                                    </span>
                                  ))}
                                {task.waiting_on && (
                                  <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                    ⏳ {task.waiting_on}
                                  </span>
                                )}
                                {task.tracked_owner && (
                                  <span className="inline-flex items-center gap-1 text-xs text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded border border-purple-200">
                                    👁️ {task.tracked_owner}
                                  </span>
                                )}
                                {task.due_date && (
                                  <span className="text-xs text-[var(--muted)]">due {task.due_date}</span>
                                )}
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
