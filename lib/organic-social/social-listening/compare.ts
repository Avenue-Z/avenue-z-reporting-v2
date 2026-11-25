// lib/organic-social/social-listening/compare.ts
// Month-over-month changes and year to date (spec docs/superpowers/specs/2026-11-19-social-listening-tab-design.md,
// section 7, decision D5: presented numbers are the record). Pure: no I/O, safe in tests and on the client.

import { presentedUpload } from './select'
import type { SlExport, SlHistory, SlMonth, SlSentimentCounts, SlTopic, SlUpload } from './types'

/** Sentiment shares in percent. */
export type SlPct = { pos: number; neu: number; neg: number }

/** What the client was shown for a month: its history row if one exists, else its presented upload (section 7).
 *  `whole` says the percents are whole numbers (a delivered report) rather than one decimal (an upload). */
export type Presented = {
  source: 'history' | 'upload'
  whole: boolean
  results: number | null
  uniqueAuthors: number | null
  engagement: number | null
  potentialReach: number | null
  pct: SlPct
  /** Reddit's own sentiment split, which can come from a different source than `pct` (see `presentedValues`). */
  reddit: { pct: SlPct; whole: boolean } | null
}

/** One month on a year to date chart: whole percents, or null for a gap (never zeros). */
export type YtdPoint = { month: SlMonth; value: SlPct | null }

/** Half up on the size, then the sign back, so a drop rounds like a rise; float noise is snapped first (nine
 *  decimals, as `roundDelta` in lib/delta-rounding.ts does), so 0.05 stored as 0.0500000000007 still rounds up.
 *  Never returns -0. */
function roundTo(x: number, decimals: number): number {
  const f = 10 ** decimals
  const size = Math.round(Math.round(Math.abs(x) * f * 1e9) / 1e9) / f
  if (size === 0) return 0
  return x < 0 ? -size : size
}

/** The exact share, 0 for an empty total. */
function share(count: number, total: number): number {
  return total > 0 ? (100 * count) / total : 0
}

/** pct(k) = 100 x count / total, one decimal (section 7). 0 when the total is 0. */
export function pct(count: number, total: number): number {
  return roundTo(share(count, total), 1)
}

/** 100 x (now / previous - 1), unrounded: `KpiCard wholeDelta` rounds it with `roundDelta`. A previous value that is
 *  missing, null or 0 has no change (the card's `comparisonExpected` placeholder), never Infinity (R2-2). */
export function tileChange(now: number, prev: number | null | undefined): number | undefined {
  if (prev === null || prev === undefined || prev === 0) return undefined
  return 100 * (now / prev - 1)
}

/** Percentage points, one decimal with its sign. Against a delivered report's whole percent the current share is
 *  rounded to whole first, so the change is between like numbers (R2-14). Null with no previous month. */
export function pointsChange(nowPct: number, prev: { pct: number; whole: boolean } | null): number | null {
  if (!prev) return null
  const now = prev.whole ? roundTo(nowPct, 0) : nowPct
  return roundTo(now - prev.pct, 1)
}

const MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/

function parseMonth(month: SlMonth): { year: number; m: number } {
  const hit = MONTH.exec(month)
  if (!hit) throw new Error('social-listening: a month must be YYYY-MM')
  return { year: Number(hit[1]), m: Number(hit[2]) }
}

function key(year: number, m: number): SlMonth {
  return `${year}-${String(m).padStart(2, '0')}`
}

/** The month before, across the year. */
export function prevMonth(month: SlMonth): SlMonth {
  const { year, m } = parseMonth(month)
  return m === 1 ? key(year - 1, 12) : key(year, m - 1)
}

function splitPct(c: SlSentimentCounts, total: number, round: (x: number) => number): SlPct {
  return { pos: round(share(c.pos, total)), neu: round(share(c.neu, total)), neg: round(share(c.neg, total)) }
}

const oneDecimal = (x: number) => roundTo(x, 1)
const whole = (x: number) => roundTo(x, 0)

/** The Reddit row of sentiment by media type, as exact shares of its own total; null when the row is absent or holds
 *  no results (never 0/0). The label is the one Talkwalker exports, checked against both real topics. */
function redditShares(data: SlExport, round: (x: number) => number): SlPct | null {
  const row = data.sentimentByMedia.find((m) => m.media === 'Reddit')
  if (!row) return null
  const total = row.pos + row.neu + row.neg
  return total > 0 ? splitPct(row, total, round) : null
}

function historyRow(month: SlMonth, topic: SlTopic, history: readonly SlHistory[]): SlHistory | null {
  return history.find((h) => h.month === month && h.topic === topic) ?? null
}

function presentedOf(month: SlMonth, topic: SlTopic, uploads: readonly SlUpload[]): SlUpload | null {
  return presentedUpload(uploads.filter((u) => u.month === month && u.topic === topic))
}

function historyReddit(h: SlHistory): SlPct | null {
  return h.redditPos === null || h.redditNeu === null || h.redditNeg === null
    ? null
    : { pos: h.redditPos, neu: h.redditNeu, neg: h.redditNeg }
}

/** A month's presented values (section 7): the history row if one exists, else the presented upload (D5: the newest
 *  made before the month opened, else the first; an upload after the open date never changes it). Reddit follows the
 *  same order on its own: the history row's Reddit columns when all three are set, else the presented upload's Reddit
 *  row, so a delivered report that left Reddit out still has a Reddit point. Null when the month has neither source. */
