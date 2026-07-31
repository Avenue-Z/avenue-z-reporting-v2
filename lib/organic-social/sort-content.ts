import type { TopContentPost } from './content-types'

/** The metrics a Top Content post can be sorted by — the four already shown on each card. */
export type SortKey = 'effectiveness' | 'engagementRate' | 'engagements' | 'impressions'
export type SortDir = 'asc' | 'desc'

/** Clickable sort metrics in toolbar order. Labels match the PostCard metric rows. */
export const SORT_METRICS: { key: SortKey; label: string }[] = [
  { key: 'effectiveness', label: 'Effectiveness' },
  { key: 'engagementRate', label: 'Engagement Rate' },
  { key: 'engagements', label: 'Engagements' },
  { key: 'impressions', label: 'Views / Impr.' },
]

// Deterministic tie-break so equal metric values keep a stable, sensible order regardless of the
// active sort: strongest engagement first, then most recent, then id (a total order — no ties).
function tieBreak(a: TopContentPost, b: TopContentPost): number {
  if (a.metrics.engagements !== b.metrics.engagements) return b.metrics.engagements - a.metrics.engagements
  if (a.publishedAt !== b.publishedAt) return a.publishedAt < b.publishedAt ? 1 : -1
  return a.id - b.id
}

export interface Page<T> {
  slice: T[]      // the items on the (clamped) page
  page: number    // 0-based, clamped to [0, pageCount-1]
  pageCount: number // always ≥ 1, so an empty list is one empty page
  total: number
  start: number   // 0-based index of the first item on the page (end-exclusive slice bounds)
  end: number
}

/** Pure pagination over an already-ordered array. `page` is clamped into range so a stale page
 *  index (e.g. after the list shrinks or the sort changes) never yields an out-of-range empty
 *  view. Caller does the sort first (sort-then-paginate), so page 0 is the true top-`size`. */
export function paginate<T>(items: T[], page: number, size: number): Page<T> {
  const total = items.length
  const pageCount = Math.max(1, Math.ceil(total / size))
  const clamped = Math.min(Math.max(page, 0), pageCount - 1)
  const start = clamped * size
  const end = Math.min(start + size, total)
  return { slice: items.slice(start, end), page: clamped, pageCount, total, start, end }
}

/** Sort a COPY of `posts` by a metric. Nulls (effectiveness / engagementRate are null on
 *  LinkedIn & X) always sort LAST regardless of direction, so a "—" never floats to the top. */
export function sortPosts(posts: TopContentPost[], key: SortKey, dir: SortDir): TopContentPost[] {
  const sign = dir === 'asc' ? 1 : -1
  return [...posts].sort((a, b) => {
    const av = a.metrics[key]
    const bv = b.metrics[key]
    if (av == null && bv == null) return tieBreak(a, b)
    if (av == null) return 1 // nulls last
    if (bv == null) return -1
    if (av !== bv) return (av - bv) * sign
    return tieBreak(a, b)
  })
}
