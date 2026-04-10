'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, GitMerge } from 'lucide-react'
import { MergeModal } from './MergeModal'
import { EditEntityModal } from './EditEntityModal'
import type { Entity } from '@/types'

const TYPE_CONFIG: Record<string, {
  icon: string
  accent: string
  border: string
  bg: string
}> = {
  brand: {
    icon: '🏢',
    accent: 'text-blue-700',
    border: 'border-blue-200',
    bg: 'hover:bg-blue-50',
  },
  contact: {
    icon: '👤',
    accent: 'text-emerald-700',
    border: 'border-emerald-200',
    bg: 'hover:bg-emerald-50',
  },
  vendor: {
    icon: '🤝',
    accent: 'text-purple-700',
    border: 'border-purple-200',
    bg: 'hover:bg-purple-50',
  },
  topic: {
    icon: '🏷️',
    accent: 'text-amber-700',
    border: 'border-amber-200',
    bg: 'hover:bg-amber-50',
  },
}

export interface EntityCardData {
  entity: Entity
  open_tasks: number
  escalated_tasks: number
  last_activity: string | null
}

interface Props {
  title: string
  entities: EntityCardData[]
  type: string
  allEntities?: Entity[]  // all entities across all types (for relationship picker in edit modal)
}

export function EntityCards({ title, entities, type, allEntities: allEntitiesProp }: Props) {
  const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.topic
  const router = useRouter()
  const [mergeTarget, setMergeTarget] = useState<Entity | null>(null)
  const [editTarget, setEditTarget] = useState<Entity | null>(null)

  if (!entities.length) return null

  const allEntitiesOfType = entities.map((e) => e.entity)

  return (
    <>
      <div>
        <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--muted)] mb-3 flex items-center gap-1.5">
          <span>{config.icon}</span>
          {title}
          <span className="text-[var(--muted)] font-normal">({entities.length})</span>
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {entities.map((item) => {
            const hasEscalation = item.escalated_tasks > 0
            const borderColor = hasEscalation ? 'border-red-300' : config.border

            return (
              <div
                key={item.entity.id}
                className={`group relative rounded-lg border bg-[var(--surface)] p-3
                            transition-colors ${borderColor} ${config.bg}`}
              >
                {/* Action buttons — top right, visible on hover */}
                <div className="absolute top-1.5 right-1.5 opacity-0 group-hover:opacity-100 transition-opacity flex gap-1">
                  <button
                    onClick={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      setEditTarget(item.entity)
                    }}
                    className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-0.5"
                    title="Edit details"
                  >
                    <Pencil className="w-3 h-3" />
                    edit
                  </button>
                  {entities.length > 1 && (
                    <button
                      onClick={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        setMergeTarget(item.entity)
                      }}
                      className="px-1.5 py-0.5 text-[10px] rounded bg-[var(--border)] text-[var(--muted)] hover:text-[var(--text)] hover:bg-[var(--surface-hover)] flex items-center gap-0.5"
                      title="Merge into another entity"
                    >
                      <GitMerge className="w-3 h-3" />
                      merge
                    </button>
                  )}
                </div>

                <Link href={`/brand/${item.entity.id}`} className="block">
                  <div className="flex items-start gap-2 mb-1.5 min-w-0">
                    <span className="text-sm leading-none mt-0.5">{config.icon}</span>
                    <div className="min-w-0">
                      <span className="text-sm font-medium text-[var(--text)] truncate block">
                        {item.entity.name}
                      </span>
                      {type === 'contact' && item.entity.metadata && (
                        <div className="flex items-center gap-1.5">
                          {(item.entity.metadata as Record<string, string>).category && (
                            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                              getCategoryStyle((item.entity.metadata as Record<string, string>).category)
                            }`}>
                              {formatCategory((item.entity.metadata as Record<string, string>).category)}
                            </span>
                          )}
                          {(item.entity.metadata as Record<string, string>).role && (
                            <span className="text-[11px] text-[var(--muted)]">
                              {(item.entity.metadata as Record<string, string>).role}
                            </span>
                          )}
                        </div>
                      )}
                      {type === 'vendor' && item.entity.metadata && (
                        <span className="text-[11px] text-[var(--muted)] line-clamp-1">
                          {(item.entity.metadata as Record<string, string>).notes ?? ''}
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    {hasEscalation && (
                      <span className="bg-red-50 text-red-700 px-1.5 py-0.5 rounded">
                        {item.escalated_tasks} 🔥
                      </span>
                    )}
                    {item.open_tasks > 0 && (
                      <span className="text-[var(--muted)]">
                        {item.open_tasks} open
                      </span>
                    )}
                    {item.open_tasks === 0 && !hasEscalation && (
                      <span className="text-[var(--muted)]">no tasks</span>
                    )}
                  </div>

                  {item.last_activity && (
                    <div className="mt-1 text-[11px] text-[var(--muted)] truncate">
                      {formatRelativeTime(item.last_activity)}
                    </div>
                  )}
                </Link>
              </div>
            )
          })}
        </div>
      </div>

      {/* Edit modal */}
      {editTarget && (
        <EditEntityModal
          entity={editTarget}
          allEntities={allEntitiesProp ?? allEntitiesOfType}
          onClose={() => setEditTarget(null)}
          onSaved={() => {
            setEditTarget(null)
            router.refresh()
          }}
        />
      )}

      {/* Merge modal */}
      {mergeTarget && (
        <MergeModal
          entity={mergeTarget}
          allEntities={allEntitiesOfType}
          onClose={() => setMergeTarget(null)}
          onMerged={() => {
            setMergeTarget(null)
            router.refresh()
          }}
        />
      )}
    </>
  )
}

const CATEGORY_STYLES: Record<string, string> = {
  team: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  client_contact: 'bg-blue-50 text-blue-700 border-blue-200',

  freelancer: 'bg-amber-50 text-amber-700 border-amber-200',
  external: 'bg-gray-50 text-gray-600 border-gray-200',
  unknown: 'bg-red-50 text-red-700 border-red-200',
}

function getCategoryStyle(category: string): string {
  return CATEGORY_STYLES[category] ?? CATEGORY_STYLES.unknown
}

function formatCategory(value: string): string {
  const map: Record<string, string> = {
    team: 'Team',
    client_contact: 'Client',
    freelancer: 'Freelancer',
    external: 'External',
    unknown: '???',
  }
  return map[value] ?? value
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
