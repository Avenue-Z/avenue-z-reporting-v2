// YTD Review (Jasmine's outlines, block 2 of every platform tab): which months the year-to-date graphs
// show, the request for each, and the points. Pure. It reads only the range on screen and the client's
// own reportingMonths setting, so it needs nothing from locked months (PR 256).
import type { OutlineKpis } from './outline-headlines'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const CUSTOM_RE = /^custom:(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})$/
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type YtdConfig = { firstMonth: string; comparison: 'previous-month' | 'previous-year' }
export type YtdMonth = { key: string; dateRange: string; compareRange: string; partial: boolean }
export type YtdPoint = { key: string; label: string; followers: number; views: number }

const pad = (n: number) => String(n).padStart(2, '0')
const isDay = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}
const addMonths = (key: string, n: number) => {
  const [y, m] = key.split('-').map(Number)
  const total = y * 12 + (m - 1) + n
  return `${String(Math.floor(total / 12)).padStart(4, '0')}-${pad((total % 12) + 1)}`
}
const lastOf = (key: string) => {
  const [y, m] = key.split('-').map(Number)
  return `${key}-${pad(new Date(Date.UTC(y, m, 0)).getUTCDate())}`
}

/** The client's reportingMonths setting as YTD needs it, or null when it is absent or firstMonth is
 *  malformed. Same default as locked months: previous-month unless it is exactly previous-year. */
export function ytdConfig(value: unknown): YtdConfig | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  const v = value as Record<string, unknown>
  if (typeof v.firstMonth !== 'string' || !MONTH_RE.test(v.firstMonth)) return null
  return { firstMonth: v.firstMonth, comparison: v.comparison === 'previous-year' ? 'previous-year' : 'previous-month' }
}

/** The months from January of the month on screen (never before firstMonth) through the month on
 *  screen, oldest first. The month on screen keeps the exact range and comparison its Data block sends;
 *  every earlier month is the whole month, compared the way locked months compares a finished month.
 *  null when the range on screen is not one month starting on the 1st. At most 12 months. */
export function ytdMonths(dateRange: string, compareRange: string, cfg: YtdConfig): YtdMonth[] | null {
  const m = CUSTOM_RE.exec(dateRange)
  if (!m || !isDay(m[1]) || !isDay(m[2])) return null
  const [, start, end] = m
  const key = start.slice(0, 7)
  if (start !== `${key}-01` || end.slice(0, 7) !== key) return null
  const yearStart = `${key.slice(0, 4)}-01`
  const from = yearStart > cfg.firstMonth ? yearStart : cfg.firstMonth
  const out: YtdMonth[] = []
  for (let k = from; k < key; k = addMonths(k, 1)) {
    const ref = addMonths(k, cfg.comparison === 'previous-year' ? -12 : -1)
    out.push({ key: k, dateRange: `custom:${k}-01,${lastOf(k)}`, compareRange: `custom:${ref}-01,${lastOf(ref)}`, partial: false })
  }
  if (key >= cfg.firstMonth) out.push({ key, dateRange, compareRange, partial: end < lastOf(key) })
  return out
}

/** Each month's Total Followers and Views tiles (the Data block's own values). A month the Data block
 *  shows as "No data" is left off and named, never plotted as zero. */
export function ytdSeries(months: YtdMonth[], built: Record<string, OutlineKpis | undefined>): { points: YtdPoint[]; noData: string[] } {
  const points: YtdPoint[] = []
  const noData: string[] = []
  for (const m of months) {
    const b = built[m.key]
    const f = b?.kpis.followers
    const v = b?.kpis.exposure
    if (!b || !f || !v) throw new Error(`YTD: no tiles for ${m.key}`)
    const short = SHORT[Number(m.key.slice(5, 7)) - 1]
    const label = m.partial ? `${short} (live)` : short
    if (b.noData) { noData.push(label); continue }
    points.push({ key: m.key, label, followers: f.value, views: v.value })
  }
  return { points, noData }
}
