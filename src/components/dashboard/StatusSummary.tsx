'use client'

import type { DashboardStats } from '@/types'

interface Props {
  stats: DashboardStats
}

const STAT_CONFIGS = [
  {
    key: 'escalations' as const,
    label: 'Escalations',
    color: 'text-red-400',
    bg: 'bg-red-500/10 border-red-500/20',
    icon: '🔥',
  },
  {
    key: 'needs_response' as const,
    label: 'Needs Response',
    color: 'text-amber-400',
    bg: 'bg-amber-500/10 border-amber-500/20',
    icon: '📬',
  },
  {
    key: 'open_tasks' as const,
    label: 'Open Tasks',
    color: 'text-blue-400',
    bg: 'bg-blue-500/10 border-blue-500/20',
    icon: '📋',
  },
  {
    key: 'closed_7d' as const,
    label: 'Closed (7d)',
    color: 'text-green-400',
    bg: 'bg-green-500/10 border-green-500/20',
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
            <span className="text-xs text-slate-400 font-medium uppercase tracking-wide">
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
