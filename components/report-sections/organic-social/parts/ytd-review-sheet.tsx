import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getClientBySlug } from '@/lib/db/queries'
import { getOutlineKpis } from '@/lib/organic-social/outline-headlines'
import { OUTLINE_DATA_ROWS } from '@/lib/organic-social/outline-layout'
import { monthsNeedingDash, ytdConfig, ytdSheetMonths, ytdSheetSeries, type YtdGraph } from '@/lib/organic-social/ytd'
import { parseYtdGrid, readYtdTab, ytdSheetFor, YtdSheetLayoutError, YtdSheetReadError, type YtdTab } from '@/lib/organic-social/ytd-sheet'
import { mapWithConcurrency } from '@/lib/concurrency'
import { ChartCard } from '@/components/charts/chart-card'
import { LineChart } from '@/components/charts/line-chart'
import { BarChart } from '@/components/charts/bar-chart'
import { TrendSkeleton } from '../skeletons'
import { NoData } from '../no-data'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback, YTD_TIMEOUT_TEXT } from './shared'
import { YtdReviewSection } from './ytd-review'
import { logYtdClientReadFailed, logYtdMonthFailed } from './ytd-failure'
import { readYtdNotes, type YtdGraphNotes, type YtdNotes } from './ytd-notes'
import { YtdNotesPanel } from '../ytd-notes-panel'

/** YTD Review from the team's YTD sheet (docs/superpowers/specs/2026-10-01-ytd-from-sheet-design.md). The sheet is
 *  the source of truth; a month it has not filled in yet, from firstMonth on, shows the Data block's own value. With
 *  no valid sheet for the year on screen it renders version 1 exactly. Log lines carry the slug, never the sheet id,
 *  the tab or a value. */
export async function YtdSheetReviewSection({ ctx }: { ctx: OrganicSocialCtx }) {
  const { clientSlug, channel, dateRange, compareRange } = ctx
  if (!channel || !OUTLINE_DATA_ROWS.standard[channel]) return null
  let client: Awaited<ReturnType<typeof getClientBySlug>>
  try { client = await getClientBySlug(clientSlug) } catch { logYtdClientReadFailed(2, clientSlug); return <Fallback kind="error" /> }
  const dsc = client?.dashSocialConfig as { reportingMonths?: unknown; ytdSheets?: unknown } | null | undefined
  const cfg = ytdConfig(dsc?.reportingMonths)
  if (!cfg) {
    console.warn(`[organic-social] ytd-review pinned without reportingMonths slug=${clientSlug}`)
    return null
  }
  const months = ytdSheetMonths(dateRange, compareRange, cfg)
  if (!months) return null
  const year = months[months.length - 1].key.slice(0, 4)
  const sheet = ytdSheetFor(dsc?.ytdSheets, year)
  if (sheet.kind !== 'ok') {
    if (sheet.kind === 'invalid') console.warn(`[organic-social] ytd sheet config invalid slug=${clientSlug} year=${year}`)
    return <YtdReviewSection ctx={ctx} />
  }
  let tab: YtdTab
  try {
    tab = parseYtdGrid(await readYtdTab(sheet.entry.sheetId, sheet.entry.tab))
  } catch (e) {
    if (e instanceof YtdSheetLayoutError) console.error(`[organic-social] ytd sheet layout not found slug=${clientSlug} missing=${e.missing}`)
    else console.error(`[organic-social] ytd sheet read failed slug=${clientSlug} status=${e instanceof YtdSheetReadError ? e.status : 'error'}`)
    return <Fallback kind="error" />
  }
  const need = monthsNeedingDash(months, tab, channel, cfg.firstMonth)
  const r = await safe(mapWithConcurrency(need, 3, (m) => getOutlineKpis(clientSlug, m.dateRange, m.compareRange, channel).catch((e: unknown) => {
    logYtdMonthFailed(2, clientSlug, channel, m.key, e)
    throw e
  }))
    .then((all) => ytdSheetSeries(months, tab, channel, cfg.firstMonth, Object.fromEntries(need.map((m, i) => [m.key, all[i]])))))
  if (!r.data) return <Fallback kind={r.error!} timeoutText={YTD_TIMEOUT_TEXT} />
  const s = r.data
  for (const g of s.missingColumn) console.warn(`[organic-social] ytd sheet column missing slug=${clientSlug} channel=${channel} graph=${g}`)
  for (const x of s.invalid) console.warn(`[organic-social] ytd sheet cell invalid slug=${clientSlug} channel=${channel} month=${x.month} graph=${x.graph}`)
  if (s.followers.points.length === 0 && s.views.points.length === 0) return <NoData />
  return ytdReviewBlock(s.followers, s.views, await readYtdNotes(client, ctx, months, s))
}

/** The YTD Review block from its two graphs. Shared by version 2 and version 3 (live), so both draw the same markup.
 *  `notes` (the team's notes, readYtdNotes) is optional: absent, the block draws exactly as before. */
export function ytdReviewBlock(followers: YtdGraph, views: YtdGraph, notes?: YtdNotes) {
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">YTD Review</h2>
      <div className="grid gap-5 lg:grid-cols-2">
        {graph('Follower Growth, Year to Date', 'followers', 'Total Followers', 'follower', followers, notes?.followers)}
        {graph('Views, Year to Date', 'views', 'Views', 'views', views, notes?.views)}
      </div>
    </section>
  )
}

/** One card. Lines through the months, as version 1; one point is drawn as bars, judged on this graph's own count.
 *  A plain function, not a component, so the returned tree holds the chart elements (as version 1's does). A line gets
 *  the approved notes as hover text and a dot (LineChart's `notes` and `marks`, only when there are any); the panel
 *  under the card holds the rest and, for editors, the controls (spec 2026-10-06-os-ytd-notes-design.md). */
function graph(title: string, yKey: 'followers' | 'views', label: string, gapWord: string, g: YtdGraph, gn?: YtdGraphNotes) {
  const data = g.points.map((p) => ({ month: p.label, [yKey]: p.value }))
  const yKeys = [{ key: yKey, label }]
  return (
    <div key={yKey} className="space-y-2">
      <ChartCard title={title}>
        {data.length === 0 ? <NoData /> : data.length < 2
          ? <BarChart data={data} xKey="month" yKeys={yKeys} />
          : <LineChart data={data} xKey="month" yKeys={yKeys} {...(gn?.notes ? { notes: gn.notes } : {})} {...(gn?.marks ? { marks: gn.marks } : {})} />}
      </ChartCard>
      {g.gaps.length > 0 && <p className="text-xs text-text-muted">No {gapWord} data for {g.gaps.join(', ')}</p>}
      {gn && <YtdNotesPanel notes={gn} title={title} />}
    </div>
  )
}

export const ytdReviewV2: PartImpl<OrganicSocialCtx> = {
  id: 'ytd-review',
  version: 2,
  published: false,
  defaultLabel: 'YTD Review',
  render: (ctx) => (
    <Suspense fallback={<TrendSkeleton />}>
      <YtdSheetReviewSection ctx={ctx} />
    </Suspense>
  ),
}
