import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getTopContent } from '@/lib/organic-social/top-content'
import { fetchTopContentFrozenWithAuthors } from '@/lib/organic-social/top-content-authors'
import { fetchTopContentFrozen } from '@/lib/organic-social/frozen'
import { getDesignations } from '@/lib/organic-social/designations/select'
import { partitionPosts } from '@/lib/organic-social/designations/partition'
import { canSetDesignation } from '@/lib/organic-social/designations/permissions'
import { getClientBySlug } from '@/lib/db/queries'
import { withoutTabbedInfluencer } from '@/lib/organic-social/influencer-tab'
import { CHANNELS, CHANNEL_LABEL, type DashChannel } from '@/lib/organic-social/metrics'
import type { TopContentPost } from '@/lib/organic-social/content-types'
import type { SourceType } from '@/lib/organic-social/types'
import { TopContent } from '../top-content'
import { SortableTopContent } from '../sortable-top-content'
import { TopContentSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'
import { HoverHint } from '@/components/charts/hover-hint'
import { TOP_POSTS_DEFINITION } from '@/lib/organic-social/metric-definitions'
import { OUTLINE_SORT_KEYS, ownHandlesFor, partitionByAuthor } from '@/lib/organic-social/outline-top-content'
import { splitRulesFor } from './split-rules'

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

/** Group posts (creative preserved) by platform, ordered by the canonical channel order (or the
 *  single scoped channel). NOT capped here — the client sorts by the chosen metric first, then caps
 *  (sort-then-cap in SortableTopContent), so the top-N reflects the active sort, not the fetch order. */
export function groupPostsByPlatform(posts: TopContentPost[], channel: DashChannel | null) {
  const order = (channel ? [channel] : [...CHANNELS]).map((c) => CHANNEL_LABEL[c])
  const by = new Map<string, TopContentPost[]>()
  for (const p of posts) {
    if (!order.includes(p.platform)) continue
    const arr = by.get(p.platform) ?? []
    arr.push(p)
    by.set(p.platform, arr)
  }
  return order.filter((pl) => by.has(pl)).map((platform) => ({ platform, posts: by.get(platform)! }))
}

/** Best-effort designations: a designation-table/read failure (e.g. the migration hasn't been
 *  applied) degrades to "no stored designations" — every post falls to the #ad suggestion /
 *  organic — rather than blanking the whole section. Logged so a missed migration stays visible. */
export async function loadDesignations(clientSlug: string, postIds: number[]): Promise<Map<number, SourceType>> {
  try {
    const client = await getClientBySlug(clientSlug)
    return client ? await getDesignations(client.id, postIds) : new Map<number, SourceType>()
  } catch (e) {
    console.warn('[organic-social] getDesignations failed; rendering all-organic:', (e as Error).message)
    return new Map<number, SourceType>()
  }
}

/** top-content@2: the card gallery (owned + a separate Influencer section), backed by the
 *  snapshot-aware frozen fetch, split live by post_designations, or by author when the client has a saved Instagram handle
 *  (spec 2026-10-09 section 6). Its toolbar offers the two outline sorts, Engagements
 *  and Views, which the heading hint names (my call, 2026-10-07); sorting is in the browser only. Exported for the golden test,
 *  which awaits its resolved output directly (RTL does not render an async child's output). */
export async function TopContentV2Section({ clientSlug, dateRange, channel, role }: OrganicSocialCtx) {
  // The client is read before the fetch: the split follows the same rule the Influencer tab reads (splitRulesFor: the
  // platform layout's pin and a saved Instagram handle; spec 2026-10-09 section 6, Paul's #358 review), and the same row
  // answers the Influencer tab check below (spec B1). A failed read keeps today's request, split and gallery.
  const client = await getClientBySlug(clientSlug).catch(() => null)
  const dsc: unknown = client?.dashSocialConfig
  const byAuthor = (await splitRulesFor(client)) !== 'designations'
  const r = await safe(byAuthor
    ? fetchTopContentFrozenWithAuthors(clientSlug, dateRange, channel)
    : fetchTopContentFrozen(clientSlug, dateRange, channel))
  if (!r.data) return <Fallback kind={r.error!} />
  const posts = r.data
  const stored = await loadDesignations(clientSlug, posts.map((p) => p.id))
  const { owned, influencer } = byAuthor
    ? partitionByAuthor(posts, stored, ownHandlesFor(posts, dsc, clientSlug, channel))
    : partitionPosts(posts, stored)
  const canEdit = canSetDesignation(role)

  return (
    <section className="space-y-6">
      {/* In the PDF export this title moves into the first row's block (SortableTopContent's heading). */}
      <div data-export-hide="" className="flex items-center gap-1.5"><h2 data-export-hide="" className="text-sm font-extrabold uppercase tracking-widest text-text-muted">Top Content</h2><HoverHint text={TOP_POSTS_DEFINITION} /></div>
      <SortableTopContent
        heading="Top Content"
        owned={groupPostsByPlatform(owned, channel)}
        influencer={withoutTabbedInfluencer(groupPostsByPlatform(influencer, channel), client)}
        clientSlug={clientSlug}
        canEdit={canEdit}
        sortKeys={OUTLINE_SORT_KEYS}
      />
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
