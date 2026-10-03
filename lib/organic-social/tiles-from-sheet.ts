// Total Followers and Views tiles from the team's YTD sheet (spec docs/superpowers/specs/2026-10-02-os-jasmine-call-
// changes-design.md section 5, S4). Pure: the loader (tile-sheets.ts) does the reads. The Dash request, its cache and
// its lock key are untouched; the sheet only replaces two values after Dash has answered.
import type { TotalMetric } from '@/lib/dash-social/types'
import type { DashChannel } from './metrics'
import type { OutlineKpis } from './outline-headlines'
import { outlineDelta } from './outline-delta'
import { lastOf, monthOf, type Clock } from './reporting-months'
import { addMonths, cellAt, type YtdConfig } from './ytd'
import type { YtdTab } from './ytd-sheet'

const WHOLE_MONTH = /^custom:(\d{4}-(?:0[1-9]|1[0-2]))-01,(\d{4}-\d{2}-\d{2})$/

/** The month on screen when the range is exactly one whole month whose last day is complete and which is not New
 *  York's current month; otherwise null and the tiles keep Dash's numbers (the live month is never replaced). The team's
 *  live month is New York's current month (monthsFor, reporting-months.ts), and from 00:00 UTC on the 1st until New
 *  York's midnight its range is already the whole month, so the month check is what keeps it live in every season. */
export function finishedMonthOnScreen(dateRange: string, clock: Pick<Clock, 'today' | 'lastCompleteUtcDay'>): string | null {
  const m = WHOLE_MONTH.exec(dateRange)
  if (!m || m[2] !== lastOf(m[1]) || m[2] > clock.lastCompleteUtcDay) return null
  if (monthOf(clock.today) === m[1]) return null
  return m[1]
}

/** The month the tiles' arrow compares with, the way locked months compares a finished month. */
export function comparisonMonth(key: string, comparison: YtdConfig['comparison']): string {
  return addMonths(key, comparison === 'previous-year' ? -12 : -1)
}

/** The year on screen's tab, and the comparison month's year's tab when that is another year (null when it has no
 *  usable entry or could not be read). */
export type TileSheets = { current: YtdTab; prior: YtdTab | null }

const TILES = [['followers', 'followers'], ['views', 'exposure']] as const

/** Each tile separately: a sheet number replaces the value, and the arrow becomes the sheet's number against the
 *  sheet's number for the comparison month (outlineDelta), or no arrow when the sheet does not have that month. Never
 *  sheet against Dash. Any other cell leaves the tile exactly as Dash built it. A month Dash returned all null stays No
 *  data: the other tiles would read 0. TikTok's Video Views row reads `exposure` (outline-layout.ts), so it follows. */
export function applySheetToTiles(built: OutlineKpis, channel: DashChannel, key: string, compareKey: string, sheets: TileSheets): OutlineKpis {
  if (built.noData) return built
  const compareTab = compareKey.slice(0, 4) === key.slice(0, 4) ? sheets.current : sheets.prior
  let kpis = built.kpis
  for (const [graph, tile] of TILES) {
    const k = kpis[tile]
    const cell = cellAt(sheets.current, graph, channel, key)
    if (!k || cell?.kind !== 'number') continue
    const prior = compareTab ? cellAt(compareTab, graph, channel, compareKey) : null
    const m: TotalMetric = { value: cell.value, context: prior?.kind === 'number' ? prior.value : null, context_change: null }
    kpis = { ...kpis, [tile]: { ...k, value: cell.value, delta: outlineDelta(m) } }
  }
  return kpis === built.kpis ? built : { ...built, kpis }
}
