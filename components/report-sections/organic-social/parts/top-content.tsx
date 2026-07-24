import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getTopContent, fetchTopContent, toTopContentRows, groupByPlatform } from '@/lib/organic-social/top-content'
import { getDesignations } from '@/lib/organic-social/designations/select'
import { partitionPosts } from '@/lib/organic-social/designations/partition'
import { canSetDesignation } from '@/lib/organic-social/designations/permissions'
import { getClientBySlug } from '@/lib/db/queries'
import { CHANNELS, type DashChannel } from '@/lib/organic-social/metrics'
import type { TopContentPost } from '@/lib/organic-social/content-types'
import type { SourceType } from '@/lib/organic-social/types'
import { TopContent } from '../top-content'
import { TopContentSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'

async function TopContentSection({ clientSlug, dateRange, channel }: OrganicSocialCtx) {
  const r = await safe(getTopContent(clientSlug, dateRange, channel))
  return r.data ? <TopContent groups={r.data} /> : <Fallback kind={r.error!} />
}

export const topContentV1: PartImpl<OrganicSocialCtx> = {
  id: 'top-content',
  version: 1,
  published: true,
  defaultLabel: 'Top Performing Posts',
  render: (ctx) => (
    <Suspense fallback={<TopContentSkeleton />}>
      <TopContentSection {...ctx} />
    </Suspense>
  ),
}

/** Group a bucket into the interim table shape. `allowed` is the static canonical channel
 *  order (or the single scoped channel) — the posts already come only from the client's
 *  configured channels, so no DB lookup is needed here just to order/label platforms. */
function groupBucket(posts: TopContentPost[], channel: DashChannel | null) {
  const allowed = channel ? [channel] : [...CHANNELS]
  return groupByPlatform(toTopContentRows(posts), 25, allowed)
}

/** top-content@2: the owned ranking plus a separate Influencer section below it, split live
 *  by post_designations (stored row → #ad suggestion → organic). Exported for the golden test,
 *  which awaits its resolved output directly (RTL does not render an async child's output). */
export async function TopContentV2Section({ clientSlug, dateRange, channel, role }: OrganicSocialCtx) {
  const r = await safe(fetchTopContent(clientSlug, dateRange, channel))
  if (!r.data) return <Fallback kind={r.error!} />
  const posts = r.data
  const client = await getClientBySlug(clientSlug)
  const stored = client
    ? await getDesignations(client.id, posts.map((p) => p.id))
    : new Map<number, SourceType>()
  const { owned, influencer } = partitionPosts(posts, stored)
  const canEdit = canSetDesignation(role)

  return (
    <div className="space-y-8">
      <TopContent groups={groupBucket(owned, channel)} canEdit={canEdit} clientSlug={clientSlug} />
      {influencer.length > 0 && (
        <section aria-label="Influencer posts" className="space-y-3">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-text-muted">Influencer Posts</h3>
          <TopContent groups={groupBucket(influencer, channel)} canEdit={canEdit} clientSlug={clientSlug} />
        </section>
      )}
    </div>
  )
}

export const topContentV2: PartImpl<OrganicSocialCtx> = {
  id: 'top-content',
  version: 2,
  published: true,
  defaultLabel: 'Top Performing Posts',
  render: (ctx) => (
    <Suspense fallback={<TopContentSkeleton />}>
      <TopContentV2Section {...ctx} />
    </Suspense>
  ),
}
