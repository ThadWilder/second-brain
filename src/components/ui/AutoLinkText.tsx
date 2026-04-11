'use client'

import { useMemo } from 'react'

// Match http/https URLs — avoids trailing punctuation that's likely sentence-ending
const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^~[\]`]+[^\s<>"{}|\\^~[\]`.,;:!?)]/g

function truncateUrl(url: string): string {
  try {
    const parsed = new URL(url)
    const firstSegment = parsed.pathname.split('/').filter(Boolean)[0]
    const display = firstSegment
      ? `${parsed.hostname}/${firstSegment}/...`
      : parsed.hostname
    return display.length > 50 ? display.slice(0, 47) + '...' : display
  } catch {
    return url.length > 50 ? url.slice(0, 47) + '...' : url
  }
}

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

interface Props {
  text: string
  className?: string
}

export function AutoLinkText({ text, className }: Props) {
  const parts = useMemo(() => {
    if (!text) return []

    const segments: Array<{ type: 'text' | 'link'; value: string }> = []
    let lastIndex = 0

    for (const match of text.matchAll(URL_REGEX)) {
      const url = match[0]
      const start = match.index!

      if (start > lastIndex) {
        segments.push({ type: 'text', value: text.slice(lastIndex, start) })
      }

      if (isValidUrl(url)) {
        segments.push({ type: 'link', value: url })
      } else {
        segments.push({ type: 'text', value: url })
      }

      lastIndex = start + url.length
    }

    if (lastIndex < text.length) {
      segments.push({ type: 'text', value: text.slice(lastIndex) })
    }

    return segments
  }, [text])

  if (parts.length === 0) return null

  return (
    <span className={className}>
      {parts.map((part, i) =>
        part.type === 'link' ? (
          <a
            key={i}
            href={part.value}
            target="_blank"
            rel="noopener noreferrer"
            className="text-teal-700 hover:text-teal-900 underline underline-offset-2 decoration-teal-300 hover:decoration-teal-500 transition-colors break-all"
            title={part.value}
            onClick={(e) => e.stopPropagation()}
          >
            {truncateUrl(part.value)}
          </a>
        ) : (
          <span key={i}>{part.value}</span>
        )
      )}
    </span>
  )
}

/** Extract unique URLs from text */
export function extractUrls(text: string): string[] {
  if (!text) return []
  const matches = text.match(URL_REGEX) ?? []
  return [...new Set(matches.filter(isValidUrl))]
}
