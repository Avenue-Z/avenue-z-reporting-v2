import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getTopContent } from '@/lib/organic-social/top-content'
import { fetchTopContentFrozen } from '@/lib/organic-social/frozen'
import { getDesignations } from '@/lib/organic-social/designations/select'
import { partitionPosts } from '@/lib/organic-social/designations/partition'
import { canSetDesignation } from '@/lib/organic-social/designations/permissions'
import { getClientBySlug } from '@/lib/db/queries'
import { CHANNELS, CHANNEL_LABEL, type DashChannel } from '@/lib/organic-social/metrics'
import type { TopContentPost } from '@/lib/organic-social/content-types'
import type { SourceType } from '@/lib/organic-social/types'
import { TopContent } from '../top-content'
import { PostCard } from '../post-card'
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

/** Group posts (creative preserved) by platform for the card gallery, ordered by the canonical
 *  channel order (or the single scoped channel), capped per platform. */
function groupPostsByPlatform(posts: TopContentPost[], channel: DashChannel | null, perPlatform = 10) {
  const order = (channel ? [channel] : [...CHANNELS]).map((c) => CHANNEL_LABEL[c])
  const by = new Map<string, TopContentPost[]>()
  for (const p of posts) {
    if (!order.includes(p.platform)) continue
    const arr = by.get(p.platform) ?? []
    if (arr.length < perPlatform) arr.push(p)
    by.set(p.platform, arr)
  }
  return order.filter((pl) => by.has(pl)).map((platform) => ({ platform, posts: by.get(platform)! }))
}

function Gallery({ groups, clientSlug, canEdit }: {
  groups: { platform: string; posts: TopContentPost[] }[]; clientSlug: string; canEdit: boolean
}) {
  return (
    <div className="space-y-5">
      {groups.map((g) => (
        <div key={g.platform} className="space-y-2">
          <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">{g.platform}</h4>
          <div className="flex gap-3 overflow-x-auto pb-2">
            {g.posts.map((p) => (
              <PostCard key={p.id} post={p} clientSlug={clientSlug} canEdit={canEdit} />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/** top-content@2: the card gallery (owned + a separate Influencer section), backed by the
 *  snapshot-aware frozen fetch, split live by post_designations. Exported for the golden test,
 *  which awaits its resolved output directly (RTL does not render an async child's output). */
export async function TopContentV2Section({ clientSlug, dateRange, channel, role }: OrganicSocialCtx) {
  const r = await safe(fetchTopContentFrozen(clientSlug, dateRange, channel))
  if (!r.data) return <Fallback kind={r.error!} />
  const posts = r.data
  const client = await getClientBySlug(clientSlug)
  const stored = client
    ? await getDesignations(client.id, posts.map((p) => p.id))
    : new Map<number, SourceType>()
  const { owned, influencer } = partitionPosts(posts, stored)
  const canEdit = canSetDesignation(role)

  return (
    <section className="space-y-6">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">Top Content</h2>
      <Gallery groups={groupPostsByPlatform(owned, channel)} clientSlug={clientSlug} canEdit={canEdit} />
      {influencer.length > 0 && (
        <section aria-label="Influencer posts" className="space-y-3">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-text-muted">Influencer Posts</h3>
          <Gallery groups={groupPostsByPlatform(influencer, channel)} clientSlug={clientSlug} canEdit={canEdit} />
        </section>
      )}
    </section>
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
