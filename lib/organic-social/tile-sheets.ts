// The reads behind the tiles from the sheet (spec 2026-10-02 section 5): the client's config, then at most two cached
// sheet reads (the year on screen, and the comparison month's year when it differs). Never throws: every sheet failure
// is logged with the slug and year, never the sheet id, the tab or a value (ytd-sheet.ts), and the tiles keep Dash's
// numbers. A failed client read is silent here, because the tiles' own Dash request needs the same row and fails with it.
import { getClientBySlug } from '@/lib/db/queries'
import { requestClock } from './locked-range'
import { comparisonMonth, finishedMonthOnScreen, type TileSheets } from './tiles-from-sheet'
import { ytdConfig } from './ytd'
import { parseYtdGrid, readYtdTab, ytdSheetFor, YtdSheetLayoutError, YtdSheetReadError, type YtdTab } from './ytd-sheet'

export type TileSheetPlan = { key: string; compareKey: string; sheets: TileSheets }

async function readYear(slug: string, ytdSheets: unknown, year: string): Promise<YtdTab | null> {
  const s = ytdSheetFor(ytdSheets, year)
  if (s.kind === 'none') return null
  if (s.kind === 'invalid') {
    console.warn(`[organic-social] ytd sheet config invalid (tiles) slug=${slug} year=${year}`)
    return null
  }
  try {
    return parseYtdGrid(await readYtdTab(s.entry.sheetId, s.entry.tab))
  } catch (e) {
    if (e instanceof YtdSheetLayoutError) console.error(`[organic-social] ytd sheet layout not found (tiles) slug=${slug} year=${year} missing=${e.missing}`)
    else console.error(`[organic-social] ytd sheet read failed (tiles) slug=${slug} year=${year} status=${e instanceof YtdSheetReadError ? e.status : 'error'}`)
    return null
  }
}

/** What the Data block needs to show Total Followers and Views from the sheet, or null when it keeps Dash's numbers:
 *  the range is not a finished whole month (checked first, so a rolling range never reads the client row), the client
 *  is not on locked months (Renaissance never is), or there is no usable sheet for that year. */
export async function loadTileSheets(slug: string, dateRange: string): Promise<TileSheetPlan | null> {
  const key = finishedMonthOnScreen(dateRange, requestClock())
  if (!key) return null
  let dsc: { reportingMonths?: unknown; ytdSheets?: unknown } | null | undefined
  // The tiles' own Dash request needs the same row; if it cannot be read, that request fails and shows the error card.
  try { dsc = (await getClientBySlug(slug))?.dashSocialConfig as typeof dsc } catch { return null }
  const cfg = ytdConfig(dsc?.reportingMonths)
  if (!cfg) return null
  const compareKey = comparisonMonth(key, cfg.comparison)
  const year = key.slice(0, 4)
  const priorYear = compareKey.slice(0, 4)
  const [current, prior] = await Promise.all([
    readYear(slug, dsc?.ytdSheets, year),
    priorYear === year ? Promise.resolve(null) : readYear(slug, dsc?.ytdSheets, priorYear),
  ])
  if (!current) return null
  return { key, compareKey, sheets: { current, prior } }
}
