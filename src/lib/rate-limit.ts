/**
 * Simple in-memory rate limiter.
 * No external dependencies — uses a Map that auto-cleans expired entries.
 */

interface RateLimitEntry {
  count: number
  resetTime: number
}

const store = new Map<string, RateLimitEntry>()

// Clean up expired entries every 60 seconds
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of store) {
    if (now > entry.resetTime) {
      store.delete(key)
    }
  }
}, 60_000)

/**
 * Check whether a request should be rate-limited.
 *
 * @param key    Unique key (typically `route:ip`)
 * @param limit  Max requests allowed in the window
 * @param windowMs  Window duration in milliseconds (default 60 000 = 1 min)
 * @returns `{ limited: false }` if allowed, `{ limited: true, retryAfterMs }` if blocked
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs = 60_000,
): { limited: false } | { limited: true; retryAfterMs: number } {
  const now = Date.now()
  const entry = store.get(key)

  if (!entry || now > entry.resetTime) {
    store.set(key, { count: 1, resetTime: now + windowMs })
    return { limited: false }
  }

  entry.count++
  if (entry.count > limit) {
    return { limited: true, retryAfterMs: entry.resetTime - now }
  }

  return { limited: false }
}
