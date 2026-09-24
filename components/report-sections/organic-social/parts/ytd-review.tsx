import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getClientBySlug } from '@/lib/db/queries'
import { getOutlineKpis } from '@/lib/organic-social/outline-headlines'
import { OUTLINE_DATA_ROWS } from '@/lib/organic-social/outline-layout'
import { ytdConfig, ytdMonths, ytdSeries } from '@/lib/organic-social/ytd'
import { ChartCard } from '@/components/charts/chart-card'
import { LineChart } from '@/components/charts/line-chart'
import { BarChart } from '@/components/charts/bar-chart'
import { TrendSkeleton } from '../skeletons'
import { NoData } from '../no-data'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'

/** YTD Review (Jasmine's outlines, block 2 of every platform tab). Each point is the request that
 *  month's Data block sends (the month on screen reuses ctx's own range and comparison), so the graphs
 *  equal the Data tiles and lock with them. */
export async function YtdReviewSection({ ctx }: { ctx: OrganicSocialCtx }) {
  const { clientSlug, channel, dateRange, compareRange } = ctx
  if (!channel || !OUTLINE_DATA_ROWS.standard[channel]) return null
  let client: Awaited<ReturnType<typeof getClientBySlug>>
  try { client = await getClientBySlug(clientSlug) } catch { return <Fallback kind="error" /> }
  const cfg = ytdConfig((client?.dashSocialConfig as { reportingMonths?: unknown } | null | undefined)?.reportingMonths)
  if (!cfg) {
    console.warn(`[organic-social] ytd-review pinned without reportingMonths slug=${clientSlug}`)
    return null
  }
  const months = ytdMonths(dateRange, compareRange, cfg)
  if (!months || months.length === 0) return null
  const r = await safe(Promise.all(months.map((m) => getOutlineKpis(clientSlug, m.dateRange, m.compareRange, channel)))
    .then((all) => ytdSeries(months, Object.fromEntries(months.map((m, i) => [m.key, all[i]])))))
  if (!r.data) return <Fallback kind={r.error!} />
  if (r.data.points.length === 0) return <NoData />
  const data = r.data.points.map((p) => ({ month: p.label, followers: p.followers, views: p.views }))
  const followerKeys = [{ key: 'followers', label: 'Total Followers' }]
  const viewKeys = [{ key: 'views', label: 'Views' }]
  // Both graphs are lines through the months, as on the team's YTD slides. LineChart draws no dot for a
  // single point, so a one-month year (August at go-live, every January) is drawn as bars.
  const chart = (yKeys: { key: string; label: string }[]) => data.length < 2
    ? <BarChart data={data} xKey="month" yKeys={yKeys} />
    : <LineChart data={data} xKey="month" yKeys={yKeys} />
  return (
    <section className="space-y-4">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">YTD Review</h2>
      <div className="grid gap-5 lg:grid-cols-2">
        <ChartCard title="Follower Growth, Year to Date">{chart(followerKeys)}</ChartCard>
        <ChartCard title="Views, Year to Date">{chart(viewKeys)}</ChartCard>
      </div>
      {r.data.noData.length > 0 && <p className="text-xs text-text-muted">No data for {r.data.noData.join(', ')}</p>}
    </section>
  )
}

export const ytdReviewV1: PartImpl<OrganicSocialCtx> = {
  id: 'ytd-review',
  version: 1,
  published: false,
  defaultLabel: 'YTD Review',
  render: (ctx) => (
    <Suspense fallback={<TrendSkeleton />}>
      <YtdReviewSection ctx={ctx} />
    </Suspense>
  ),
}
