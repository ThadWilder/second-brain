'use client'

import { useMemo } from 'react'
import type { HeatmapCell } from '@/types'

interface Props {
  data: HeatmapCell[]
  brands: string[]
  days: string[]  // ISO date strings, last 10
}

function getColor(count: number, max: number): string {
  if (count === 0) return '#f5ede3'
  const intensity = Math.min(count / Math.max(max, 1), 1)
  if (intensity < 0.33) return '#fde68a'
  if (intensity < 0.66) return '#f59e0b'
  return '#d4943a'
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
      <div className="text-xs text-[var(--muted)] py-4 text-center">
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
              className="w-5 text-[10px] text-[var(--muted)] text-center leading-none"
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
              className="w-28 text-xs text-[var(--muted)] truncate pr-2 text-right shrink-0"
              title={brand}
            >
              {brand}
            </div>
            {days.map((day) => {
              const count = cellMap[`${brand}::${day}`] ?? 0
              return (
                <div
                  key={day}
                  title={`${brand} · ${day} · ${count} dumplings`}
                  className="w-5 h-5 rounded-sm cursor-default"
                  style={{ backgroundColor: getColor(count, maxCount) }}
                />
              )
            })}
          </div>
        ))}

        {/* Legend */}
        <div className="flex items-center gap-1.5 mt-3 ml-28">
          <span className="text-[10px] text-[var(--muted)] mr-0.5">Less</span>
          {[0, 0.25, 0.5, 0.75, 1].map((level) => (
            <div
              key={level}
              className="w-3.5 h-3.5 rounded-sm"
              style={{ backgroundColor: getColor(level * maxCount, maxCount) }}
            />
          ))}
          <span className="text-[10px] text-[var(--muted)] ml-0.5">More</span>
        </div>
      </div>
    </div>
  )
}

function formatDayLabel(isoDate: string): string {
  const d = new Date(isoDate)
  return d.getDate().toString()
}
