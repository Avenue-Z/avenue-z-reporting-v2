'use client'

import { InfluencerCard } from './influencer-card'
import { sortPosts, type SortKey } from '@/lib/organic-social/sort-content'
import { SortToolbar, useSort } from './sort-toolbar'
import type { TopContentPost } from '@/lib/organic-social/content-types'

/** The Influencer tab's cards: every influencer post of the period in a grid that wraps (two deck-style cards across
 *  on a wide screen, one column below that), sorted by the toolbar, no pager (Whitney, 10/6: "stack them down"). The toolbar
 *  is the one SortableTopContent draws, so the two tabs read the same. */
export function InfluencerGrid({ posts, clientSlug, canEdit, sortKeys }: {
  posts: TopContentPost[]; clientSlug: string; canEdit: boolean; sortKeys: readonly [SortKey, ...SortKey[]]
}) {
  const { metrics, sortKey, dir, onMetric } = useSort(sortKeys)
  if (posts.length === 0) return <p className="text-sm text-text-muted">No influencer posts for this period.</p>
  return (
    <div className="space-y-4">
      <SortToolbar metrics={metrics} sortKey={sortKey} dir={dir} onMetric={onMetric} />
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {sortPosts(posts, sortKey, dir).map((p) => (
          <InfluencerCard key={p.id} post={p} clientSlug={clientSlug} canEdit={canEdit} sortKey={sortKey} />
        ))}
      </div>
    </div>
  )
}
