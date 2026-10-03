// YTD Review (Jasmine's outlines, block 2 of every platform tab): which months the year-to-date graphs
// show, the request for each, and the points. Pure. It reads only the range on screen and the client's
// own reportingMonths setting, so it needs nothing from locked months (PR 256).
import type { OutlineKpis } from './outline-headlines'
import type { DashChannel } from './metrics'
import type { YtdCell, YtdTab } from './ytd-sheet'
import type { Clock } from './reporting-months'

const MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/
const CUSTOM_RE = /^custom:(\d{4}-\d{2}-\d{2}),(\d{4}-\d{2}-\d{2})$/
const SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export type YtdConfig = { firstMonth: string; comparison: 'previous-month' | 'previous-year' }
/** compareRange is null only for ytd-review@3's live months, which ask Dash with no comparison. */
export type YtdMonth = { key: string; dateRange: string; compareRange: string | null; partial: boolean }
export type YtdPoint = { key: string; label: string; followers: number; views: number }

const pad = (n: number) => String(n).padStart(2, '0')
const isDay = (s: string) => {
  const d = new Date(`${s}T00:00:00Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}
export const addMonths = (key: string, n: number) => {
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

export type YtdGraph = { points: { key: string; label: string; value: number }[]; gaps: string[] }
export type YtdGraphKey = 'followers' | 'views'
const GRAPHS: readonly YtdGraphKey[] = ['followers', 'views']
const labelOf = (m: YtdMonth) => { const short = SHORT[Number(m.key.slice(5, 7)) - 1]; return m.partial ? `${short} (live)` : short }
/** The cell for a month, or null when the tab has no column for this channel in that block. */
export const cellAt = (tab: YtdTab, g: YtdGraphKey, ch: DashChannel, key: string): YtdCell | null => {
  const c = tab[g][ch]
  return c ? c[Number(key.slice(5, 7)) - 1] ?? { kind: 'blank' } : null
}

/** ytd-review@2's months (spec 4.3): null wherever version 1 draws nothing; otherwise January of the year on screen
 *  through the month on screen. Months from firstMonth are ytdMonths's entries unchanged, so their Dash requests are
 *  version 1's; earlier months are built the same way and never requested. */
export function ytdSheetMonths(dateRange: string, compareRange: string, cfg: YtdConfig): YtdMonth[] | null {
  const base = ytdMonths(dateRange, compareRange, cfg)
  if (!base || base.length === 0) return null
  const out: YtdMonth[] = []
  for (let k = `${base[base.length - 1].key.slice(0, 4)}-01`; k < base[0].key; k = addMonths(k, 1)) {
    const ref = addMonths(k, cfg.comparison === 'previous-year' ? -12 : -1)
    out.push({ key: k, dateRange: `custom:${k}-01,${lastOf(k)}`, compareRange: `custom:${ref}-01,${lastOf(ref)}`, partial: false })
  }
  return [...out, ...base]
}

/** ytd-review@3's months for a live client (spec 2026-10-02 section 8): January of the last complete UTC day's year
 *  through that day's month, whatever the date picker shows. Earlier months are whole. The last runs to that day and is
 *  partial ("(live)") unless that day ends the month and its Dash window has closed: every Dash window ends at a fixed
 *  T04:00:00Z (base.ts), so the day is still open while liveDayInProgress. So on the 1st the previous month is shown
 *  whole, and on January 1 the previous year is. No comparison: compareRange is null. */
export function ytdLiveMonths(clock: Pick<Clock, 'lastCompleteUtcDay' | 'liveDayInProgress'>): YtdMonth[] {
  const day = clock.lastCompleteUtcDay
  const key = day.slice(0, 7)
  const out: YtdMonth[] = []
  for (let k = `${key.slice(0, 4)}-01`; k < key; k = addMonths(k, 1)) {
    out.push({ key: k, dateRange: `custom:${k}-01,${lastOf(k)}`, compareRange: null, partial: false })
  }
  out.push({ key, dateRange: `custom:${key}-01,${day}`, compareRange: null, partial: day < lastOf(key) || clock.liveDayInProgress })
  return out
}

/** Months on or after firstMonth with a blank cell (or no column) on either graph: the only ones Dash is asked for. */
export function monthsNeedingDash(months: YtdMonth[], tab: YtdTab, channel: DashChannel, firstMonth: string): YtdMonth[] {
  return months.filter((m) => m.key >= firstMonth && GRAPHS.some((g) => {
    const c = cellAt(tab, g, channel, m.key)
    return c === null || c.kind === 'blank'
  }))
}

/** Each graph decided separately per month (spec 4.3 table): the sheet's number wins; a blank from firstMonth uses
 *  the Data block's value (a gap when that month is noData); N/A, invalid and earlier blanks are gaps. Months before an
 *  account had data are not gaps (spec 2026-10-02 section 6, S7): per graph, the leading run of blank or N/A months
 *  that produced no point is not listed. An invalid cell is always listed and ends that run. */
export function ytdSheetSeries(
  months: YtdMonth[], tab: YtdTab, channel: DashChannel, firstMonth: string, built: Record<string, OutlineKpis | undefined>,
): { followers: YtdGraph; views: YtdGraph; invalid: { month: string; graph: YtdGraphKey }[]; missingColumn: YtdGraphKey[] } {
  const res = {
    followers: { points: [], gaps: [] } as YtdGraph,
    views: { points: [], gaps: [] } as YtdGraph,
    invalid: [] as { month: string; graph: YtdGraphKey }[],
    missingColumn: GRAPHS.filter((g) => !tab[g][channel]),
  }
  const leading: Record<YtdGraphKey, boolean> = { followers: true, views: true }
  for (const m of months) {
    const label = labelOf(m)
    for (const g of GRAPHS) {
      const c = cellAt(tab, g, channel, m.key) ?? { kind: 'blank' as const }
      if (c.kind === 'number') { res[g].points.push({ key: m.key, label, value: c.value }); leading[g] = false; continue }
      if (c.kind === 'invalid') { res.invalid.push({ month: m.key, graph: g }); leading[g] = false }
      if (c.kind === 'blank' && m.key >= firstMonth) {
        const b = built[m.key]
        const k = b?.kpis[g === 'followers' ? 'followers' : 'exposure']
        if (!b || !k) throw new Error(`YTD: no tiles for ${m.key}`)
        if (!b.noData) { res[g].points.push({ key: m.key, label, value: k.value }); leading[g] = false; continue }
      }
      if (!leading[g]) res[g].gaps.push(label)
    }
  }
  return res
}
