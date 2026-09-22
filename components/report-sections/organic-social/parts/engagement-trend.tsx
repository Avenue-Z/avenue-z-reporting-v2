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
export async function TrendSectionV2({ clientSlug, dateRange, channel }: OrganicSocialCtx) {
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
  const annotations = toChartAnnotations(buildAnnotations(peaks, posts.data ?? null, 'engagements'))
  // Jasmine's outline names this chart, word for word.
  return <EngagementTrend series={trend.data} annotations={annotations} title={`${CHANNEL_LABEL[channel]} Engagement Graph`} />
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
