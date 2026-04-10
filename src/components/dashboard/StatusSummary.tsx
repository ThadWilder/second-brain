'use client'

import type { DashboardStats } from '@/types'

interface Props {
  stats: DashboardStats
}

const STATS: { key: keyof DashboardStats; label: string; icon: string }[] = [
  { key: 'escalations', label: 'On Fire', icon: '🔥' },
  { key: 'needs_response', label: 'Waiting on You', icon: '👀' },
  { key: 'open_tasks', label: 'In the Steamer', icon: '🥟' },
  { key: 'closed_7d', label: 'Plated This Week', icon: '✨' },
]

export function StatusSummary({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {STATS.map(({ key, label, icon }) => (
        <div
          key={key}
          className="bg-[var(--surface-hover)] rounded-lg px-4 py-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs text-[var(--muted)]">
              {label}
            </span>
            <span className="text-lg">{icon}</span>
          </div>
          <div className="text-2xl font-bold tabular-nums text-[var(--text)] mt-1">
            {stats[key]}
          </div>
        </div>
      ))}
    </div>
  )
}
