'use client'

import { useState } from 'react'
import { cn } from '@/lib/utils'
import { PostCard } from './post-card'
import { SORT_METRICS, sortPosts, paginate, type SortKey, type SortDir } from '@/lib/organic-social/sort-content'
import type { TopContentPost } from '@/lib/organic-social/content-types'

export type PlatformGroup = { platform: string; posts: TopContentPost[] }

/** One platform's card strip, paginated. Sort-then-paginate: posts arrive uncapped, are sorted by
 *  the active metric, then sliced to the current page — so page 1 is always the true top-`pageSize`
 *  and page 2 is the next `pageSize`, never a fetch-order reshuffle. Its own `page` state is reset
 *  to 0 by the parent remounting it (keyed on sortKey+dir) whenever the sort changes. */
function PlatformCardRow({
  platform, posts, sortKey, dir, pageSize, clientSlug, canEdit, retrievals,
}: {
  platform: string
  posts: TopContentPost[]
  sortKey: SortKey
  dir: SortDir
  pageSize: number
  clientSlug: string
  canEdit: boolean
  retrievals: Map<number, number | null>
}) {
  const [page, setPage] = useState(0)
  const pg = paginate(sortPosts(posts, sortKey, dir), page, pageSize)

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">{platform}</h4>
        {pg.pageCount > 1 && (
          <div className="flex items-center gap-2 text-[11px] text-text-muted">
            <span className="tabular-nums">{pg.start + 1}–{pg.end} of {pg.total}</span>
            <button
              type="button"
              onClick={() => setPage((p) => p - 1)}
              disabled={pg.page === 0}
              aria-label="Previous posts"
              className="rounded-full border border-white/[0.08] px-2 py-0.5 font-bold transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-text-muted"
            >
              ‹ Prev
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => p + 1)}
              disabled={pg.page >= pg.pageCount - 1}
              aria-label="Next posts"
              className="rounded-full border border-white/[0.08] px-2 py-0.5 font-bold transition-colors hover:text-white disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:text-text-muted"
            >
              Next ›
            </button>
          </div>
        )}
      </div>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {pg.slice.map((p) => (
          <PostCard key={p.id} post={p} clientSlug={clientSlug} canEdit={canEdit} sortKey={sortKey} retrievals={retrievals.get(p.id) ?? null} />
        ))}
      </div>
    </div>
  )
}

/** Client wrapper for Top Content: a global metric sort toolbar + the per-platform card rows.
 *  One shared {sortKey, dir} drives every row and the Influencer section; posts arrive uncapped and
 *  each platform row sorts-then-paginates them (`pageSize` per page), so a full month of posts is
 *  reachable by paging rather than silently trimmed to a top-N. */
export function SortableTopContent({
  owned,
  influencer,
  clientSlug,
  canEdit,
  pageSize = 15,
  retrievals = new Map(),
}: {
  owned: PlatformGroup[]
  influencer: PlatformGroup[]
  clientSlug: string
  canEdit: boolean
  pageSize?: number
  retrievals?: Map<number, number | null>
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

  // key includes sortKey+dir so a sort change REMOUNTS each row, resetting its page to 0 — the new
  // "top" is shown from page 1, never mid-pagination of the previous ordering. `section` keeps the
  // owned and influencer rows for the same platform distinct.
  const rows = (groups: PlatformGroup[], section: string) =>
    groups.map((g) => (
      <PlatformCardRow
        key={`${section}-${g.platform}-${sortKey}-${dir}`}
        platform={g.platform}
        posts={g.posts}
        sortKey={sortKey}
        dir={dir}
        pageSize={pageSize}
        clientSlug={clientSlug}
        canEdit={canEdit}
        retrievals={retrievals}
      />
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

      <div className="space-y-5">{rows(owned, 'owned')}</div>

      {influencer.length > 0 && (
        <section aria-label="Influencer posts" className="space-y-3">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-text-muted">Influencer Posts</h3>
          <div className="space-y-5">{rows(influencer, 'influencer')}</div>
        </section>
      )}
    </div>
  )
}
