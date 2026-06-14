// lib/url.ts
/**
 * Canonical key for matching a URL or path across data sources
 * (Peec citations, content-calendar rows, Screaming Frog paths, agent logs).
 *
 * Rules: lowercase, strip protocol + leading `www.`, drop query/hash,
 * strip a trailing slash (except the root "/"). Returns null for empty input.
 *
 * NOTE: distinct from content-calendar's `normalizeUrl`, which validates
 * spreadsheet cells (TBD/pending → null) rather than producing a join key.
 */
export function urlJoinKey(raw: string | undefined | null): string | null {
  if (!raw) return null
  let s = raw.trim()
  if (!s) return null

  // Drop query/hash.
  s = s.split('#')[0].split('?')[0]

  // Bare path (starts with "/"): no host to normalize.
  if (s.startsWith('/')) {
    const lower = s.toLowerCase()
    return lower === '/' ? '/' : lower.replace(/\/+$/, '')
  }

  // Strip protocol if present.
  s = s.replace(/^[a-z]+:\/\//i, '')
  // Strip leading www.
  s = s.replace(/^www\./i, '')
  const lower = s.toLowerCase()
  const trimmed = lower.replace(/\/+$/, '')
  return trimmed || null
}
