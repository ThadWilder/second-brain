'use client'

import { useMemo } from 'react'
import type { HeatmapCell } from '@/types'

interface Props {
  data: HeatmapCell[]
  brands: string[]
  days: string[]  // ISO date strings, last 14
}

function getColor(count: number, max: number): string {
  if (count === 0) return '#1a1d27'
  const intensity = Math.min(count / Math.max(max, 1), 1)
  if (intensity < 0.33) return '#1e3a5f'
  if (intensity < 0.66) return '#1d4ed8'
  return '#3b82f6'
}

export function Heatmap({ data, brands, days }: Props) {
  const cellMap = useMemo(() => {
    const map: Record<string, number> = {}
    for (const cell of data) {
      map[`${cell.brand_name}::${cell.date}`] = cell.count
    }
    return map
  }, [data])

  const maxCount = useMemo(
    () => Math.max(...data.map((d) => d.count), 1),
    [data]
  )

  if (!brands.length || !days.length) {
    return (
      <div className="text-xs text-slate-500 py-4 text-center">
        No activity data yet
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <div className="min-w-max">
        {/* Header row — dates */}
        <div className="flex gap-0.5 mb-1 ml-28">
          {days.map((day) => (
            <div
              key={day}
              className="w-5 text-[10px] text-slate-500 text-center leading-none"
              title={day}
            >
              {formatDayLabel(day)}
            </div>
          ))}
        </div>

        {/* Brand rows */}
        {brands.map((brand) => (
          <div key={brand} className="flex items-center gap-0.5 mb-0.5">
            <div
              className="w-28 text-xs text-slate-400 truncate pr-2 text-right shrink-0"
              title={brand}
            >
              {brand}
            </div>
            {days.map((day) => {
              const count = cellMap[`${brand}::${day}`] ?? 0
              return (
                <div
                  key={day}
                  title={`${brand} · ${day} · ${count} items`}
                  className="w-5 h-5 rounded-sm cursor-default"
                  style={{ backgroundColor: getColor(count, maxCount) }}
                />
              )
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center gap-1 mt-2 ml-28">
          <span className="text-[10px] text-slate-500">less</span>
          {[0, 0.25, 0.5, 0.75, 1].map((level) => (
            <div
              key={level}
              className="w-3 h-3 rounded-sm"
              style={{ backgroundColor: getColor(level * maxCount, maxCount) }}
            />
          ))}
          <span className="text-[10px] text-slate-500">more</span>
        </div>
      </div>
    </div>
  )
}

function formatDayLabel(isoDate: string): string {
  const d = new Date(isoDate)
  return d.getDate().toString()
}
