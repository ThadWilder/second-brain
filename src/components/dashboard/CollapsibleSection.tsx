'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, ChevronRight } from 'lucide-react'

interface Props {
  title: string
  icon?: string
  count: number
  defaultExpanded: boolean
  children: React.ReactNode
}

export function CollapsibleSection({ title, icon, count, defaultExpanded, children }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded)
  const contentRef = useRef<HTMLDivElement>(null)
  const [maxHeight, setMaxHeight] = useState<string>(defaultExpanded ? 'none' : '0px')

  useEffect(() => {
    if (expanded) {
      const el = contentRef.current
      if (el) {
        // Set to scrollHeight to animate open, then switch to 'none' so content can grow
        setMaxHeight(`${el.scrollHeight}px`)
        const timer = setTimeout(() => setMaxHeight('none'), 300)
        return () => clearTimeout(timer)
      }
    } else {
      // Animate closed: first set explicit height, then on next frame set to 0
      const el = contentRef.current
      if (el) {
        setMaxHeight(`${el.scrollHeight}px`)
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setMaxHeight('0px'))
        })
      }
    }
  }, [expanded])

  return (
    <div>
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        className="w-full flex items-center gap-1.5 mb-3 group cursor-pointer text-left"
      >
        {expanded
          ? <ChevronDown className="w-4 h-4 text-[var(--muted)] transition-transform" />
          : <ChevronRight className="w-4 h-4 text-[var(--muted)] transition-transform" />
        }
        <h2 className="text-sm font-semibold uppercase tracking-wider text-[var(--muted)] flex items-center gap-1.5">
          {icon && <span>{icon}</span>}
          {title}
          <span className="font-normal">({count})</span>
        </h2>
      </button>
      <div
        ref={contentRef}
        style={{ maxHeight, overflow: maxHeight === 'none' ? undefined : 'hidden' }}
        className="transition-[max-height] duration-300 ease-in-out"
      >
        {children}
      </div>
    </div>
  )
}
