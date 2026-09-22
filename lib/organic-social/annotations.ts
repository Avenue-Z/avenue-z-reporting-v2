import type { TrendSeries } from './types'
import type { Creative, TopContentPost } from './content-types'

/** One day worth calling out on a trend chart. */
export interface Peak {
  /** yyyy-mm-dd, as it appears on the series. */
  date: string
  /** That day's value on the chart. Always positive. */
  value: number
}

/**
 * The days that spiked, the way the team marks them by hand in the monthly deck.
 *
 * Only days inside the requested window count. The v2 graphs request the UTC month, which
 * has no extra day, but the Eastern window v1 sends returns a day past the month on some
 * channels, so the guard stays.
 *
 * Only positive values count, so a quiet account shows fewer annotations rather than
 * calling out a flat day. Ties go to the earlier date so the same data always produces the
 * same annotations. Neighbouring days are allowed.
 *
 * Returns nothing for a chart with more than one channel: a peak across several lines is
 * ambiguous. Returned in date order, left to right, matching the chart.
 */
export function pickPeaks(
  series: TrendSeries,
  { limit, from, to }: { limit: number; from: string; to: string },
): Peak[] {
  if (limit <= 0 || series.channels.length !== 1) return []
  const key = series.channels[0]
  const candidates: Peak[] = []
  for (const point of series.points) {
    const date = String(point.date)
    if (date < from || date > to) continue
    const value = Number(point[key])
    if (!Number.isFinite(value) || value <= 0) continue
    candidates.push({ date, value })
  }
  candidates.sort((a, b) => b.value - a.value || a.date.localeCompare(b.date))
  return candidates.slice(0, limit).sort((a, b) => a.date.localeCompare(b.date))
}

export type AnnotationChart = 'followers' | 'engagements'

/** A peak ready to render: its value, its label, and the post that likely caused it. */
export interface Annotation extends Peak {
  label: string
  /** The top post published that day, or null when nothing went live or the posts failed to load. */
  post: TopContentPost | null
}

/** Every Follower Growth slide in the deck calls out 2 days; every Engagement slide 3. */
export const ANNOTATION_LIMIT: Record<AnnotationChart, number> = { followers: 2, engagements: 3 }

/**
 * `8/10 | +12 Followers` or `8/9 | 35 Engagements`. No leading zeros and no year, since a
 * report covers one month. The deck separates the engagement label with a dash; a pipe is
 * used on both so the two charts read the same way.
 */
export function annotationLabel(date: string, value: number, chart: AnnotationChart): string {
  const [, month, day] = date.split('-')
  const when = `${Number(month)}/${Number(day)}`
  const amount = value.toLocaleString('en-US')
  if (chart === 'followers') return `${when} | +${amount} Follower${value === 1 ? '' : 's'}`
  return `${when} | ${amount} Engagement${value === 1 ? '' : 's'}`
}

/**
 * The top post published on each day, by engagements. Ties go to the lower post id so the
 * choice never flips between renders. A post with no publish date is dropped: a guessed
 * date would attach it to the wrong spike. publishedAt is the UTC date, which is the day
 * Dash's daily series counts the post on (probed 2026-09-18).
 */
export function topPostByDate(posts: TopContentPost[]): Map<string, TopContentPost> {
  const best = new Map<string, TopContentPost>()
  for (const p of posts) {
    if (!p.publishedAt) continue
    const current = best.get(p.publishedAt)
    const wins = !current
      || p.metrics.engagements > current.metrics.engagements
      || (p.metrics.engagements === current.metrics.engagements && p.id < current.id)
    if (wins) best.set(p.publishedAt, p)
  }
  return best
}

/** Peaks plus their labels and posts. `posts` is null when the post fetch failed, in which
 *  case every annotation still builds, just without a thumbnail. */
export function buildAnnotations(peaks: Peak[], posts: TopContentPost[] | null, chart: AnnotationChart): Annotation[] {
  const byDate = posts ? topPostByDate(posts) : new Map<string, TopContentPost>()
  return peaks.map((p) => ({ ...p, label: annotationLabel(p.date, p.value, chart), post: byDate.get(p.date) ?? null }))
}

/** What the chart (a client component) receives for one annotation: its label, its day, and
 *  just enough of the post to draw a thumbnail. The whole post never crosses the server to
 *  client boundary: no caption, no metrics, no ids. */
export interface ChartAnnotation {
  date: string
  value: number
  label: string
  /** Set by the hides layer; undefined means shown. */
  hidden?: boolean
  thumb: { creative: Creative | null; mediaType: TopContentPost['mediaType']; url: string | null } | null
}

/** Annotations, trimmed for the client component that draws them. */
export function toChartAnnotations(items: Annotation[]): ChartAnnotation[] {
  return items.map(({ date, value, label, post }) => ({
    date,
    value,
    label,
    thumb: post ? { creative: post.creative, mediaType: post.mediaType, url: post.url } : null,
  }))
}
