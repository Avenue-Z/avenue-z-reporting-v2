// ─── Calendar pages (D-18, D-19) ─────────────────────────────────────────────
// Turns content-calendar rows into one page per URL: bare slugs resolved
// against the owned domain, duplicate rows (same URL on several tabs, or www /
// trailing-slash variants) merged, and Published / Last optimized derived.
// Pure module: no I/O.
// ─────────────────────────────────────────────────────────────────────────────

import { urlJoinKey } from '@/lib/url'
import type { ContentCalendarRow } from './types'

export type AzBadge = 'new' | 'optimized' | 'new-optimized' | 'other'

export type CalendarPage = {
  urlKey: string
  url: string
  topic: string
  contentType: string
  published: boolean
  badge: AzBadge
  publishDate: string | null
  lastOptimizedDate: string | null
}

/** Bare `/path` -> `https://<domain>/path`; absolute unchanged; null stays null. */
export function resolveCalendarUrl(
  raw: string | null,
  primaryOwnedDomain: string | null,
): string | null {
  const s = raw?.trim()
  if (!s) return null
  if (!s.startsWith('/')) return s
  if (!primaryOwnedDomain) return null // nowhere to link a bare path
  return `https://${primaryOwnedDomain}${s}`
}

function isPublished(status: string): boolean {
  return status.trim().toLowerCase() === 'published' // V1 rule: exact match
}

function badgeFor(rows: ContentCalendarRow[]): AzBadge {
  const isNew = rows.some((r) => r.contentAction === 'new')
  const isOpt = rows.some((r) => r.contentAction === 'optimized')
  if (isNew && isOpt) return 'new-optimized'
  if (isNew) return 'new'
  if (isOpt) return 'optimized'
  return 'other'
}

// ISO YYYY-MM-DD strings compare correctly as text.
function earliest(dates: (string | null)[]): string | null {
  const d = dates.filter((x): x is string => !!x)
  return d.length ? d.reduce((a, b) => (b < a ? b : a)) : null
}
function latest(dates: (string | null)[]): string | null {
  const d = dates.filter((x): x is string => !!x)
  return d.length ? d.reduce((a, b) => (b > a ? b : a)) : null
}

export function toCalendarPages(
  rows: ContentCalendarRow[],
  primaryOwnedDomain: string | null,
): CalendarPage[] {
  const groups = new Map<string, { url: string; rows: ContentCalendarRow[] }>()
  for (const row of rows) {
    const url = resolveCalendarUrl(row.url, primaryOwnedDomain)
    const key = urlJoinKey(url)
    if (!url || !key) continue
    const g = groups.get(key)
    if (g) g.rows.push(row)
    else groups.set(key, { url, rows: [row] })
  }

  return [...groups.entries()].map(([urlKey, { url, rows: rs }]) => {
    // Latest Publish Date wins; ties (and undated rows) go to the later row in
    // original order, so iterate in order and replace on >=.
    let latestRow = rs[0]
    for (const r of rs) {
      if (!latestRow.publishDate || (r.publishDate ?? '') >= latestRow.publishDate) {
        latestRow = r
      }
    }
    return {
      urlKey,
      url,
      topic: latestRow.topic,
      contentType: latestRow.contentType,
      published: rs.some((r) => isPublished(r.status)),
      badge: badgeFor(rs),
      // D-19: Publish Date is the only calendar date; updateDate is not used.
      publishDate: earliest(
        rs.filter((r) => r.contentAction !== 'optimized').map((r) => r.publishDate),
      ),
      lastOptimizedDate: latest(
        rs.filter((r) => r.contentAction === 'optimized').map((r) => r.publishDate),
      ),
    }
  })
}
