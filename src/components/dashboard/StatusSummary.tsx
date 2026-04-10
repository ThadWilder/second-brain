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
    <div className="grid grid-cols-4 gap-3">
      {STATS.map(({ key, label }) => (
        <div
          key={key}
          className="bg-[var(--surface)] border border-[var(--border)] rounded-lg px-4 py-4"
        >
          <div className="text-2xl font-bold tabular-nums text-[var(--text)]">
            {stats[key]}
          </div>
          <div className="text-xs text-[var(--muted)] mt-1">
            {label}
          </div>
        </div>
      ))}
    </div>
  )
}
