import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getClientBySlug } from '@/lib/db/queries'
import { getOutlineKpis } from '@/lib/organic-social/outline-headlines'
import { OUTLINE_DATA_ROWS } from '@/lib/organic-social/outline-layout'
import { requestClock } from '@/lib/organic-social/locked-range'
import { hasReportingMonths } from '@/lib/organic-social/reporting-months'
import { monthsNeedingDash, ytdLiveMonths, ytdSheetSeries } from '@/lib/organic-social/ytd'
import { parseYtdGrid, readYtdTab, ytdSheetFor, YtdSheetLayoutError, YtdSheetReadError, type YtdTab } from '@/lib/organic-social/ytd-sheet'
import { mapWithConcurrency } from '@/lib/concurrency'
import { DashApiError, DashAuthError, DashRateLimitError, DashTimeoutError } from '@/lib/dash-social/client'
import { TrendSkeleton } from '../skeletons'
import { NoData } from '../no-data'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'
import { ytdReviewBlock } from './ytd-review-sheet'

const NO_SHEET: YtdTab = { followers: {}, views: {} }

/** A Dash failure as a log can carry it: the kind and the HTTP status only. Dash's messages hold the request URL, which
 *  names the brand (lib/dash-social/client.ts), so the message itself is never logged. */
function dashFailure(e: unknown): { kind: string; status: string } {
  const kind = e instanceof DashTimeoutError ? 'timeout' : e instanceof DashRateLimitError ? 'rate-limit'
    : e instanceof DashAuthError ? 'auth' : e instanceof DashApiError ? 'api' : 'other'
  const status = e instanceof DashApiError && !(e instanceof DashTimeoutError) ? (/^(\d{3})\b/.exec(e.message)?.[1] ?? 'none') : 'none'
  return { kind, status }
}

/** YTD Review for a live client (spec docs/superpowers/specs/2026-10-02-os-jasmine-call-changes-design.md section 8,
 *  S9; Paul approved 2026-10-02). January through the current month whatever the date picker shows; the sheet's number
 *  wins, and any month it has not filled comes from live Dash with no comparison (a live client has no first month).
 *  Only for clients without reportingMonths: a locked-months client renders nothing, so this can never create new lock
 *  rows or requests for one. Log lines carry the slug, never the sheet id, the tab or a value. */
export async function YtdLiveReviewSection({ ctx }: { ctx: OrganicSocialCtx }) {
  const { clientSlug, channel } = ctx
  if (!channel || !OUTLINE_DATA_ROWS.standard[channel]) return null
  let client: Awaited<ReturnType<typeof getClientBySlug>>
  try { client = await getClientBySlug(clientSlug) } catch { return <Fallback kind="error" /> }
  if (hasReportingMonths(client)) {
    console.warn(`[organic-social] ytd-review@3 skipped (client has reportingMonths) slug=${clientSlug}`)
    return null
  }
  const months = ytdLiveMonths(requestClock())
  const year = months[0].key.slice(0, 4)
  const floor = `${year}-01`
  const sheet = ytdSheetFor((client?.dashSocialConfig as { ytdSheets?: unknown } | null | undefined)?.ytdSheets, year)
  let tab = NO_SHEET
  if (sheet.kind === 'invalid') console.warn(`[organic-social] ytd sheet config invalid slug=${clientSlug} year=${year}; using live Dash`)
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
  // Each failed month is logged on its own line (the block still shows the fallback card), so whoever reads the log
  // sees which month and what kind of failure it was.
  const r = await safe(mapWithConcurrency(need, 3, (m) => getOutlineKpis(clientSlug, m.dateRange, m.compareRange, channel).catch((e: unknown) => {
    const f = dashFailure(e)
    console.error(`[organic-social] ytd-review@3 Dash request failed slug=${clientSlug} channel=${channel} month=${m.key} kind=${f.kind} status=${f.status}`)
    throw e
  }))
    .then((all) => ytdSheetSeries(months, tab, channel, floor, Object.fromEntries(need.map((m, i) => [m.key, all[i]])))))
  if (!r.data) return <Fallback kind={r.error!} />
  const s = r.data
  if (sheet.kind === 'ok') for (const g of s.missingColumn) console.warn(`[organic-social] ytd sheet column missing slug=${clientSlug} channel=${channel} graph=${g}`)
  for (const x of s.invalid) console.warn(`[organic-social] ytd sheet cell invalid slug=${clientSlug} channel=${channel} month=${x.month} graph=${x.graph}`)
  if (s.followers.points.length === 0 && s.views.points.length === 0) return <NoData />
  return ytdReviewBlock(s.followers, s.views)
}

export const ytdReviewV3: PartImpl<OrganicSocialCtx> = {
  id: 'ytd-review',
  version: 3,
  published: false,
  defaultLabel: 'YTD Review',
  render: (ctx) => (
    <Suspense fallback={<TrendSkeleton />}>
      <YtdLiveReviewSection ctx={ctx} />
    </Suspense>
  ),
}
