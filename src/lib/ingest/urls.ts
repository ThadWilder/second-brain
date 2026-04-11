/** URL extraction utility for the ingest pipeline */

const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^~[\]`]+[^\s<>"{}|\\^~[\]`.,;:!?)]/g

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/** Extract unique valid URLs from text */
export function extractUrls(text: string): string[] {
  if (!text) return []
  const matches = text.match(URL_REGEX) ?? []
  return [...new Set(matches.filter(isValidUrl))]
}
