import type { TrendSeries } from './types'
import type { Creative, TopContentPost } from './content-types'
import type { DashChannel } from './metrics'

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
/** Every annotated chart, the one allowlist hides and notes both check (Paul's review of #273, C12). */
export const ANNOTATION_CHARTS: readonly AnnotationChart[] = ['followers', 'engagements']

/** A peak ready to render: its value, its label, and the post that likely caused it. */
export interface Annotation extends Peak {
  label: string
  /** The top post published that day, or null when nothing went live or the posts failed to load. */
  post: TopContentPost | null
  /** Set for staff only: the team hid this annotation from the client. Clients never receive one. */
  hidden?: boolean
  /** Phase 2: the team's note for this day, already cut to what this viewer may see. */
  note?: AnnotationNote
  /** Phase 2: not a peak; shown only because the day has a note. Its label carries no number, and
   *  its value is never drawn (a day with no point on the series carries 0). */
  noteOnly?: true
}

/** What the hide control needs to address one chart's annotations. Present only for staff. */
export interface AnnotationControls {
  clientSlug: string
  channel: DashChannel
  chart: AnnotationChart
}

/** The part of a post the callout row draws: its picture and its link. Never a caption, a metric
 *  or an id. */
export interface ChartThumb {
  creative: Creative | null
  mediaType: TopContentPost['mediaType']
  url: string | null
}

/** What an editor needs to act on one day's notes. Never sent to anyone who cannot edit. */
export interface NoteEditorState {
  approvedId: string | null
  approvedPostIds: number[]
  draft: { id: string; text: string; postIds: number[] } | null
  /** The draft's picked posts as pictures, in pick order: what Approve would approve (Paul's review of
   *  #273, C3). A pick Dash no longer returns is a placeholder. Present only when the draft has picks. */
  draftThumbs?: ChartThumb[]
}

/** One day's note on the server, before it is trimmed for the chart. */
export interface AnnotationNote {
  /** The approved text, or null while the day has only a draft (only an editor ever sees that). */
  text: string | null
  /** The approved note's picked posts that Dash still returns for that day. Empty keeps `post`. */
  posts: TopContentPost[]
  /** Editors only. */
  editor?: NoteEditorState
}

/** What the Add note and Edit forms need for one chart. Editors only. */
export interface NoteControls {
  clientSlug: string
  channel: DashChannel
  chart: AnnotationChart
  canApprove: boolean
  /** Set when the day's posts could not be fetched (Paul's review of #273, C4): `days` is then empty
   *  because nothing loaded, not because nothing went live, so Edit keeps a note's picks as they are. */
  postsFailed?: true
  /** The days a note may go on, oldest first (never after today), each with that day's posts. */
  days: { day: string; posts: { id: number; thumb: ChartThumb }[] }[]
}

/** Every Follower Growth slide in the deck calls out 2 days; every Engagement slide 3. */
export const ANNOTATION_LIMIT: Record<AnnotationChart, number> = { followers: 2, engagements: 3 }

/** `8/14`: the date half of every label. No leading zeros and no year, since a report covers one
 *  month. A day shown only for its note uses this alone, because its value can be a zero or a
 *  loss, and the peak label below would print `+-3 Followers`. */
export function dayLabel(date: string): string {
  const [, month, day] = date.split('-')
  return `${Number(month)}/${Number(day)}`
}

/**
 * `8/10 | +12 Followers` or `8/9 | 35 Engagements`. No leading zeros and no year, since a
 * report covers one month. The deck separates the engagement label with a dash; a pipe is
 * used on both so the two charts read the same way.
 */
export function annotationLabel(date: string, value: number, chart: AnnotationChart): string {
  const when = dayLabel(date)
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
  thumb: ChartThumb | null
  /** Phase 2: the approved note, shown on its own line under the label. */
  note?: string
  /** Phase 2: the picked posts' thumbnails, drawn instead of `thumb`. */
  thumbs?: ChartThumb[]
  /** Phase 2: a day shown only for its note. */
  noteOnly?: true
  /** Phase 2, editors only: the ids and the draft behind the controls. */
  noteEditor?: NoteEditorState
}

/** What the row draws for one post: its picture and its link, nothing else. */
export function thumbOf(post: TopContentPost): ChartThumb {
  return { creative: post.creative, mediaType: post.mediaType, url: post.url }
}

/** Annotations, trimmed for the client component that draws them. A note adds only its approved
 *  text and its picked posts' thumbnails; the ids and the draft go to editors only, because
 *  notesByDay attaches `editor` only for someone who can edit. */
export function toChartAnnotations(items: Annotation[]): ChartAnnotation[] {
  return items.map(({ date, value, label, post, hidden, note, noteOnly }) => ({
    date,
    value,
    label,
    // Staff only: set by the hides layer, so the row can fade it and the chart can drop its dot.
    ...(hidden === undefined ? {} : { hidden }),
    thumb: post ? thumbOf(post) : null,
    ...(note?.text ? { note: note.text } : {}),
    ...(note && note.posts.length > 0 ? { thumbs: note.posts.map(thumbOf) } : {}),
    ...(noteOnly ? { noteOnly } : {}),
    ...(note?.editor ? { noteEditor: note.editor } : {}),
  }))
}
