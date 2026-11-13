// lib/organic-social/aeo-tab/params.ts
// The AEO Informed Social tab's two URL params and the window each view covers (spec
// docs/superpowers/specs/2026-11-12-aeo-informed-social-tab-design.md, section 2 and section 3 item 6). Pure.
import { resolveDateRange } from '@/lib/date-range'

/** The range control: Month (default), YTD, All time. */
export type AeoRange = 'month' | 'ytd' | 'all'
/** Its labels, on the tab (aeo-informed/copy.ts) and in the export stamp (stamp.ts). */
export const AEO_RANGE_LABEL: Record<AeoRange, string> = { month: 'Month', ytd: 'YTD', all: 'All time' }

/** `aeo=month|ytd|all`; anything else (missing, another case, a repeated param) is month. */
export function parseAeoRange(raw: unknown): AeoRange {
  return raw === 'ytd' || raw === 'all' || raw === 'month' ? raw : 'month'
}

/** `aeomin=1..5`, the URL Gaps min competitors; anything else is 2, the outline's "Min 2 competitors" (P035). */
export function parseAeoMin(raw: unknown): number {
  return typeof raw === 'string' && /^[1-5]$/.test(raw) ? Number(raw) : 2
}

const DAY_MS = 86_400_000
const isDay = (v: unknown): v is string => {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false
  const t = new Date(`${v}T00:00:00Z`)
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === v
}
const day = (v: unknown, what: string): string => {
  if (!isDay(v)) throw new RangeError(`${what} is not a real YYYY-MM-DD date`)
  return v
}
const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * DAY_MS).toISOString().slice(0, 10)
const daysIn = (w: { start: string; end: string }) => Math.round((Date.parse(`${w.end}T00:00:00Z`) - Date.parse(`${w.start}T00:00:00Z`)) / DAY_MS) + 1
const monthEnd = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10)

export type AeoWindow =
  | { kind: 'ok'; window: { start: string; end: string }; asOf: string; monthLabel: string; previousDays: number | null }
  /** The served month has no finished day yet (its first day). Only the team can be served an in-progress month. */
  | { kind: 'not-started'; monthLabel: string }
  /** All time for a served month that ends before the client's first data day: nothing to show, never a backwards window. */
  | { kind: 'before-data'; monthLabel: string }

/**
 * The window the tab shows, and the data's last day (the adapter's asOf).
 * - The served month is the calendar month of the served range's last day, resolved by resolveDateRange, the clock every other tab uses
 *   (a locked month's range, or the page's range otherwise).
 * - Every window ends on the served month's last day or yesterday (UTC), whichever is earlier: the adapter refuses an as-of that is not
 *   before today (gate rule meta.as-of) and a window that ends after the as-of (aeo-informed/index.ts validate).
 * - Month starts on the 1st and is compared with the same number of days just before it (Peec's default indicator, the adapter's
 *   previousWindow), so previousDays is the window's length. YTD starts January 1 and All time on `allTimeFrom`; neither shows a change.
 * `today` is the UTC date. A served range, `today` or `allTimeFrom` that is not a real date throws a RangeError.
 */
export function aeoWindow({ servedRange, range, allTimeFrom, today }: { servedRange: string; range: AeoRange; allTimeFrom: string; today: string }): AeoWindow {
  const servedEnd = day(resolveDateRange(servedRange).endDate, `the served range's last day (${servedRange.slice(0, 40)})`)
  const yesterday = addDays(day(today, 'today'), -1)
  const [y, m] = servedEnd.split('-').map(Number)
  const monthStart = `${servedEnd.slice(0, 7)}-01`
  const monthLabel = new Date(Date.UTC(y, m - 1, 1)).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
  if (monthStart > yesterday) return { kind: 'not-started', monthLabel }
  const end = monthEnd(y, m) < yesterday ? monthEnd(y, m) : yesterday
  const start = range === 'month' ? monthStart : range === 'ytd' ? `${y}-01-01` : day(allTimeFrom, 'allTimeFrom')
  if (start > end) return { kind: 'before-data', monthLabel }
  const window = { start, end }
  return { kind: 'ok', window, asOf: end, monthLabel, previousDays: range === 'month' ? daysIn(window) : null }
}

/** One graph's buckets for a window: 7-day buckets from its start, a partial last week rounded up (the adapter cuts it at the as-of). */
export function graphViews(window: { start: string; end: string }): { from: string; weeks: number } {
  return { from: window.start, weeks: Math.ceil(daysIn(window) / 7) }
}
