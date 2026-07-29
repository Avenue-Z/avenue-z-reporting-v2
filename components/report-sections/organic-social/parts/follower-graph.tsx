import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getFollowerGraph } from '@/lib/organic-social/followers'
import { FollowerGraph } from '../follower-graph'
import { TrendSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'

async function FollowerSection({ clientSlug, dateRange, channel }: OrganicSocialCtx) {
  const r = await safe(getFollowerGraph(clientSlug, dateRange, channel))
  return r.data ? <FollowerGraph series={r.data} /> : <Fallback kind={r.error!} />
}

export const followerGraphV1: PartImpl<OrganicSocialCtx> = {
  id: 'follower-graph',
  version: 1,
  published: true,
  defaultLabel: 'Followers',
  render: (ctx) => (
    <Suspense fallback={<TrendSkeleton />}>
      <FollowerSection {...ctx} />
    </Suspense>
  ),
}
