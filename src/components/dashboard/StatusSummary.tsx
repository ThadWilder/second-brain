'use client'

import type { DashboardStats } from '@/types'

interface Props {
  stats: DashboardStats
}

const STAT_CONFIGS = [
  {
    key: 'escalations' as const,
    label: 'Escalations',
    color: 'text-red-700',
    bg: 'bg-[var(--surface)] border-[var(--border)]',
    dot: 'bg-red-500',
  },
  {
    key: 'needs_response' as const,
    label: 'Needs Response',
    color: 'text-amber-700',
    bg: 'bg-[var(--surface)] border-[var(--border)]',
    dot: 'bg-amber-500',
  },
  {
    key: 'open_tasks' as const,
    label: 'Open Tasks',
    color: 'text-[var(--accent)]',
    bg: 'bg-[var(--surface)] border-[var(--border)]',
    dot: 'bg-[var(--accent)]',
  },
  {
    key: 'closed_7d' as const,
    label: 'Closed (7d)',
    color: 'text-green-700',
    bg: 'bg-[var(--surface)] border-[var(--border)]',
    dot: 'bg-green-500',
  },
]

export function StatusSummary({ stats }: Props) {
  return (
    <div className="grid grid-cols-4 gap-3">
      {STAT_CONFIGS.map((config) => (
        <div
          key={config.key}
          className={`rounded-lg border p-3 ${config.bg}`}
        >
          <div className="flex items-center gap-1.5 mb-1">
            <span className={`w-2 h-2 rounded-full ${config.dot}`} />
            <span className="text-xs text-[var(--muted)] font-medium">
              {config.label}
            </span>
          </div>
          <div className={`text-2xl font-bold tabular-nums ${config.color}`}>
            {stats[config.key]}
          </div>
        </div>
      ))}
    </div>
  )
}
