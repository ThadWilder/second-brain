'use client'

import Link from 'next/link'
import type { Entity } from '@/types'

const TYPE_CONFIG: Record<string, {
  icon: string
  accent: string
  border: string
  bg: string
}> = {
  brand: {
    icon: '🏢',
    accent: 'text-blue-400',
    border: 'border-blue-500/20',
    bg: 'hover:bg-blue-500/5',
  },
  contact: {
    icon: '👤',
    accent: 'text-emerald-400',
    border: 'border-emerald-500/20',
    bg: 'hover:bg-emerald-500/5',
  },
  vendor: {
    icon: '🤝',
    accent: 'text-purple-400',
    border: 'border-purple-500/20',
    bg: 'hover:bg-purple-500/5',
  },
  topic: {
    icon: '🏷️',
    accent: 'text-amber-400',
    border: 'border-amber-500/20',
    bg: 'hover:bg-amber-500/5',
  },
}

interface EntityCardData {
  entity: Entity
  open_tasks: number
  escalated_tasks: number
  last_activity: string | null
}

interface Props {
  title: string
  entities: EntityCardData[]
  type: string
}

export function EntityCards({ title, entities, type }: Props) {
  const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.topic

  if (!entities.length) return null

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
        <span>{config.icon}</span>
        {title}
        <span className="text-slate-500 font-normal">({entities.length})</span>
      </h2>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {entities.map((item) => {
          const hasEscalation = item.escalated_tasks > 0
          const borderColor = hasEscalation ? 'border-red-500/30' : config.border

          return (
            <Link
              key={item.entity.id}
              href={`/brand/${item.entity.id}`}
              className={`group block rounded-lg border bg-[#1a1d27] p-3 
                          transition-colors cursor-pointer ${borderColor} ${config.bg}`}
            >
              <div className="flex items-start gap-2 mb-1.5 min-w-0">
                <span className="text-sm leading-none mt-0.5">{config.icon}</span>
                <div className="min-w-0">
                  <span className="text-sm font-medium text-slate-200 truncate block">
                    {item.entity.name}
                  </span>
                  {type === 'contact' && item.entity.metadata && (
                    <span className="text-[11px] text-slate-500">
                      {(item.entity.metadata as Record<string, string>).role ?? ''}
                    </span>
                  )}
                  {type === 'vendor' && item.entity.metadata && (
                    <span className="text-[11px] text-slate-500 line-clamp-1">
                      {(item.entity.metadata as Record<string, string>).notes ?? ''}
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-2 text-xs">
                {hasEscalation && (
                  <span className="bg-red-500/10 text-red-400 px-1.5 py-0.5 rounded">
                    {item.escalated_tasks} 🔥
                  </span>
                )}
                {item.open_tasks > 0 && (
                  <span className="text-slate-400">
                    {item.open_tasks} open
                  </span>
                )}
                {item.open_tasks === 0 && !hasEscalation && (
                  <span className="text-slate-500">no tasks</span>
                )}
              </div>

              {item.last_activity && (
                <div className="mt-1 text-[11px] text-slate-500 truncate">
                  {formatRelativeTime(item.last_activity)}
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
