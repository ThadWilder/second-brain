'use client'

import type { DashboardStats } from '@/types'

interface Props {
  stats: DashboardStats
}

const STATS: { key: keyof DashboardStats; label: string; icon: string; scrollTo?: string }[] = [
  { key: 'escalations', label: 'On Fire', icon: '🔥', scrollTo: 'section-escalations' },
  { key: 'needs_response', label: 'Waiting on You', icon: '👀', scrollTo: 'section-needs-response' },
  { key: 'waiting_on', label: 'Waiting on Them', icon: '⏳', scrollTo: 'section-inbox' },
  { key: 'open_tasks', label: 'In the Steamer', icon: '🥟', scrollTo: 'section-inbox' },
  { key: 'closed_7d', label: 'Plated This Week', icon: '✨' },
  { key: 'dumplings_this_week', label: 'Fresh Dumplings', icon: '📥' },
]

export function StatusSummary({ stats }: Props) {
  function handleClick(scrollTo?: string) {
    if (!scrollTo) return
    const el = document.getElementById(scrollTo)
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div className="grid grid-cols-2 gap-4">
      {STATS.map(({ key, label, icon, scrollTo }) => (
        <div
          key={key}
          onClick={() => handleClick(scrollTo)}
          className={`bg-[var(--surface-hover)] rounded-lg px-5 py-4 ${scrollTo ? 'cursor-pointer hover:bg-[var(--border)] transition-colors' : ''}`}
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
    </div>
  )
}