export function presentedValues(month: SlMonth, topic: SlTopic, history: readonly SlHistory[], uploads: readonly SlUpload[]): Presented | null {
  const h = historyRow(month, topic, history)
  const u = presentedOf(month, topic, uploads)
  const hReddit = h ? historyReddit(h) : null
  const uReddit = u ? redditShares(u.data, oneDecimal) : null
  const reddit = hReddit ? { pct: hReddit, whole: true } : uReddit ? { pct: uReddit, whole: false } : null
  if (h) {
    return {
      source: 'history', whole: true,
      results: h.results, uniqueAuthors: h.uniqueAuthors, engagement: h.engagement, potentialReach: h.potentialReach,
      pct: { pos: h.pos, neu: h.neu, neg: h.neg },
      reddit,
    }
  }
  if (!u) return null
  const d = u.data
  return {
    source: 'upload', whole: false,
    results: d.results,
    uniqueAuthors: d.uniqueAuthors ?? null, engagement: d.engagement ?? null, potentialReach: d.potentialReach ?? null,
    pct: splitPct(d.sentiment, d.results, oneDecimal),
    reddit,
  }
}

const roundAll = (p: SlPct): SlPct => ({ pos: whole(p.pos), neu: whole(p.neu), neg: whole(p.neg) })

/** January to the served month of its year, in whole percents, each share rounded on its own as the deck charts them
 *  (a point may sum to 99 or 101). Earlier months come from their presented values; the served month from `served`
 *  (its current upload), so the donut and its point agree. A month with no source is a gap. `pick` chooses the
 *  overall split or Reddit's. Only `served.topic` is read from `history` and `uploads`. */
export function ytdSeries(served: SlExport, history: readonly SlHistory[], uploads: readonly SlUpload[], pick: 'all' | 'reddit'): YtdPoint[] {
  const { year, m: last } = parseMonth(served.month)
  const out: YtdPoint[] = []
  for (let m = 1; m <= last; m++) {
    const month = key(year, m)
    if (m === last) {
      out.push({ month, value: pick === 'all' ? splitPct(served.sentiment, served.results, whole) : redditShares(served, whole) })
      continue
    }
    const p = presentedValues(month, served.topic, history, uploads)
    const v = pick === 'all' ? p?.pct : p?.reddit?.pct
    out.push({ month, value: v ? roundAll(v) : null })
  }
  return out
}

/** Positive + neutral for the "positive + neutral with negative" chart: round(pos) + round(neu) (R2-14). */
export function posNeu(point: SlPct): number {
  return whole(point.pos) + whole(point.neu)
}

/** An upload's result count per media type. Keyed by the media name in a Map: the name comes from the uploaded file, which
 *  never becomes a plain object key (export-parse.ts), since "__proto__" would read back as Object.prototype (#477). */
export function uploadMediaCounts(data: SlExport): Map<string, number> {
  return new Map(data.sentimentByMedia.map((r) => [r.media, r.pos + r.neu + r.neg]))
}

/** Last month's count per media type, from what the client saw (plan 2026-11-24, D4): the delivered report's counts when its
 *  history row has them, else last month's presented upload (the same order `presentedValues` follows). Null when neither
 *  exists. `source` says which, so the card can name it. */
export function mediaBaseline(month: SlMonth, topic: SlTopic, history: readonly SlHistory[], uploads: readonly SlUpload[]):
  { source: 'report' | 'export'; counts: Map<string, number> } | null {
  const h = historyRow(month, topic, history)
  if (h?.media) return { source: 'report', counts: new Map(h.media.map((m) => [m.media, m.count])) }
  const u = presentedOf(month, topic, uploads)
  return u ? { source: 'export', counts: uploadMediaCounts(u.data) } : null
}

/** The type whose results hold a type Talkwalker had not split out yet (September's "Other" held Newspaper). */
const OTHER = 'Other'

/** Each media type's percent change in results against last month's counts (`mediaBaseline`), unrounded like `tileChange`.
 *  Null ("n/a") with no baseline, a type absent last month, or a type with no results last month. When a type with results
 *  this month is absent from the baseline, its results were counted inside last month's "Other", so "Other" has no fair
 *  comparison and is n/a too (Q2; only the type named exactly "Other", never "Online News Other"). Keyed by name in a Map. */
export function mediaChanges(now: SlExport, before: ReadonlyMap<string, number> | null): Map<string, number | null> {
  const counts = uploadMediaCounts(now)
  const newType = before !== null && [...counts].some(([m, n]) => n > 0 && !before.has(m))
  return new Map([...counts].map(([m, n]) => [m, newType && m === OTHER ? null : tileChange(n, before?.get(m)) ?? null]))
}

/** Each influencer's change in posts against the previous month's presented upload, matched by `authorId` (a name
 *  can change, an id does not). Null ("new") when the author was not in last month's list or there is no list. Keyed
 *  by author id in a Map, for the same reason as `mediaChanges`. */
export function authorChanges(now: SlExport, prev: SlExport | null): Map<string, number | null> {
  const before = new Map((prev?.influencers ?? []).map((i) => [i.authorId, i.posts]))
  return new Map((now.influencers ?? []).map((i) => {
    const p = before.get(i.authorId)
    return [i.authorId, p === undefined ? null : i.posts - p]
  }))
}
