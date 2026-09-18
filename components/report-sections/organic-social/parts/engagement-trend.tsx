import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getEngagementTrend } from '@/lib/organic-social/trends'
import { EngagementTrend } from '../trends'
import { TrendSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'
import { fetchTopContentFrozen } from '@/lib/organic-social/frozen'
import { toPostMarks } from '@/lib/organic-social/post-marks'

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


/** v2 = v1 plus a mark on every day content went live, and a control to hide them.
 *  Same frozen Top Content fetch the section already makes, so no extra request and a
 *  closed month's marks freeze with its numbers. A failed post fetch loses the marks,
 *  never the chart. Registered alongside v1; the code templates still pin v1. */
export async function TrendSectionV2({ clientSlug, dateRange, channel }: OrganicSocialCtx) {
  const [trend, posts] = await Promise.all([
    safe(getEngagementTrend(clientSlug, dateRange, channel)),
    safe(fetchTopContentFrozen(clientSlug, dateRange, channel)),
  ])
  if (!trend.data) return <Fallback kind={trend.error!} />
  return <EngagementTrend series={trend.data} marks={posts.data ? toPostMarks(posts.data) : undefined} />
}

export const engagementTrendV2: PartImpl<OrganicSocialCtx> = {
  id: 'engagement-trend',
  version: 2,
  published: true,
  defaultLabel: 'Engagement Over Time',
  render: (ctx) => (
    <Suspense fallback={<TrendSkeleton />}>
      <TrendSectionV2 {...ctx} />
    </Suspense>
  ),
}
