import { DataTable } from '@/components/charts/data-table'
import { usd, pct, num } from '@/lib/paid-search/base'
import type { KeywordRow } from '@/lib/paid-search/types'

const COLUMNS = [
  { key: 'keyword', label: 'Keyword', align: 'left' as const },
  { key: 'matchType', label: 'Match Type', align: 'left' as const },
  { key: 'clicks', label: 'Clicks', align: 'right' as const, sortable: true, sortKey: '_clicks' },
  { key: 'impressions', label: 'Impressions', align: 'right' as const, sortable: true, sortKey: '_impressions' },
  { key: 'ctr', label: 'CTR', align: 'right' as const, sortable: true, sortKey: '_ctr' },
  { key: 'cost', label: 'Cost', align: 'right' as const, sortable: true, sortKey: '_cost' },
  { key: 'leads', label: 'Leads', align: 'right' as const, sortable: true, sortKey: '_leads' },
  { key: 'cpl', label: 'CPL', align: 'right' as const, sortable: true, sortKey: '_cpl' },
]

export function KeywordsTable({ rows }: { rows: KeywordRow[] }) {
  const tableRows = rows.map((r) => ({
    keyword: r.keyword,
    matchType: r.matchType,
    clicks: num(r.clicks),
    impressions: num(r.impressions),
    ctr: pct(r.ctr),
    cost: usd(r.cost),
    leads: num(r.leads),
    cpl: usd(r.cpl),
    // raw numeric values for sort — prefixed with _ to avoid column key collision
    _clicks: r.clicks,
    _impressions: r.impressions,
    _ctr: r.ctr,
    _cost: r.cost,
    _leads: r.leads,
    _cpl: r.cpl,
  }))

  return (
    <DataTable
      columns={COLUMNS}
      rows={tableRows}
      defaultSort={{ key: 'leads', dir: 'desc' }}
    />
  )
}
