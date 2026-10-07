// The team's KPI tracker sheet (10/6 calls; spec D1): one tab, the layout below, read with the YTD sheet's cached
// reader and parsed strictly. A deviation is a layout error for the whole block (never a partial row). The sheet id,
// the tab and every value stay out of log lines and thrown messages, as ytd-sheet.ts requires.
//   row 1: a title (any text)         row 2: blank
//   row 3: header, columns C to E: Total Followers | Impressions | Engagements
//   then per platform: [name, "End of <Month>", a, b, c] and ["", "H<1|2> <year> Target", a, b, c], the sheet's year
//   (H1 only with a January to June row),
//   each platform once; nothing but empty rows after the last block.
import type { DashChannel } from './metrics'
import { classifyCell } from './ytd-sheet'

export type KpiFigures = { followers: number; impressions: number; engagements: number }
export type KpiPlatform = { channel: DashChannel; monthLabel: string; actual: KpiFigures; target: KpiFigures }
export type KpiTracker = { platforms: KpiPlatform[] }

export class KpiSheetLayoutError extends Error {
  constructor(readonly missing: string) { super(`kpi sheet layout not found: ${missing}`); this.name = 'KpiSheetLayoutError' }
}

const PLATFORMS: Record<string, DashChannel> = { instagram: 'INSTAGRAM', facebook: 'FACEBOOK', linkedin: 'LINKEDIN', tiktok: 'TIKTOK', x: 'TWITTER', twitter: 'TWITTER' }
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
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
