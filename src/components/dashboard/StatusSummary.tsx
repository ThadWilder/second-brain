'use client'

import type { DashboardStats } from '@/types'

interface Props {
  stats: DashboardStats & { unresolved_comments?: number }
}

const STATS: { key: keyof DashboardStats; label: string; icon: string; href?: string }[] = [
  { key: 'escalations', label: 'Escalated', icon: '🔥', href: '/tasks' },
  { key: 'needs_response', label: 'Waiting on You', icon: '👀', href: '/tasks' },
  { key: 'waiting_on', label: 'Waiting on Them', icon: '⏳', href: '/tasks' },
  { key: 'open_tasks', label: 'Open Tasks', icon: '📋', href: '/tasks' },
  { key: 'closed_7d', label: 'Completed This Week', icon: '✅' },
  { key: 'tracking', label: 'Watching', icon: '👁️', href: '/tasks' },
]

export function StatusSummary({ stats }: Props) {
  function handleClick(href?: string) {
    if (href) window.location.href = href
  }

  const unresolvedComments = (stats as any).unresolved_comments ?? 0

  return (
    <div className="grid grid-cols-2 gap-4">
      {STATS.map(({ key, label, icon, href }) => (
        <div
          key={key}
          onClick={() => handleClick(href)}
          className={`bg-[var(--surface-hover)] rounded-lg px-5 py-4 ${href ? 'cursor-pointer hover:bg-[var(--border)] transition-colors' : ''}`}
        >
          <div className="flex items-center justify-between">
            <span className="text-sm text-[var(--muted)]">
              {label}
            </span>
            <span className="text-xl">{icon}</span>
          </div>
          <div className="text-3xl font-bold tabular-nums text-[var(--text)] mt-1">
            {stats[key]}
          </div>
        </div>
      ))}
      {unresolvedComments > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-5 py-4">
          <div className="flex items-center justify-between">
            <span className="text-sm text-amber-700">
              Team Comments
            </span>
            <span className="text-xl">💬</span>
          </div>
          <div className="text-3xl font-bold tabular-nums text-amber-700 mt-1">
            {unresolvedComments}
          </div>
        </div>
      )}
    </div>
  )
}
