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
    bg: 'bg-red-50 border-red-200',
    icon: '🔥',
  },
  {
    key: 'needs_response' as const,
    label: 'Needs Response',
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200',
    icon: '📬',
  },
  {
    key: 'open_tasks' as const,
    label: 'Open Tasks',
    color: 'text-blue-700',
    bg: 'bg-blue-50 border-blue-200',
    icon: '📋',
  },
  {
    key: 'closed_7d' as const,
    label: 'Closed (7d)',
    color: 'text-green-700',
    bg: 'bg-green-50 border-green-200',
    icon: '✓',
  },
]

export function StatusSummary({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {STAT_CONFIGS.map((config) => (
        <div
          key={config.key}
          className={`rounded-lg border p-3 ${config.bg}`}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base leading-none">{config.icon}</span>
            <span className="text-xs text-[var(--muted)] font-medium uppercase tracking-wide">
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
