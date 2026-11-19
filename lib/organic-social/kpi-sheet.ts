// The team's KPI tracker sheet (10/6 calls; spec D1): one tab, the layout below, read with the YTD sheet's cached
// reader and parsed strictly. A deviation is a layout error for the whole block (never a partial row). The sheet id,
// the tab and every value stay out of log lines and thrown messages, as ytd-sheet.ts requires.
//   row 1: a title (any text)         row 2: blank
//   row 3: header, columns C to E: Total Followers | Impressions | Engagements
//   then per platform: [name, "End of <Month>", a, b, c] and ["", "H<1|2> <year> Target", a, b, c], the sheet's year
//   (H1 only with a January to June row),
//   each platform once; nothing but empty rows after the last block.
import type { DashChannel } from './metrics'
import { classifyCell, SHEET_ID, ytdSheetFor } from './ytd-sheet'

export type KpiFigures = { followers: number; impressions: number; engagements: number }
export type KpiPlatform = { channel: DashChannel; monthLabel: string; actual: KpiFigures; target: KpiFigures }
export type KpiTracker = { platforms: KpiPlatform[] }

export class KpiSheetLayoutError extends Error {
  constructor(readonly missing: string) { super(`kpi sheet layout not found: ${missing}`); this.name = 'KpiSheetLayoutError' }
}

const PLATFORMS: Record<string, DashChannel> = { instagram: 'INSTAGRAM', facebook: 'FACEBOOK', linkedin: 'LINKEDIN', tiktok: 'TIKTOK', x: 'TWITTER', twitter: 'TWITTER' }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** The full English month names, 0 to 11: a month tab is named "<Month> <Year>". */
export const MONTH_NAMES: readonly string[] = MONTHS
const HEADER = ['total followers', 'impressions', 'engagements']
const ACTUAL = /^end of ([a-z]+)$/i
const TARGET = /^h([12]) (\d{4}) target$/i

const cell = (row: unknown[] | undefined, i: number) => String((row ?? [])[i] ?? '').trim()

function figures(row: unknown[] | undefined, name: string): KpiFigures {
  const read = (i: number, field: keyof KpiFigures) => {
    const c = classifyCell(cell(row, i))
    if (c.kind !== 'number') throw new KpiSheetLayoutError(`${name} ${field}`)
    return c.value
  }
  return { followers: read(2, 'followers'), impressions: read(3, 'impressions'), engagements: read(4, 'engagements') }
}

export function parseKpiGrid(grid: unknown[][], year: string): KpiTracker {
  if (HEADER.some((h, i) => cell(grid[2], 2 + i).toLowerCase() !== h)) throw new KpiSheetLayoutError('header')
  const platforms: KpiPlatform[] = []
  let i = 3
  for (; i < grid.length; i += 2) {
    const name = cell(grid[i], 0)
    if (name === '' && i > 3) break
    const channel = PLATFORMS[name.toLowerCase()]
    const month = ACTUAL.exec(cell(grid[i], 1))
    if (!channel || !month) throw new KpiSheetLayoutError('platform name')
    const target = TARGET.exec(cell(grid[i + 1], 1))
    if (cell(grid[i + 1], 0) !== '' || !target) throw new KpiSheetLayoutError(`${name} target`)
    // The target is the sheet's year's; another year is a mix-up.
    if (target[2] !== year) throw new KpiSheetLayoutError(`${name} target year`)
    const monthLabel = MONTHS.find((m) => m.toLowerCase() === month[1].toLowerCase())
    if (!monthLabel) throw new KpiSheetLayoutError(`${name} month`)
    // H1 pairs only with a January to June row: a year-to-date figure over a half-year goal would overstate progress.
    if (target[1] === '1' && MONTHS.indexOf(monthLabel) > 5) throw new KpiSheetLayoutError(`${name} target half`)
    // One block per platform: the part would silently take the first of two.
    if (platforms.some((p) => p.channel === channel)) throw new KpiSheetLayoutError(`${name} duplicate`)
    platforms.push({ channel, monthLabel, actual: figures(grid[i], name), target: figures(grid[i + 1], name) })
  }
  if (platforms.length === 0) throw new KpiSheetLayoutError('platform name')
  // Nothing may follow the last block except empty rows: a blank separator with platforms after it used to end the
  // parse silently and drop them (the header promises a layout error for any deviation).
  for (; i < grid.length; i++) if ((grid[i] ?? []).some((c) => String(c ?? '').trim() !== '')) throw new KpiSheetLayoutError('trailing rows')
  return { platforms }
}

