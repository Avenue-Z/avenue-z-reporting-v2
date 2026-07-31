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
