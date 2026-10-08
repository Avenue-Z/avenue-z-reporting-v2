import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { fetchTopContentFrozen } from '@/lib/organic-social/frozen'
import { fetchTopContent } from '@/lib/organic-social/top-content'
import { canSetDesignation } from '@/lib/organic-social/designations/permissions'
import { getClientBySlug } from '@/lib/db/queries'
import { hiddenInfluencerPlatforms, ignoredInfluencerKeys, influencerLabel, parseInfluencerSection } from '@/lib/organic-social/influencer-section'
import { OUTLINE_SORT_KEYS, ownHandlesFor, ownedPostLimit, partitionByAuthor, withViewsBasisRate } from '@/lib/organic-social/outline-top-content'
import { withoutTabbedInfluencer } from '@/lib/organic-social/influencer-tab'
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
  // One client read for every setting. A failed read keeps today's rules: no own handles, the default section, no tab.
  const client = await getClientBySlug(clientSlug).catch(() => null)
  const dsc: unknown = client?.dashSocialConfig
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
  const own = ownHandlesFor(r.data, dsc, clientSlug, channel)
  const posts = withViewsBasisRate(r.data)
  const stored = await loadDesignations(clientSlug, posts.map((p) => p.id))
  const { owned, influencer } = partitionByAuthor(posts, stored, own)
  const hidden = hiddenInfluencerPlatforms(section)
  const label = influencerLabel(section, channel)
  const canEdit = canSetDesignation(role)
  const influencerRows = groupPostsByPlatform(influencer, channel)
  // The Influencer tab shows Instagram's influencer posts; a client that has it does not also see them here
  // (spec B1: moved, not shown twice). The posts stay out of the owned five either way.
  const shownRows = withoutTabbedInfluencer(influencerRows, client)
  // A hidden platform's influencer row is never shown as a section, and its posts
  // stay influencer: they are not moved into the owned top 5. Staff get the row behind a closed control so a designation
  // can be undone; for anyone else it is filtered out here, on the server, so it never reaches a browser.
  const hiddenRows = canEdit ? influencerRows.filter((g) => hidden.has(g.platform)) : []
  return (
    <section className="space-y-6">
      {/* In the PDF export this title moves into the first row's block (SortableTopContent's heading). */}
      <div data-export-hide="" className="flex items-center gap-1.5"><h2 data-export-hide="" className="text-sm font-extrabold uppercase tracking-widest text-text-muted">Top Performing Content</h2><HoverHint text={TOP_POSTS_DEFINITION} /></div>
      <SortableTopContent heading="Top Performing Content" owned={groupPostsByPlatform(owned, channel)}
        influencer={shownRows.filter((g) => !hidden.has(g.platform))}
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
