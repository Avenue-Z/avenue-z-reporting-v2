import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getFollowerGraph } from '@/lib/organic-social/followers'
import { FollowerGraph } from '../follower-graph'
import { TrendSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'
import { graphPosts } from '@/lib/organic-social/graph-posts'
import { isoRange } from '@/lib/organic-social/base'
import { CHANNEL_LABEL } from '@/lib/organic-social/metrics'
import { pickPeaks, buildAnnotations, toChartAnnotations, ANNOTATION_LIMIT } from '@/lib/organic-social/annotations'
import { withHides } from './annotation-hides'

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


/** v2 plots followers GAINED per day over the UTC month and annotates the top days, each
 *  with the post behind it, the way the team's Follower Growth slides do. Total followers
 *  is a near-flat line with nothing to annotate.
 *
 *  The posts come from `graphPosts`, the React-cached read both graphs of a tab share, so
 *  this costs no extra request and never freezes a window itself. If that read fails the
 *  annotations still render, just without thumbnails: a missing picture is not a reason to
 *  lose the graph. Only the day, the value, the label and a thumbnail cross to the chart.
 *
 *  Registered alongside v1, never replacing it, and UNPUBLISHED: a client only sees this by
 *  pinning follower-graph@2 in its own report_section_config, and an unpublished version can
 *  never be promoted into the shared template or frozen into a composition. The
 *  section_templates rows and the code templates pin v1. */
export async function FollowerSectionV2({ clientSlug, dateRange, channel, role }: OrganicSocialCtx) {
  if (!channel) return null
  const [graph, posts] = await Promise.all([
    safe(getFollowerGraph(clientSlug, dateRange, channel, 'netNewFollowers', 'utc')),
    safe(graphPosts(clientSlug, dateRange, channel)),
  ])
  if (!graph.data) return <Fallback kind={graph.error!} />
  const { start, end } = isoRange(dateRange)
  const peaks = pickPeaks(graph.data, { limit: ANNOTATION_LIMIT.followers, from: start, to: end })
  const built = buildAnnotations(peaks, posts.data ?? null, 'followers')
  const { items, controls } = await withHides({ clientSlug, channel, chart: 'followers', role, items: built })
  // Jasmine's outline names this chart, word for word.
  return (
    <FollowerGraph
      series={graph.data}
      annotations={toChartAnnotations(items)}
      annotationControls={controls}
      title={`${CHANNEL_LABEL[channel]} Follower Growth Graph`}
    />
  )
}

export const followerGraphV2: PartImpl<OrganicSocialCtx> = {
  id: 'follower-graph',
  version: 2,
  published: false,
  defaultLabel: 'Follower Growth Graph',
  render: (ctx) => (
    <Suspense fallback={<TrendSkeleton />}>
      <FollowerSectionV2 {...ctx} />
    </Suspense>
  ),
}