/** The month a row names, 0 to 11; a name the parser would not have produced is a layout error. */
export function monthIndex(monthLabel: string): number {
  const m = MONTHS.findIndex((x) => x.toLowerCase() === monthLabel.toLowerCase())
  if (m < 0) throw new KpiSheetLayoutError('month')
  return m
}

/** "1/1/26 to 9/30/26": January 1 of the year to the last day of the row's month (the slide's badge, S6c). */
export function kpiPeriodLabel(monthLabel: string, year: string): string {
  const m = monthIndex(monthLabel)
  const last = new Date(Date.UTC(Number(year), m + 1, 0)).getUTCDate()
  const yy = year.slice(2)
  return `1/1/${yy} to ${m + 1}/${last}/${yy}`
}

// ---- Month tabs (spec docs/superpowers/specs/2026-11-11-kpi-tab-by-month-design.md) ----

/** A year's KPI tracker setting: a fixed tab (today's shape, unchanged), month tabs, nothing, or something unusable.
 *  Either usable shape may name a `startTab`, the tab holding where each platform ended last year (spec
 *  docs/superpowers/specs/2026-11-19-kpi-starting-point-design.md); an unusable one is `startTabInvalid` and the rest of
 *  the entry is still used. Both keys are omitted when absent, so a choice without them is exactly today's. */
type StartTab = { startTab?: string; startTabInvalid?: true }
export type KpiSheetChoice =
  | ({ kind: 'fixed'; sheetId: string; tab: string } & StartTab)
  | ({ kind: 'byMonth'; sheetId: string; carriedFrom?: string } & StartTab)
  | { kind: 'none' }
  | { kind: 'invalid' }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const has = (o: Record<string, unknown>, k: string) => Object.prototype.hasOwnProperty.call(o, k)

/** The entry's `startTab`: trimmed like `tab` (ytd-sheet.ts:34); a non-string, or empty or over 100 characters once
 *  trimmed, is marked invalid rather than dropping the whole entry. Pure: the part logs, once, with the slug. */
function startTabOf(e: Record<string, unknown>): StartTab {
  if (!has(e, 'startTab')) return {}
  const v = typeof e.startTab === 'string' ? e.startTab.trim() : ''
  return v.length > 0 && v.length <= 100 ? { startTab: v } : { startTabInvalid: true }
}

/** `{ sheetId, byMonth: true }` and nothing else that would make it ambiguous: no `tab`, `byMonth` exactly true. */
function byMonthEntry(e: Record<string, unknown>): KpiSheetChoice {
  if (e.byMonth !== true || has(e, 'tab') || typeof e.sheetId !== 'string' || !SHEET_ID.test(e.sheetId)) return { kind: 'invalid' }
  return { kind: 'byMonth', sheetId: e.sheetId, ...startTabOf(e) }
}

/** The setting for `year` (`dash_social_config.kpiSheets`). An entry with `byMonth` is month tabs; any other entry is read
 *  exactly as today by ytdSheetFor (a fixed tab). A year with no entry carries the newest earlier year's entry forward
 *  only when that entry is month tabs, so January works from the same tracker; a fixed entry never carries over. */
