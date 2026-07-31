'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { PostCard } from './post-card'
import { SORT_METRICS, sortPosts, type SortKey, type SortDir } from '@/lib/organic-social/sort-content'
import type { TopContentPost } from '@/lib/organic-social/content-types'

export type PlatformGroup = { platform: string; posts: TopContentPost[] }

/** Client wrapper for Top Content: a global metric sort toolbar + the per-platform card rows.
 *  One shared {sortKey, dir} drives every row and the Influencer section; the posts arrive
 *  uncapped and are sorted then capped here (sort-then-cap), so "sort by effectiveness" shows the
 *  true top-N by effectiveness rather than the fetch order reshuffled. */
export function SortableTopContent({
  owned,
  influencer,
  clientSlug,
  canEdit,
  perPlatform = 10,
}: {
  owned: PlatformGroup[]
  influencer: PlatformGroup[]
  clientSlug: string
  canEdit: boolean
  perPlatform?: number
}) {
  const [sortKey, setSortKey] = useState<SortKey>('engagements')
  const [dir, setDir] = useState<SortDir>('desc')

  // Click the active metric → flip direction; click another → switch to it, starting descending.
  const onMetric = (key: SortKey) => {
    if (key === sortKey) {
      setDir((d) => (d === 'desc' ? 'asc' : 'desc'))
    } else {
      setSortKey(key)
      setDir('desc')
    }
  }

  const rows = (groups: PlatformGroup[]) =>
    groups.map((g) => (
      <div key={g.platform} className="space-y-2">
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">{g.platform}</h4>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {/* Sort-then-cap: this is only the true top-N by the active metric because the fetch
              returns the COMPLETE per-platform set (see CONTENT_FETCH_LIMIT in top-content.ts).
              If that cap is ever hit the incoming list is fetch-order-truncated, so this slice
              would cap a truncated set — the fetch logs a warning if that happens. */}
          {sortPosts(g.posts, sortKey, dir)
            .slice(0, perPlatform)
            .map((p) => (
              <PostCard key={p.id} post={p} clientSlug={clientSlug} canEdit={canEdit} sortKey={sortKey} />
            ))}
        </div>
      </div>
    ))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Sort by</span>
        {SORT_METRICS.map((m) => {
          const active = m.key === sortKey
          return (
            <button
              key={m.key}
              type="button"
              onClick={() => onMetric(m.key)}
              aria-pressed={active}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-bold transition-colors',
                active
                  ? 'border-white/20 bg-white/[0.06] text-white'
                  : 'border-white/[0.08] text-text-muted hover:text-white',
              )}
            >
              {m.label}
              {active ? (dir === 'desc' ? ' ↓' : ' ↑') : ''}
            </button>
          )
        })}
      </div>

      <div className="space-y-5">{rows(owned)}</div>

      {influencer.length > 0 && (
        <section aria-label="Influencer posts" className="space-y-3">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-text-muted">Influencer Posts</h3>
          <div className="space-y-5">{rows(influencer)}</div>
        </section>
      )}
    </div>
  )
}
