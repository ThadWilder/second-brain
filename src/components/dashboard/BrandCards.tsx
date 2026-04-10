'use client'

import Link from 'next/link'
import type { BrandSummary } from '@/types'

const HEALTH_STYLES = {
  green: {
    border: 'border-green-500/30',
    dot: 'bg-green-400',
    badge: 'bg-green-500/10 text-green-400',
  },
  amber: {
    border: 'border-amber-500/30',
    dot: 'bg-amber-400',
    badge: 'bg-amber-500/10 text-amber-400',
  },
  red: {
    border: 'border-red-500/30',
    dot: 'bg-red-400',
    badge: 'bg-red-500/10 text-red-400',
  },
}

interface Props {
  brands: BrandSummary[]
}

export function BrandCards({ brands }: Props) {
  if (!brands.length) return null

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
        <span>🏢</span>
        Brands
        <span className="text-slate-500 font-normal">({brands.length})</span>
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {brands.map((b) => {
        const styles = HEALTH_STYLES[b.health]
        return (
          <Link
            key={b.entity.id}
            href={`/brand/${b.entity.id}`}
            className={`group block rounded-lg border bg-[#1a1d27] p-3 hover:bg-[#1f2233] 
                        transition-colors cursor-pointer ${styles.border}`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`w-2 h-2 rounded-full shrink-0 ${styles.dot}`} />
                <span className="text-sm font-medium text-slate-200 truncate">
                  {b.entity.name}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              {b.escalated_tasks > 0 && (
                <span className="bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">
                  {b.escalated_tasks} 🔥
                </span>
              )}
              <span className="text-slate-400">
                {b.open_tasks} open
              </span>
            </div>

            {b.last_activity && (
              <div className="mt-1.5 text-[11px] text-slate-500 truncate">
                {formatRelativeTime(b.last_activity)}
              </div>
            )}
          </Link>
        )
      })}
      </div>
    </div>
  )
}

function formatRelativeTime(isoDate: string): string {
  const diff = Date.now() - new Date(isoDate).getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  if (hours < 1) return 'just now'
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}
