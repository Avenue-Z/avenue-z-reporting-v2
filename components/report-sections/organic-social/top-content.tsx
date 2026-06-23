import { DataTable } from '@/components/charts/data-table'
import { num } from '@/lib/organic-social/base'
import type { TopContentRow } from '@/lib/organic-social/types'

export function TopContent({ rows }: { rows: TopContentRow[] }) {
  const columns = [
    { key: 'caption', label: 'Post' },
    { key: 'platform', label: 'Platform' },
    { key: 'sourceType', label: 'Source Type' },
    { key: 'publishDate', label: 'Publish Date' },
    { key: 'views', label: 'Views / Impr.', align: 'right' as const, sortable: true, sortKey: 'viewsRaw' },
    { key: 'engagements', label: 'Engagements', align: 'right' as const, sortable: true, sortKey: 'engagementsRaw' },
  ]
  const display = rows.map((r) => ({
    caption: r.caption.length > 80 ? r.caption.slice(0, 77) + '…' : r.caption,
    platform: r.platform,
    sourceType: r.sourceType === 'organic' ? 'Organic' : 'Influencer',
    publishDate: r.publishDate,
    views: num(r.views), viewsRaw: r.views,
    engagements: num(r.engagements), engagementsRaw: r.engagements,
  }))
  return (
    <section className="space-y-3">
      <h2 className="text-sm font-extrabold uppercase tracking-widest text-text-muted">Top Content</h2>
      <DataTable columns={columns} rows={display} defaultSort={{ key: 'engagements', dir: 'desc' }} />
    </section>
  )
}
