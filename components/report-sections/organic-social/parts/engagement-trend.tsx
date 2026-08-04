import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getEngagementTrend } from '@/lib/organic-social/trends'
import { EngagementTrend } from '../trends'
import { TrendSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'

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
