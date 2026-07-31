import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getFollowerGraph } from '@/lib/organic-social/followers'
import { FollowerGraph } from '../follower-graph'
import { TrendSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'

export async function FollowerSection({ clientSlug, dateRange, channel }: OrganicSocialCtx) {
  // Platform-only: never overlay every channel's follower count on one Overview chart.
  // validate.ts has no channel-scoping concept, so an admin extraParts override could
  // otherwise reach this part with channel=null (PR #174 review).
  if (!channel) return null
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
