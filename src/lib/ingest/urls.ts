/** URL extraction utility for the ingest pipeline */

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^~[\]`]+[^\s<>"{}|\\^~[\]`.,;:!?)]/g

const ICON_URL_PATTERNS = [
  /favicon\.ico$/i,
  /apple-touch-icon/i,
  /\/icon[-_]?\d*\.(png|ico|svg)$/i,
  /\/logo[-_]?\d*\.(png|ico|svg|jpg)$/i,
  /\/sprite/i,
  /\/badge/i,
]

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/** Check if URL is an icon/logo/favicon URL */
export function isIconUrl(url: string): boolean {
  return ICON_URL_PATTERNS.some(p => p.test(url))
}

/** Extract unique valid URLs from text */
export function extractUrls(text: string): string[] {
  if (!text) return []
  const matches = text.match(URL_REGEX) ?? []
  return [...new Set(matches.filter(isValidUrl))]
}
