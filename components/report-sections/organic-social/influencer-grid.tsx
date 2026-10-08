'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { InfluencerCard } from './influencer-card'
import { SORT_METRICS, sortPosts, type SortDir, type SortKey } from '@/lib/organic-social/sort-content'
import type { TopContentPost } from '@/lib/organic-social/content-types'

/** The Influencer tab's cards: every influencer post of the period in a grid that wraps (two deck-style cards across
 *  on a wide screen, one column below that), sorted by the toolbar, no pager (Whitney, 10/6: "stack them down"). The toolbar
 *  is the one SortableTopContent draws, so the two tabs read the same. */
export function InfluencerGrid({ posts, clientSlug, canEdit, sortKeys }: {
  posts: TopContentPost[]; clientSlug: string; canEdit: boolean; sortKeys: readonly [SortKey, ...SortKey[]]
}) {
  const metrics = SORT_METRICS.filter((m) => sortKeys.includes(m.key))
  const [sortKey, setSortKey] = useState<SortKey>(metrics.some((m) => m.key === 'engagements') ? 'engagements' : metrics[0].key)
  const [dir, setDir] = useState<SortDir>('desc')
  if (posts.length === 0) return <p className="text-sm text-text-muted">No influencer posts for this period.</p>
  const onMetric = (key: SortKey) => {
    if (key === sortKey) setDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    else { setSortKey(key); setDir('desc') }
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Sort by</span>
        {metrics.map((m) => {
          const active = m.key === sortKey
          return (
            <button key={m.key} type="button" onClick={() => onMetric(m.key)} aria-pressed={active}
              className={cn('rounded-full border px-3 py-1 text-xs font-bold transition-colors',
                active ? 'border-white/20 bg-white/[0.06] text-white' : 'border-white/[0.08] text-text-muted hover:text-white')}>
              {m.label}{active ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
            </button>
          )
        })}
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {sortPosts(posts, sortKey, dir).map((p) => (
          <InfluencerCard key={p.id} post={p} clientSlug={clientSlug} canEdit={canEdit} sortKey={sortKey} />
        ))}
      </div>
    </div>
  )
}
