'use client'

import type { DashboardStats } from '@/types'

interface Props {
  stats: DashboardStats
}

const STATS: { key: keyof DashboardStats; label: string }[] = [
  { key: 'escalations', label: 'Escalations' },
  { key: 'needs_response', label: 'Needs Response' },
  { key: 'open_tasks', label: 'Open' },
  { key: 'closed_7d', label: 'Closed (7d)' },
]

export function StatusSummary({ stats }: Props) {
  return (
    <div className="flex items-baseline gap-8">
      {STATS.map(({ key, label }) => (
        <div key={key}>
          <span className="text-3xl font-bold tabular-nums text-[var(--text)]">
            {stats[key]}
          </span>
          <span className="text-sm text-[var(--muted)] ml-1.5">
            {label}
          </span>
        </div>
      ))}
    </div>
  )
}
