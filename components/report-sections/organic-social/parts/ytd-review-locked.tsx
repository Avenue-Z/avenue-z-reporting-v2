import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getClientBySlug } from '@/lib/db/queries'
import { getOutlineKpis } from '@/lib/organic-social/outline-headlines'
import { requestClock } from '@/lib/organic-social/locked-range'
import { monthsNeedingDash, ytdConfig, ytdLockedMonths, ytdSheetSeries } from '@/lib/organic-social/ytd'
import { parseYtdGrid, readYtdTab, ytdSheetFor, YtdSheetLayoutError, YtdSheetReadError, type YtdTab } from '@/lib/organic-social/ytd-sheet'
import { mapWithConcurrency } from '@/lib/concurrency'
import { TrendSkeleton } from '../skeletons'
import { NoData } from '../no-data'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback, YTD_TIMEOUT_TEXT } from './shared'
import { ytdReviewBlock } from './ytd-review-sheet'
import { logYtdClientReadFailed, logYtdMonthFailed } from './ytd-failure'
import { readYtdNotes } from './ytd-notes'

const NO_SHEET: YtdTab = { followers: {}, views: {} }

/** YTD Review for a client on locked months that keeps a live client's coverage (spec
 *  2026-10-12-os-renaissance-locked-months-design.md 4.2): the sheet first, Dash for a blank cell from January of the
 *  year on screen (ytd-review@3's floor), every platform tab including X (@3's channel rule), January through the
 *  month on screen (@2's rule) but never a month in progress. Every Dash month is a whole month with no comparison, so
 *  it locks like any other read once its month has. A missing or invalid sheet is an empty sheet (@3's path). Log lines
 *  carry the slug, never the sheet id, the tab or a value. */
export async function YtdLockedReviewSection({ ctx }: { ctx: OrganicSocialCtx }) {
  const { clientSlug, channel, dateRange, compareRange } = ctx
  if (!channel) return null
  let client: Awaited<ReturnType<typeof getClientBySlug>>
  try { client = await getClientBySlug(clientSlug) } catch { logYtdClientReadFailed(4, clientSlug); return <Fallback kind="error" /> }
  if (!client) {
    console.error(`[organic-social] ytd-review@4 client row missing slug=${clientSlug}`)
    return <Fallback kind="error" />
  }
  const dsc = client.dashSocialConfig as { reportingMonths?: unknown; ytdSheets?: unknown } | null | undefined
  const cfg = ytdConfig(dsc?.reportingMonths)
  if (!cfg) {
    console.warn(`[organic-social] ytd-review@4 skipped (no reportingMonths) slug=${clientSlug}`)
    return null
  }
  const months = ytdLockedMonths(dateRange, compareRange, cfg, requestClock().today)
  if (!months || months.length === 0) return null
  const year = months[0].key.slice(0, 4)
  const floor = `${year}-01`
  const sheet = ytdSheetFor(dsc?.ytdSheets, year)
  let tab = NO_SHEET
  if (sheet.kind === 'invalid') console.warn(`[organic-social] ytd sheet config invalid slug=${clientSlug} year=${year}; using Dash`)
  if (sheet.kind === 'ok') {
    try {
      tab = parseYtdGrid(await readYtdTab(sheet.entry.sheetId, sheet.entry.tab))
    } catch (e) {
      if (e instanceof YtdSheetLayoutError) console.error(`[organic-social] ytd sheet layout not found slug=${clientSlug} missing=${e.missing}`)
      else console.error(`[organic-social] ytd sheet read failed slug=${clientSlug} status=${e instanceof YtdSheetReadError ? e.status : 'error'}`)
      return <Fallback kind="error" />
    }
  }
  const need = monthsNeedingDash(months, tab, channel, floor)
  const r = await safe(mapWithConcurrency(need, 3, (m) => getOutlineKpis(clientSlug, m.dateRange, m.compareRange, channel).catch((e: unknown) => {
    logYtdMonthFailed(4, clientSlug, channel, m.key, e)
    throw e
  }))
    .then((all) => ytdSheetSeries(months, tab, channel, floor, Object.fromEntries(need.map((m, i) => [m.key, all[i]])))))
  if (!r.data) return <Fallback kind={r.error!} timeoutText={YTD_TIMEOUT_TEXT} />
  const s = r.data
  if (sheet.kind === 'ok') for (const g of s.missingColumn) console.warn(`[organic-social] ytd sheet column missing slug=${clientSlug} channel=${channel} graph=${g}`)
  for (const x of s.invalid) console.warn(`[organic-social] ytd sheet cell invalid slug=${clientSlug} channel=${channel} month=${x.month} graph=${x.graph}`)
  if (s.followers.points.length === 0 && s.views.points.length === 0) return <NoData />
  return ytdReviewBlock(s.followers, s.views, await readYtdNotes(client, ctx, months, s))
}

export const ytdReviewV4: PartImpl<OrganicSocialCtx> = {
  id: 'ytd-review',
  version: 4,
  published: false,
  defaultLabel: 'YTD Review',
  render: (ctx) => (
    <Suspense fallback={<TrendSkeleton />}>
      <YtdLockedReviewSection ctx={ctx} />
    </Suspense>
  ),
}
