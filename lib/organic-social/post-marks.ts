import type { TopContentPost } from './content-types'

/** One day on the graph that had content go live, and what went live that day. */
export interface PostMark {
  /** ISO date, yyyy-mm-dd. Matches the x value of the trend series. */
  date: string
  /** How many posts went live that day. Drives the marker, not the hover list length. */
  count: number
  posts: TopContentPost[]
}

/**
 * Group posts by the day they were published, for marking a trend chart.
 *
 * The caller already holds these posts: Top Content fetches every post in the window
 * (CONTENT_FETCH_LIMIT is 500 and no client here posts more than ~35 a month), so marks
 * cost no extra request. Going through the same fetch also means a closed month's marks
 * freeze with its numbers, rather than drifting under a locked report.
 *
 * A post with no publish date is DROPPED. `publishedAt` is sliced off Dash's
 * `source_created_at`, which has come back blank before, and a post with no date cannot be
 * placed on a time axis: rendering it at the epoch or at today would both be lies. A post
 * with no creative is KEPT, because the question is what went live and when, and a missing
 * thumbnail is not a reason to hide that something ran.
 */
export function toPostMarks(posts: TopContentPost[]): PostMark[] {
  const byDate = new Map<string, TopContentPost[]>()
  for (const p of posts) {
    if (!p.publishedAt) continue
    const bucket = byDate.get(p.publishedAt)
    if (bucket) bucket.push(p)
    else byDate.set(p.publishedAt, [p])
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, ps]) => ({ date, count: ps.length, posts: ps }))
}
