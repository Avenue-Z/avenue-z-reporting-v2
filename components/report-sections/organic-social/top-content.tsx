import { DataTable } from '@/components/charts/data-table'
import { num } from '@/lib/organic-social/base'
import type { PlatformTopContent, TopContentRow } from '@/lib/organic-social/types'

const columns = [
  { key: 'caption', label: 'Post' },
  { key: 'sourceType', label: 'Source Type' },
  { key: 'publishDate', label: 'Publish Date' },
  { key: 'views', label: 'Views / Impr.', align: 'right' as const, sortable: true, sortKey: 'viewsRaw' },
  { key: 'engagements', label: 'Engagements', align: 'right' as const, sortable: true, sortKey: 'engagementsRaw' },
]

function toDisplay(rows: TopContentRow[]) {
  return rows.map((r) => ({
    caption: r.caption.length > 80 ? r.caption.slice(0, 77) + '…' : r.caption,
    sourceType: r.sourceType === 'organic' ? 'Organic' : 'Influencer',
    publishDate: r.publishDate,
    views: num(r.views), viewsRaw: r.views,
    engagements: num(r.engagements), engagementsRaw: r.engagements,
  }))
}

export function TopContent({ groups }: { groups: PlatformTopContent[] }) {
  return (
    <section className="space-y-6">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">Top Content</h2>
      {groups.map((g) => (
        <div key={g.platform} className="space-y-3">
          <h3 className="text-xs font-bold uppercase tracking-wider text-text-muted">{g.platform}</h3>
          <DataTable columns={columns} rows={toDisplay(g.rows)} defaultSort={{ key: 'engagements', dir: 'desc' }} />
        </div>
      ))}
    </section>
  )
}
