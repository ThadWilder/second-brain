'use client'

import type { Entity } from '@/types'

const TYPE_ICONS: Record<string, string> = {
  brand: '🏢',
  vendor: '🤝',
  contact: '👤',
  topic: '🏷️',
}

interface Props {
  entities: Entity[]
  title?: string
}

export function EntityList({ entities, title = 'Related Entities' }: Props) {
  if (!entities.length) return null

  const grouped = entities.reduce<Record<string, Entity[]>>((acc, e) => {
    if (!acc[e.type]) acc[e.type] = []
    acc[e.type].push(e)
    return acc
  }, {})

  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">
        {title}
      </h3>
      <div className="space-y-3">
        {Object.entries(grouped).map(([type, items]) => (
          <div key={type}>
            <div className="text-xs text-slate-500 mb-1">
              {TYPE_ICONS[type] ?? '•'} {type}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {items.map((entity) => (
                <span
                  key={entity.id}
                  className="inline-flex items-center px-2 py-1 rounded-md text-xs
                             bg-[#1a2035] border border-[#2a3150] text-slate-300"
                >
                  {entity.name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
