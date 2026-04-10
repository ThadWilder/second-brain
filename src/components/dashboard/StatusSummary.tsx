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
    accent: 'border-b-red-400',
  },
  {
    key: 'needs_response' as const,
    label: 'Needs Response',
    color: 'text-amber-700',
    accent: 'border-b-amber-400',
  },
  {
    key: 'open_tasks' as const,
    label: 'Open Tasks',
    color: 'text-[var(--accent)]',
    accent: 'border-b-[var(--accent)]',
  },
  {
    key: 'closed_7d' as const,
    label: 'Closed (7d)',
    color: 'text-green-700',
    accent: 'border-b-green-400',
  },
]

export function StatusSummary({ stats }: Props) {
  return (
    <div className="grid grid-cols-4 gap-4">
      {STAT_CONFIGS.map((config) => (
        <div
          key={config.key}
          className={`rounded-xl bg-[var(--surface)] border border-[var(--border)] border-b-2 ${config.accent} px-4 py-4 text-center`}
        >
          <div className={`text-3xl font-bold tabular-nums ${config.color}`}>
            {stats[config.key]}
          </div>
          <div className="text-xs text-[var(--muted)] mt-1 font-medium">
            {config.label}
          </div>
        </div>
      ))}
    </div>
  )
}
