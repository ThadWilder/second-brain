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

const JUNK_URL_PATTERNS = [
  // Security wrapper / egress links
  /links\.us\d*\.defend\.egress\.com/i,
  // Email tracking / click wrappers
  /cmail\d+\.com/i,
  /click\.|track\.|trk\.|opens\./i,
  /mailchimp\.com/i,
  /campaign-archive/i,
  /list-manage\.com/i,
  /constantcontact/i,
  /sendgrid/i,
  /intercomcdn\.com/i,
  /highspot\.com\/tracking/i,
  // URL shorteners (usually tracking)
  /^https?:\/\/t\.co\//i,
  /^https?:\/\/bit\.ly\//i,
  /^https?:\/\/surl\.li\//i,
  // Email signature images / assets
  /mail-sig|email-sig|signature/i,
  /cdn\.gifo\.wisestamp/i,
  /ci3\.googleusercontent\.com\/mail-sig/i,
  /postimg\.org/i,
  /docucdn/i,
  /fonts\.gstatic/i,
  // Image files
  /\.(png|ico|gif|jpg|jpeg|svg|bmp|webp)(\?|$)/i,
  // Icon MIME type URLs
  /\/favicon/i,
  // aka.ms short links (email cruft)
  /aka\.ms\//i,
  // UUID-looking "URLs" (not real pages)
  /^http:\/\/[A-F0-9-]{36}$/i,
  // Unsubscribe / optout
  /unsubscribe|optout|opt-out|pixel|beacon/i,
  // Button images
  /btn_|button_/i,
]

function isValidUrl(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/** Check if URL is a plain homepage with no meaningful path */
function isHomepageUrl(url: string): boolean {
  if (!/^https?:\/\/[^\/]+\/?$/.test(url)) return false
  // Allow useful services even as homepages
  if (/calendly|stripe|nicejob|semrush|ahrefs|notion|supabase|vercel|render|github/.test(url)) return false
  return true
}

/** Check if URL is an icon/logo/favicon URL */
export function isIconUrl(url: string): boolean {
  return ICON_URL_PATTERNS.some(p => p.test(url))
}

/** Check if URL is junk (tracking, wrapper, icon, homepage, etc) */
export function isJunkUrl(url: string): boolean {
  return JUNK_URL_PATTERNS.some(p => p.test(url)) || isHomepageUrl(url)
}

/** Extract unique valid URLs from text, filtering out junk */
export function extractUrls(text: string): string[] {
  if (!text) return []
  const matches = text.match(URL_REGEX) ?? []
  return [...new Set(matches.filter(u => isValidUrl(u) && !isJunkUrl(u)))]
}
