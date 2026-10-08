'use client'

import type { ReactNode } from 'react'
import { InfluencerCard } from './influencer-card'
import { sortPosts, type SortKey } from '@/lib/organic-social/sort-content'
import { SortToolbar, useSort } from './sort-toolbar'
import { useExportMode } from '@/components/export/export-mode'
import type { TopContentPost } from '@/lib/organic-social/content-types'

const EMPTY = 'No influencer posts for this period.'

/** The Influencer tab's cards: every influencer post of the period in a grid that wraps (two deck-style cards across
 *  on a wide screen, one column below that), sorted by the toolbar, no pager (Whitney, 10/6: "stack them down"). The toolbar
 *  is the one SortableTopContent draws, so the two tabs read the same. */
export function InfluencerGrid({ posts, clientSlug, canEdit, sortKeys, lead }: {
  posts: TopContentPost[]; clientSlug: string; canEdit: boolean; sortKeys: readonly [SortKey, ...SortKey[]]
  /** The section's heading and totals, drawn here only in the PDF export, inside the first block so they never end a
   *  page alone (the part hides its own copies there). The live page ignores it. */
  lead?: ReactNode
}) {
  const { metrics, sortKey, dir, onMetric } = useSort(sortKeys)
  const exportMode = useExportMode()
  if (exportMode) {
    return <ExportInfluencerGrid posts={posts} clientSlug={clientSlug} sortKey={sortKey} sortLabel={metrics.find((m) => m.key === sortKey)!.label} lead={lead} />
  }
  if (posts.length === 0) return <p className="text-sm text-text-muted">{EMPTY}</p>
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

const PDF_ROW = 2
const chunk = <T,>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, (i + 1) * n))

/** The grid as the PDF export prints it (as SortableTopContent's export form does): every post in the default sort,
 *  two cards across (the export page is narrower than the live two-across breakpoint), each row one unbreakable block,
 *  the lead and the sort line in the first. No buttons and no staff toggle. */
function ExportInfluencerGrid({ posts, clientSlug, sortKey, sortLabel, lead }: {
  posts: TopContentPost[]; clientSlug: string; sortKey: SortKey; sortLabel: string; lead?: ReactNode
}) {
  if (posts.length === 0) {
    return <div data-export-block="" className="space-y-4">{lead}<p className="text-sm text-text-muted">{EMPTY}</p></div>
  }
  return (
    <div className="space-y-4">
      {chunk(sortPosts(posts, sortKey, 'desc'), PDF_ROW).map((row, i) => (
        <div key={i} data-export-block="" className="space-y-4">
          {i === 0 && (
            <>
              {lead}
              <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Sorted by {sortLabel} ↓</p>
            </>
          )}
          <div className="grid grid-cols-2 gap-4">
            {row.map((p) => <InfluencerCard key={p.id} post={p} clientSlug={clientSlug} canEdit={false} sortKey={sortKey} />)}
          </div>
        </div>
      ))}
    </div>
  )
}
