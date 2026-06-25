'use client'

import { useState } from 'react'
import { DataTable } from '@/components/charts/data-table'
import { num } from '@/lib/supermetrics/format'
import { cn } from '@/lib/utils'
import type { PlatformTopContent, TopContentRow } from '@/lib/organic-social/types'

type SortBy = 'engagements' | 'views'

const VIEWS = [
  { key: 'engagements' as const, label: 'Top 5 by Engagement' },
  { key: 'views' as const, label: 'Top 5 by Views / Impressions' },
]

const columns = [
  { key: 'caption', label: 'Post' },
  { key: 'sourceType', label: 'Source Type' },
  { key: 'publishDate', label: 'Publish Date' },
  { key: 'views', label: 'Views / Impr.', align: 'right' as const, sortable: true, sortKey: 'viewsRaw' },
  { key: 'engagements', label: 'Engagements', align: 'right' as const, sortable: true, sortKey: 'engagementsRaw' },
]

function top5(rows: TopContentRow[], sortBy: SortBy) {
  return [...rows]
    .sort((a, b) => b[sortBy] - a[sortBy])
    .slice(0, 5)
    .map((r) => ({
      caption: r.url
        ? <a href={r.url} target="_blank" rel="noopener noreferrer" className="text-brand-cyan hover:underline">
            {r.caption.length > 80 ? r.caption.slice(0, 77) + '…' : r.caption}
          </a>
        : (r.caption.length > 80 ? r.caption.slice(0, 77) + '…' : r.caption),
      sourceType: r.sourceType === 'organic' ? 'Organic' : 'Influencer',
      publishDate: r.publishDate,
      views: num(r.views), viewsRaw: r.views,
      engagements: num(r.engagements), engagementsRaw: r.engagements,
    }))
}

export function TopContent({ groups }: { groups: PlatformTopContent[] }) {
  const [sortBy, setSortBy] = useState<SortBy>('engagements')

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">Top Content</h2>
        <div className="flex gap-2">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              onClick={() => setSortBy(v.key)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-bold transition-colors',
                sortBy === v.key
                  ? 'border-white/20 bg-white/[0.06] text-white'
                  : 'border-white/[0.08] text-text-muted hover:text-white',
              )}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>
      {groups.map((g) => (
        <div key={g.platform} className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">{g.platform}</h3>
          <DataTable columns={columns} rows={top5(g.rows, sortBy)} defaultSort={{ key: sortBy, dir: 'desc' }} />
        </div>
      ))}
    </section>
  )
}
