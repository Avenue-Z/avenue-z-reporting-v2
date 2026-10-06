'use client'

import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { PostCard } from './post-card'
import { SORT_METRICS, sortPosts, paginate, type SortKey, type SortDir } from '@/lib/organic-social/sort-content'
import type { TopContentPost } from '@/lib/organic-social/content-types'
import { useExportMode } from '@/components/export/export-mode'

export type PlatformGroup = { platform: string; posts: TopContentPost[] }

/** One platform's card strip, paginated. Sort-then-paginate: posts arrive uncapped, are sorted by
 *  the active metric, then sliced to the current page — so page 1 is always the true top-`pageSize`
 *  and page 2 is the next `pageSize`, never a fetch-order reshuffle. Its own `page` state is reset
 *  to 0 by the parent remounting it (keyed on sortKey+dir) whenever the sort changes. */
function PlatformCardRow({
  platform, posts, sortKey, dir, pageSize, clientSlug, canEdit, limit,
}: {
  platform: string
  posts: TopContentPost[]
  sortKey: SortKey
  dir: SortDir
  pageSize: number
  clientSlug: string
  canEdit: boolean
  /** Show only the top `limit` by the active sort, as one page with no pager (outline tabs). */
  limit?: number
}) {
  const [page, setPage] = useState(0)
  const sorted = sortPosts(posts, sortKey, dir)
  const pg = limit ? paginate(sorted.slice(0, limit), 0, limit) : paginate(sorted, page, pageSize)

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
      <div className="flex gap-3 overflow-x-auto pb-2 print:flex-wrap print:overflow-visible">
        {pg.slice.map((p) => (
          <PostCard key={p.id} post={p} clientSlug={clientSlug} canEdit={canEdit} sortKey={sortKey} />
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
  ownedLimit,
  sortKeys,
  influencerHeading,
  hiddenInfluencer,
  heading,
}: {
  owned: PlatformGroup[]
  influencer: PlatformGroup[]
  clientSlug: string
  canEdit: boolean
  pageSize?: number
  /** Cap each owned platform row at its top N (no pager). Absent: today's paging. Influencer rows
   *  always page. */
  ownedLimit?: number
  /** Only these sort buttons, in toolbar order. Absent: all four, as today. The type rules out an empty list, so
   *  the toolbar is never empty and an outline tab can't silently get all four back. */
  sortKeys?: readonly [SortKey, ...SortKey[]]
  /** The Influencer section's heading and region name, set per client by top-content@3 (for example "Partnership Posts").
   *  Absent: today's text, so top-content@2 (Renaissance) renders exactly as before. */
  influencerHeading?: string
  /** Staff only (top-content@3 passes it only when the role may set designations): influencer rows on a platform the
   *  client hides on that channel, behind a closed control so the default view matches the client's, and so a post
   *  can still be marked Organic again. Absent or empty: no control, today's markup. */
  hiddenInfluencer?: PlatformGroup[]
  /** The section's title, drawn here only in the PDF export, inside the first row's block so it never ends a
   *  page alone (the part's own title is hidden there). The live page ignores it. */
  heading?: string
}) {
  const metrics = sortKeys ? SORT_METRICS.filter((m) => sortKeys.includes(m.key)) : SORT_METRICS
  const [sortKey, setSortKey] = useState<SortKey>(metrics.some((m) => m.key === 'engagements') ? 'engagements' : metrics[0].key)
  const [dir, setDir] = useState<SortDir>('desc')
  const exportMode = useExportMode()
  if (exportMode) {
    return <ExportTopContent owned={owned} influencer={influencer} clientSlug={clientSlug} pageSize={pageSize} ownedLimit={ownedLimit}
      sortKey={sortKey} sortLabel={metrics.find((m) => m.key === sortKey)!.label} influencerHeading={influencerHeading} heading={heading} />
  }

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
        limit={section === 'owned' ? ownedLimit : undefined}
      />
    ))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Sort by</span>
        {metrics.map((m) => {
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
        <section aria-label={influencerHeading || 'Influencer posts'} className="space-y-3">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{influencerHeading || 'Influencer Posts'}</h3>
          <div className="space-y-5">{rows(influencer, 'influencer')}</div>
        </section>
      )}

      {hiddenInfluencer && hiddenInfluencer.length > 0 && (
        <details className="space-y-3">
          <summary className="cursor-pointer text-xs font-bold text-text-muted hover:text-white">
            Show posts hidden from clients ({hiddenInfluencer.reduce((n, g) => n + g.posts.length, 0)})
          </summary>
          <section aria-label="Hidden from clients" className="space-y-5 pt-3">{rows(hiddenInfluencer, 'hidden')}</section>
        </details>
      )}
    </div>
  )
}

const ROW = 5
const chunk = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n))

/** Top Content as the PDF export prints it (spec 2026-10-06 §6): each platform's first page in the default
 *  sort, in rows of five cards, each row an unbreakable block. A platform's label rides in its first row's
 *  block, and the section's title and sort line in the very first one, so no title ends a page alone. No
 *  sort buttons, pager or staff-only rows. */
function ExportTopContent({ owned, influencer, clientSlug, pageSize, ownedLimit, sortKey, sortLabel, influencerHeading, heading }: {
  owned: PlatformGroup[]; influencer: PlatformGroup[]; clientSlug: string; pageSize: number; ownedLimit?: number
  sortKey: SortKey; sortLabel: string; influencerHeading?: string; heading?: string
}) {
  const blocks = (g: PlatformGroup, lead: ReactNode, limit: number | undefined, section: string) => {
    const sorted = sortPosts(g.posts, sortKey, 'desc')
    const shown = limit ? sorted.slice(0, limit) : paginate(sorted, 0, pageSize).slice
    const label = (
      <div className="flex items-center justify-between gap-3">
        <h4 className="text-xs font-bold uppercase tracking-wider text-text-muted">{g.platform}</h4>
        {shown.length < g.posts.length && <span className="text-[11px] tabular-nums text-text-muted">{shown.length} of {g.posts.length}</span>}
      </div>
    )
    const rows = chunk(shown, ROW)
    if (rows.length === 0) return [<div key={`${section}-${g.platform}`} data-export-block="" className="space-y-2">{lead}{label}</div>]
    return rows.map((row, i) => (
      <div key={`${section}-${g.platform}-${i}`} data-export-block="" className="space-y-2">
        {i === 0 && <>{lead}{label}</>}
        <div className="grid grid-cols-5 gap-3">
          {row.map((p) => <PostCard key={p.id} post={p} clientSlug={clientSlug} canEdit={false} sortKey={sortKey} />)}
        </div>
      </div>
    ))
  }
  const intro = (
    <>
      {heading && <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">{heading}</h2>}
      <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Sorted by {sortLabel} ↓</p>
    </>
  )
  const influencerTitle = <h3 className="text-xs font-extrabold uppercase tracking-widest text-text-muted">{influencerHeading || 'Influencer Posts'}</h3>
  return (
    <div className="space-y-5">
      {owned.flatMap((g, i) => blocks(g, i === 0 ? intro : null, ownedLimit, 'owned'))}
      {influencer.length > 0 && (
        <section aria-label={influencerHeading || 'Influencer posts'} className="space-y-5">
          {influencer.flatMap((g, i) => blocks(g, i === 0 ? <>{owned.length === 0 && intro}{influencerTitle}</> : null, undefined, 'influencer'))}
        </section>
      )}
    </div>
  )
}
