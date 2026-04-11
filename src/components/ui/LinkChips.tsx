'use client'

import { ExternalLink } from 'lucide-react'

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

interface Props {
  links: string[]
}

export function LinkChips({ links }: Props) {
  if (!links || links.length === 0) return null

  return (
    <div className="flex flex-wrap gap-1.5 mt-2">
      {links.map((url, i) => (
        <a
          key={i}
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-medium
                     rounded-full border border-teal-200 bg-teal-50 text-teal-700
                     hover:bg-teal-100 hover:border-teal-300 transition-colors
                     max-w-[200px] truncate"
          title={url}
        >
          <ExternalLink className="w-2.5 h-2.5 shrink-0" />
          <span className="truncate">{getDomain(url)}</span>
        </a>
      ))}
    </div>
  )
}
