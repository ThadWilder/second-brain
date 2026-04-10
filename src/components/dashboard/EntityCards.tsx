'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Pencil, GitMerge } from 'lucide-react'
import { MergeModal } from './MergeModal'
import { EditEntityModal } from './EditEntityModal'
import { CollapsibleSection } from './CollapsibleSection'
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
  department: {
    icon: '🏛️',
    accent: 'text-indigo-700',
    border: 'border-indigo-200',
    bg: 'hover:bg-indigo-50',
  },
  franchisee: {
    icon: '🏠',
    accent: 'text-teal-700',
    border: 'border-teal-200',
    bg: 'hover:bg-teal-50',
  },
  vendor_team: {
    icon: '👤',
    accent: 'text-purple-700',
    border: 'border-purple-200',
    bg: 'hover:bg-purple-50',
  },
  freelancer: {
    icon: '💻',
    accent: 'text-orange-700',
    border: 'border-orange-200',
    bg: 'hover:bg-orange-50',
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

export interface EntityRelationship {
  from_entity_id: string
  to_entity_id: string
  relationship: string
}

interface Props {
  title: string
  entities: EntityCardData[]
  type: string
  allEntities?: Entity[]
  entityRelationships?: EntityRelationship[]
  onRefresh?: () => void
}

export function EntityCards({ title, entities, type, allEntities: allEntitiesProp, entityRelationships, onRefresh }: Props) {
  const config = TYPE_CONFIG[type] ?? TYPE_CONFIG.topic
  const router = useRouter()
  const [mergeTarget, setMergeTarget] = useState<Entity | null>(null)
  const [editTarget, setEditTarget] = useState<Entity | null>(null)

  const allEntitiesOfType = entities.map((e) => e.entity)

  const [assigningId, setAssigningId] = useState<string | null>(null)

  // Default expanded: brands and people always expanded, others expanded only if they have entities
  const defaultExpanded = type === 'brand' || type === 'contact' || entities.length > 0

  // Group contacts by relationship target
  const contactGroups = useMemo(() => {
    if (type !== 'contact' || !entityRelationships || !allEntitiesProp) return null

    const entityMap = new Map(allEntitiesProp.map((e) => [e.id, e]))
    const groupingRels = ['member_of', 'works_on']

    // Build groups: map of target entity name -> entity cards
    const groups = new Map<string, { targetName: string; items: EntityCardData[] }>()
    const assigned = new Set<string>()

    for (const item of entities) {
      const rels = entityRelationships.filter(
        (r) => r.from_entity_id === item.entity.id && groupingRels.includes(r.relationship)
      )
      for (const rel of rels) {
        const target = entityMap.get(rel.to_entity_id)
        if (target) {
          const key = target.id
          if (!groups.has(key)) {
            groups.set(key, { targetName: target.name, items: [] })
          }
          groups.get(key)!.items.push(item)
          assigned.add(item.entity.id)
        }
      }
    }

    // Unassigned group
    const unassigned = entities.filter((e) => !assigned.has(e.entity.id))

    // Sort groups alphabetically, then unassigned last
    const sorted = Array.from(groups.values()).sort((a, b) => a.targetName.localeCompare(b.targetName))

    return { sorted, unassigned }
  }, [type, entities, entityRelationships, allEntitiesProp])

  // Group brands and departments as assignment targets
  const assignOptions = useMemo(() => {
    if (!allEntitiesProp) return { brands: [] as Entity[], teams: [] as Entity[] }
    const brands = allEntitiesProp
      .filter((e) => e.type === 'brand')
      .sort((a, b) => a.name.localeCompare(b.name))
    const teams = allEntitiesProp
      .filter((e) => e.type === 'department')
      .sort((a, b) => a.name.localeCompare(b.name))
    return { brands, teams }
  }, [allEntitiesProp])

  async function handleAssign(personId: string, targetId: string) {
    setAssigningId(personId)
    try {
      const res = await fetch('/api/entities/link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from_entity_id: personId,
          to_entity_id: targetId,
          relationship: 'member_of',
        }),
      })
      if (res.ok) {
        onRefresh?.()
        router.refresh()
      }
    } finally {
      setAssigningId(null)
    }
  }

  if (!entities.length) return null

  function renderCard(item: EntityCardData, showAssign = false) {
    const hasEscalation = item.escalated_tasks > 0
    const borderColor = hasEscalation ? 'border-red-300' : config.border

    return (
      <div
        key={item.entity.id}
        className={`group relative rounded-lg border bg-[var(--surface)] p-3
                    transition-colors ${borderColor} ${config.bg}`}
      >
        {/* Action buttons */}
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

        {/* Inline assign dropdown for unassigned contacts */}
        {showAssign && (assignOptions.brands.length > 0 || assignOptions.teams.length > 0) && (
          <div className="mt-2 pt-2 border-t border-[var(--border)]">
            {assigningId === item.entity.id ? (
              <span className="text-[11px] text-[var(--muted)]">Assigning...</span>
            ) : (
              <select
                className="w-full text-[11px] px-1.5 py-1 rounded border border-[var(--border)] bg-[var(--surface)] text-[var(--muted)] cursor-pointer hover:border-[var(--accent)] focus:border-[var(--accent)] focus:outline-none"
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) handleAssign(item.entity.id, e.target.value)
                }}
                onClick={(e) => e.stopPropagation()}
              >
                <option value="" disabled>Assign to...</option>
                {assignOptions.brands.length > 0 && (
                  <optgroup label="Brands">
                    {assignOptions.brands.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </optgroup>
                )}
                {assignOptions.teams.length > 0 && (
                  <optgroup label="Internal Team">
                    {assignOptions.teams.map((t) => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </optgroup>
                )}
              </select>
            )}
          </div>
        )}
      </div>
    )
  }

  function renderGrid(items: EntityCardData[], showAssign = false) {
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {items.map((item) => renderCard(item, showAssign))}
      </div>
    )
  }

  return (
    <>
      <CollapsibleSection
        title={title}
        icon={config.icon}
        count={entities.length}
        defaultExpanded={defaultExpanded}
      >
        {contactGroups ? (
          <div className="space-y-4">
            {contactGroups.sorted.map((group) => (
              <div key={group.targetName}>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-0.5 h-3.5 bg-[var(--accent)] rounded-full" />
                  <span className="text-xs text-[var(--muted)] font-medium">
                    {group.targetName}
                  </span>
                </div>
                {renderGrid(group.items)}
              </div>
            ))}
            {contactGroups.unassigned.length > 0 && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="w-0.5 h-3.5 bg-[var(--border)] rounded-full" />
                  <span className="text-xs text-[var(--muted)] font-medium">
                    Unassigned
                  </span>
                </div>
                {renderGrid(contactGroups.unassigned, true)}
              </div>
            )}
          </div>
        ) : (
          renderGrid(entities)
        )}
      </CollapsibleSection>

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

const TYPE_STYLES: Record<string, string> = {
  contact: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  brand: 'bg-blue-50 text-blue-700 border-blue-200',
  department: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  franchisee: 'bg-teal-50 text-teal-700 border-teal-200',
  vendor: 'bg-purple-50 text-purple-700 border-purple-200',
  vendor_team: 'bg-purple-50 text-purple-700 border-purple-200',
  freelancer: 'bg-amber-50 text-amber-700 border-amber-200',
}

function getCategoryStyle(typeOrCategory: string): string {
  return TYPE_STYLES[typeOrCategory] ?? 'bg-gray-50 text-gray-600 border-gray-200'
}

function formatCategory(value: string): string {
  const map: Record<string, string> = {
    contact: 'Team',
    brand: 'Brand',
    department: 'Internal',
    franchisee: 'Franchisee',
    vendor: 'Vendor',
    vendor_team: 'Vendor Team',
    freelancer: 'Freelancer',
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