export function kpiSheetFor(value: unknown, year: string): KpiSheetChoice {
  if (isObj(value) && has(value, year)) {
    const e = value[year]
    if (isObj(e) && has(e, 'byMonth')) return byMonthEntry(e)
  }
  const fixed = ytdSheetFor(value, year)
  if (fixed.kind === 'ok') return { kind: 'fixed', sheetId: fixed.entry.sheetId, tab: fixed.entry.tab, ...startTabOf((value as Record<string, unknown>)[year] as Record<string, unknown>) }
  if (fixed.kind === 'invalid' || !isObj(value)) return fixed
  const last = Object.keys(value).filter((k) => /^\d{4}$/.test(k) && k < year).sort().pop()
  const e = last === undefined ? undefined : value[last]
  if (last === undefined || !isObj(e) || !has(e, 'byMonth')) return { kind: 'none' }
  const carried = byMonthEntry(e)
  if (carried.kind !== 'byMonth') return { kind: 'none' }
  const { startTab, startTabInvalid, ...rest } = carried
  return { ...rest, carriedFrom: last, ...(startTab !== undefined ? { startTab } : {}), ...(startTabInvalid ? { startTabInvalid } : {}) }
}

/** The tab named "<Month> <Year>" for `month` (0 to 11), matched trimmed and in any case; the raw title is returned because
 *  it is what the read must ask for. Two matches are ambiguous: never a guess. */
export function monthTabFor(titles: string[], year: string, month: number): { kind: 'one'; title: string } | { kind: 'none' } | { kind: 'ambiguous' } {
  const want = `${MONTHS[month]} ${year}`.toLowerCase()
  const hits = titles.filter((t) => t.trim().toLowerCase() === want)
  if (hits.length === 0) return { kind: 'none' }
  return hits.length > 1 ? { kind: 'ambiguous' } : { kind: 'one', title: hits[0] }
}

// ---- The start tab (spec docs/superpowers/specs/2026-11-19-kpi-starting-point-design.md) ----

/** Where each platform ended `startYear`, from the start tab, read like every tab (A1:Z40, ytd-sheet.ts:72-74):
 *    row 3, columns C to E: the month tabs' header
 *    then, per platform, a row [name, "<year>", a, b, c] and more rows [ "", "<year>", ... ] for other years
 *  Fully empty rows are skipped anywhere; a row with an empty column A belongs to the last named platform. Only the
 *  `startYear` row is read; a platform whose row is missing or not three numbers has no start (the others still do).
 *  A deviation is a KpiSheetLayoutError whose `missing` is a fixed token, never cell text. */
export function parseKpiStartGrid(grid: unknown[][], startYear: string): Partial<Record<DashChannel, KpiFigures>> {
  if (HEADER.some((h, i) => cell(grid[2], 2 + i).toLowerCase() !== h)) throw new KpiSheetLayoutError('header')
  const out: Partial<Record<DashChannel, KpiFigures>> = {}
  const seen = new Set<DashChannel>()
  let current: DashChannel | null = null
  let years = new Set<string>()
  for (let i = 3; i < grid.length; i++) {
    const row = grid[i]
    if (!Array.isArray(row) || row.every((c) => String(c ?? '').trim() === '')) continue
    const name = cell(row, 0)
    if (name !== '') {
      const channel = PLATFORMS[name.toLowerCase()]
      if (!channel) throw new KpiSheetLayoutError('platform name')
      if (seen.has(channel)) throw new KpiSheetLayoutError('duplicate platform')
      seen.add(channel); current = channel; years = new Set()
    } else if (current === null) throw new KpiSheetLayoutError('no platform')
    const y = cell(row, 1)
    if (!/^\d{4}$/.test(y)) throw new KpiSheetLayoutError('year')
    if (years.has(y)) throw new KpiSheetLayoutError('duplicate year')
    years.add(y)
    if (y !== startYear) continue
    const cells = [2, 3, 4].map((j) => classifyCell(cell(row, j)))
    if (cells.every((c) => c.kind === 'number')) {
      const [followers, impressions, engagements] = cells.map((c) => (c as { value: number }).value)
      out[current!] = { followers, impressions, engagements }
    }
  }
  return out
}
