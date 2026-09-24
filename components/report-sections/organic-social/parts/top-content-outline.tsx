import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { fetchTopContentFrozen } from '@/lib/organic-social/frozen'
import { fetchTopContent } from '@/lib/organic-social/top-content'
import { canSetDesignation } from '@/lib/organic-social/designations/permissions'
import { getClientBySlug } from '@/lib/db/queries'
import { handleMatchesNoAuthor, missingAuthors, ownedPostLimit, parseOwnHandles, partitionByAuthor, withViewsBasisRate, type OwnHandles } from '@/lib/organic-social/outline-top-content'
import { SortableTopContent } from '../sortable-top-content'
import { TopContentSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'
import { groupPostsByPlatform, loadDesignations } from './top-content'

/** top-content@3: @2 plus the outline's rules (5 owned posts per platform row, collab by author,
 *  deck-basis Instagram rate, the outline's heading). Unpublished: pinned per client. */
export async function TopContentOutlineSection({ ctx, ownedLimit }: { ctx: OrganicSocialCtx; ownedLimit: number }) {
  const { clientSlug, dateRange, channel, role } = ctx
  const r = await safe(fetchTopContentFrozen(clientSlug, dateRange, channel, {
    fetchLive: (s, d, c) => fetchTopContent(s, d, c, { withAuthor: true, markUgc: true }),
  }))
  if (!r.data) return <Fallback kind={r.error!} />
  let own: OwnHandles = {}
  try { own = parseOwnHandles((await getClientBySlug(clientSlug))?.dashSocialConfig) } catch { own = {} }
  if (missingAuthors(r.data, own)) {
    console.warn(`[organic-social] top content has no post authors slug=${clientSlug} channel=${channel ?? 'ALL'}; collab rule fell back to #ad`)
  }
  if (handleMatchesNoAuthor(r.data, own)) {
    // Two different situations reach this line and the author names cannot tell them apart: the
    // stored handle is stale, or it is fine and nobody from the client posted in this window.
    // The log used to name only the first, which sends whoever reads it after the wrong thing.
    // Narrowing the rule cannot fix that (outline-top-content.test.ts proves it); validating the
    // handle when it is saved can, and is tracked in CLAUDE.md.
    console.warn(`[organic-social] own handle matches no post author slug=${clientSlug} channel=${channel ?? 'ALL'}; ` +
      `it is either stale or nobody from the client posted in this window; collab rule fell back to #ad`)
    own = {}
  }
  const posts = withViewsBasisRate(r.data)
  const stored = await loadDesignations(clientSlug, posts.map((p) => p.id))
  const { owned, influencer } = partitionByAuthor(posts, stored, own)
  return (
    <section className="space-y-6">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">Top Performing Content</h2>
      <SortableTopContent owned={groupPostsByPlatform(owned, channel)} influencer={groupPostsByPlatform(influencer, channel)}
        clientSlug={clientSlug} canEdit={canSetDesignation(role)} ownedLimit={ownedLimit} />
    </section>
  )
}

export const topContentV3: PartImpl<OrganicSocialCtx> = {
  id: 'top-content',
  version: 3,
  published: false,
  defaultLabel: 'Top Performing Posts',
  render: (ctx, resolved) => (
    <Suspense fallback={<TopContentSkeleton />}>
      <TopContentOutlineSection ctx={ctx} ownedLimit={ownedPostLimit(resolved.threshold)} />
    </Suspense>
  ),
}
