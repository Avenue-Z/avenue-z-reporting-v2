import { Suspense } from 'react'
import type { PartImpl } from '@/lib/report-sections/types'
import { getClientBySlug } from '@/lib/db/queries'
import { fetchTopContentFrozen } from '@/lib/organic-social/frozen'
import { fetchTopContentFrozenWithAuthors } from '@/lib/organic-social/top-content-authors'
import { influencerLabel, parseInfluencerSection } from '@/lib/organic-social/influencer-section'
import { OUTLINE_SORT_KEYS, ownHandlesFor, partitionByAuthor, withViewsBasisRate } from '@/lib/organic-social/outline-top-content'
import { partitionPosts } from '@/lib/organic-social/designations/partition'
import { canSetDesignation } from '@/lib/organic-social/designations/permissions'
import { influencerTotals, withPublicViews } from '@/lib/organic-social/influencer-totals'
import { num } from '@/lib/supermetrics/format'
import { KpiCard } from '@/components/charts/kpi-card'
import { InfluencerGrid } from '../influencer-grid'
import { TopContentSkeleton } from '../skeletons'
import type { OrganicSocialCtx } from '../ctx'
import { safe, Fallback } from './shared'
import { loadDesignations } from './top-content'
import { splitRulesFor } from './split-rules'

const CHANNEL = 'INSTAGRAM' as const

/** The Influencer tab: Instagram's influencer posts, read with the exact call the client's Instagram tab makes
 *  (same request, same lock key, same frozen row) and split by the same rule (influencerRulesFor: 'outline', 'author' or
 *  'designations'), so a post is never Influencer here and Organic there. */
export async function InfluencerPostsSection({ ctx }: { ctx: OrganicSocialCtx }) {
  const { clientSlug, dateRange, role } = ctx
  let client: Awaited<ReturnType<typeof getClientBySlug>> = null
  try { client = await getClientBySlug(clientSlug) } catch { client = null }
  const rules = await splitRulesFor(client)
  const r = await safe(rules !== 'designations'
    ? fetchTopContentFrozenWithAuthors(clientSlug, dateRange, CHANNEL)
    : fetchTopContentFrozen(clientSlug, dateRange, CHANNEL))
  if (!r.data) return <Fallback kind={r.error!} />
  const stored = await loadDesignations(clientSlug, r.data.map((p) => p.id))
  // 'outline' rates on the deck basis before the split (top-content@3 does); 'author' leaves rates as top-content@2
  // shows them. Views: a co-authored or tagged post Dash gives no views shows its public views (spec 2026-10-09
  // section 5), applied after the split so the rate is still computed from Dash's views.
  const split = rules === 'designations'
    ? partitionPosts(r.data, stored)
    : partitionByAuthor(rules === 'outline' ? withViewsBasisRate(r.data) : r.data, stored,
      ownHandlesFor(r.data, client?.dashSocialConfig, clientSlug, CHANNEL, 'influencer'))
  const influencer = withPublicViews(split.influencer)
  // A client's Instagram label (influencerSection, "Partnership Posts" say) names this heading; the tab itself stays
  // "Influencer". Absent or invalid: the default heading, as the Instagram tab's section would show.
  const parsed = parseInfluencerSection(client?.dashSocialConfig?.influencerSection)
  const heading = (parsed.kind === 'ok' ? influencerLabel(parsed.section, CHANNEL) : undefined) ?? 'Influencer Posts'
  const totals = influencerTotals(influencer)
  const title = <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">{heading}</h2>
  const tiles = totals && (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
      <KpiCard title="Posts" value={num(totals.posts)} />
      <KpiCard title="Total Engagements" value={num(totals.engagements)} />
      <KpiCard title="Avg. Engagements per Post" value={num(totals.perPost)} />
      <KpiCard title="Total Views" value={totals.views == null ? '—' : num(totals.views)} subValue={totals.views == null ? 'Not reported for these posts' : undefined} />
    </div>
  )
  // In the PDF export the heading and totals ride in the grid's first block (`lead`), so they never end a page alone;
  // their standalone copies hide there.
  return (
    <section className="space-y-6">
      <h2 data-export-hide="" className="text-sm font-extrabold uppercase tracking-widest text-text-muted">{heading}</h2>
      {tiles && <div data-export-hide="">{tiles}</div>}
      <InfluencerGrid posts={influencer} clientSlug={clientSlug} canEdit={canSetDesignation(role)} sortKeys={OUTLINE_SORT_KEYS}
        lead={<>{title}{tiles}</>} />
    </section>
  )
}

export const influencerPostsV1: PartImpl<OrganicSocialCtx> = {
  id: 'influencer-posts',
  version: 1,
  published: true,
  defaultLabel: 'Influencer Posts',
  render: (ctx) => ctx.view !== 'influencer' ? null : (
    <Suspense fallback={<TopContentSkeleton />}>
      <InfluencerPostsSection ctx={ctx} />
    </Suspense>
  ),
}
