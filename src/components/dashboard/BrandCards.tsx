'use client'

import Link from 'next/link'
import { CheckCircle, AlertTriangle, AlertOctagon } from 'lucide-react'
import { CollapsibleSection } from './CollapsibleSection'
import type { BrandSummary } from '@/types'

const HEALTH_STYLES = {
  green: {
    border: 'border-green-300',
    dot: 'bg-green-600',
    badge: 'bg-green-50 text-green-700',
  },
  amber: {
    border: 'border-amber-300',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-700',
  },
  red: {
    border: 'border-red-300',
    dot: 'bg-red-500',
    badge: 'bg-red-50 text-red-700',
  },
}

interface Props {
  brands: BrandSummary[]
}

export function BrandCards({ brands }: Props) {
  if (!brands.length) return null

  return (
    <CollapsibleSection
      title="Brands"
      icon="🏢"
      count={brands.length}
      defaultExpanded={true}
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
      {brands.map((b) => {
        const styles = HEALTH_STYLES[b.health]
        return (
          <Link
            key={b.entity.id}
            href={`/brand/${b.entity.id}`}
            className={`group block rounded-lg border bg-[var(--surface)] p-3 hover:bg-[var(--surface-hover)]
                        transition-colors cursor-pointer ${styles.border}`}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2 min-w-0">
                {b.health === 'green' && <CheckCircle className="w-3.5 h-3.5 text-green-600 shrink-0" />}
              {b.health === 'amber' && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
              {b.health === 'red' && <AlertOctagon className="w-3.5 h-3.5 text-red-500 shrink-0" />}
                <span className="text-sm font-medium text-[var(--text)] truncate">
                  {b.entity.name}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-xs">
              {b.escalated_tasks > 0 && (
                <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded">
                  {b.escalated_tasks} 🔥
                </span>
              )}
              <span className="text-[var(--muted)]">
                {b.open_tasks} open
              </span>
            </div>

            {b.last_activity && (
              <div className="mt-1.5 text-[11px] text-[var(--muted)] truncate">
                {formatRelativeTime(b.last_activity)}
              </div>
            )}
          </Link>
        )
      })}
      </div>
    </CollapsibleSection>
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
