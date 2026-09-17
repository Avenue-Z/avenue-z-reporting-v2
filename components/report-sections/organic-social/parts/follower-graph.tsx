import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getFollowerGraph } from '@/lib/organic-social/followers'
import { FollowerGraph } from '../follower-graph'
import { TrendSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'
import { fetchTopContentFrozen } from '@/lib/organic-social/frozen'
import { toPostMarks } from '@/lib/organic-social/post-marks'

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


/** v2 = v1 plus a mark on every day content went live, and a control to hide them.
 *
 *  The posts come from the SAME frozen Top Content fetch the section already makes, so
 *  this costs no extra request and a closed month's marks freeze with its numbers. If
 *  that fetch fails the chart still renders, just unmarked: a missing annotation is not
 *  a reason to lose the graph.
 *
 *  Registered alongside v1, never replacing it. A client only sees marks by pinning
 *  follower-graph@2 in its own report_section_config; the code templates still pin v1. */
export async function FollowerSectionV2({ clientSlug, dateRange, channel }: OrganicSocialCtx) {
  if (!channel) return null
  const [graph, posts] = await Promise.all([
    safe(getFollowerGraph(clientSlug, dateRange, channel)),
    safe(fetchTopContentFrozen(clientSlug, dateRange, channel)),
  ])
  if (!graph.data) return <Fallback kind={graph.error!} />
  return <FollowerGraph series={graph.data} marks={posts.data ? toPostMarks(posts.data) : undefined} />
}

export const followerGraphV2: PartImpl<OrganicSocialCtx> = {
  id: 'follower-graph',
  version: 2,
  published: true,
  defaultLabel: 'Followers',
  render: (ctx) => (
    <Suspense fallback={<TrendSkeleton />}>
      <FollowerSectionV2 {...ctx} />
    </Suspense>
  ),
}
