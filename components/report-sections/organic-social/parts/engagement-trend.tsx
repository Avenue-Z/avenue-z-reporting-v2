import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getEngagementTrend } from '@/lib/organic-social/trends'
import { EngagementTrend } from '../trends'
import { TrendSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'
import { graphPosts } from '@/lib/organic-social/graph-posts'
import { isoRange } from '@/lib/organic-social/base'
import { CHANNEL_LABEL } from '@/lib/organic-social/metrics'
import { pickPeaks, buildAnnotations, toChartAnnotations, ANNOTATION_LIMIT } from '@/lib/organic-social/annotations'
import { withHides } from './annotation-hides'
import { withNotes } from './chart-notes'
import { todayUtc } from '@/lib/organic-social/chart-notes/validate'

async function TrendSection({ clientSlug, dateRange, channel }: OrganicSocialCtx) {
  const r = await safe(getEngagementTrend(clientSlug, dateRange, channel))
  return r.data ? <EngagementTrend series={r.data} /> : <Fallback kind={r.error!} />
}

export const engagementTrendV1: PartImpl<OrganicSocialCtx> = {
  id: 'engagement-trend',
  version: 1,
  published: true,
  defaultLabel: 'Engagement Over Time',
  render: (ctx) => (
    <Suspense fallback={<TrendSkeleton />}>
      <TrendSection {...ctx} />
    </Suspense>
  ),
}


/** v2 = daily engagements over the UTC month, with the top days annotated, each with the
 *  post behind it. Same `graphPosts` read the follower graph makes, so one fetch serves both
 *  and neither freezes a window. A failed post read loses the thumbnails, never the chart.
 *  On Overview several platforms share one chart and a peak is ambiguous, so Overview gets no
 *  annotations and fetches no posts. Registered alongside v1 and UNPUBLISHED: pinned per
 *  client, never promoted or frozen; the section_templates rows and code templates pin v1. */
export async function TrendSectionV2({ clientSlug, dateRange, channel, role, email }: OrganicSocialCtx) {
  if (!channel) {
    const trend = await safe(getEngagementTrend(clientSlug, dateRange, null, 'utc'))
    return trend.data ? <EngagementTrend series={trend.data} /> : <Fallback kind={trend.error!} />
  }
  const [trend, posts] = await Promise.all([
    safe(getEngagementTrend(clientSlug, dateRange, channel, 'utc')),
    safe(graphPosts(clientSlug, dateRange, channel)),
  ])
  if (!trend.data) return <Fallback kind={trend.error!} />
  const { start, end } = isoRange(dateRange)
  const peaks = pickPeaks(trend.data, { limit: ANNOTATION_LIMIT.engagements, from: start, to: end })
  const built = buildAnnotations(peaks, posts.data ?? null, 'engagements')
  // Notes first, then hides over the merged list, so a hide still removes a day's note.
  const noted = await withNotes({
    clientSlug, channel, chart: 'engagements', role, email: email ?? null, series: trend.data,
    from: start, to: end, today: todayUtc(), items: built, posts: posts.data ?? null,
  })
  const { items, controls } = await withHides({ clientSlug, channel, chart: 'engagements', role, items: noted.items })
  // Jasmine's outline names this chart, word for word.
  return (
    <EngagementTrend
      series={trend.data}
      annotations={toChartAnnotations(items)}
      annotationControls={controls}
      noteControls={noted.controls}
      title={`${CHANNEL_LABEL[channel]} Engagement Graph`}
    />
  )
}

export const engagementTrendV2: PartImpl<OrganicSocialCtx> = {
  id: 'engagement-trend',
  version: 2,
  published: false,
  defaultLabel: 'Engagement Graph',
  render: (ctx) => (
    <Suspense fallback={<TrendSkeleton />}>
      <TrendSectionV2 {...ctx} />
    </Suspense>
  ),
}
