import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { fetchTopContentFrozen } from '@/lib/organic-social/frozen'
import { fetchTopContent } from '@/lib/organic-social/top-content'
import { canSetDesignation } from '@/lib/organic-social/designations/permissions'
import { getClientBySlug } from '@/lib/db/queries'
import { hiddenInfluencerPlatforms, ignoredInfluencerKeys, influencerLabel, parseInfluencerSection } from '@/lib/organic-social/influencer-section'
import { OUTLINE_SORT_KEYS, handleMatchesNoAuthor, missingAuthors, ownedPostLimit, parseOwnHandles, partitionByAuthor, withViewsBasisRate, type OwnHandles } from '@/lib/organic-social/outline-top-content'
import { SortableTopContent } from '../sortable-top-content'
import { TopContentSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'
import { HoverHint } from '@/components/charts/hover-hint'
import { TOP_POSTS_DEFINITION } from '@/lib/organic-social/metric-definitions'
import { groupPostsByPlatform, loadDesignations } from './top-content'

/** top-content@3: @2 plus the outline's rules (5 owned posts per platform row, collab by author,
 *  deck-basis Instagram rate, the outline's heading). Unpublished: pinned per client. */
export async function TopContentOutlineSection({ ctx, ownedLimit }: { ctx: OrganicSocialCtx; ownedLimit: number }) {
  const { clientSlug, dateRange, channel, role } = ctx
  const r = await safe(fetchTopContentFrozen(clientSlug, dateRange, channel, {
    fetchLive: (s, d, c) => fetchTopContent(s, d, c, { withAuthor: true, markUgc: true }),
  }))
  if (!r.data) return <Fallback kind={r.error!} />
  // One client read for both settings. A failed read keeps today's rules: no own handles, the default section.
  let dsc: unknown
  let own: OwnHandles = {}
  try {
    dsc = (await getClientBySlug(clientSlug))?.dashSocialConfig
    own = parseOwnHandles(dsc)
  } catch { own = {} }
  const rawSection = (dsc as { influencerSection?: unknown } | null | undefined)?.influencerSection
  const parsed = parseInfluencerSection(rawSection)
  if (parsed.kind === 'invalid') console.warn(`[organic-social] influencerSection invalid slug=${clientSlug}; showing the default Influencer section`)
  if (parsed.kind === 'ok') {
    // Keys the parser skipped do nothing, by design; say so, so a miscased channel is not silent.
    const ignored = ignoredInfluencerKeys(rawSection)
    if (ignored.miscased.length > 0 || ignored.other > 0) {
      console.warn(`[organic-social] influencerSection ignored keys slug=${clientSlug} keys=${ignored.miscased.join(',') || 'none'} other=${ignored.other}`)
    }
  }
  const section = parsed.kind === 'ok' ? parsed.section : {}
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
  const hidden = hiddenInfluencerPlatforms(section)
  const label = influencerLabel(section, channel)
  const canEdit = canSetDesignation(role)
  const influencerRows = groupPostsByPlatform(influencer, channel)
  // A hidden platform's influencer row is never shown as a section, and its posts
  // stay influencer: they are not moved into the owned top 5. Staff get the row behind a closed control so a designation
  // can be undone; for anyone else it is filtered out here, on the server, so it never reaches a browser.
  const hiddenRows = canEdit ? influencerRows.filter((g) => hidden.has(g.platform)) : []
  return (
    <section className="space-y-6">
      <h2 className="flex items-center gap-1.5 text-sm font-extrabold uppercase tracking-widest text-text-muted">Top Performing Content<HoverHint text={TOP_POSTS_DEFINITION} /></h2>
      <SortableTopContent owned={groupPostsByPlatform(owned, channel)}
        influencer={influencerRows.filter((g) => !hidden.has(g.platform))}
        clientSlug={clientSlug} canEdit={canEdit} ownedLimit={ownedLimit} sortKeys={OUTLINE_SORT_KEYS}
        {...(label ? { influencerHeading: label } : {})}
        {...(hiddenRows.length > 0 ? { hiddenInfluencer: hiddenRows } : {})} />
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
