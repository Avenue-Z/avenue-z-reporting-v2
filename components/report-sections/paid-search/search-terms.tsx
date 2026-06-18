import { DataTable } from '@/components/charts/data-table'
import { usd, pct, num } from '@/lib/paid-search/base'
import type { SearchTermRow } from '@/lib/paid-search/types'

const COLUMNS = [
  {
    key: 'term',
    label: 'Search Term',
    align: 'left' as const,
  },
  {
    key: 'clicks',
    label: 'Clicks',
    align: 'right' as const,
    sortable: true,
    sortValue: (row: Record<string, React.ReactNode>) => row._clicks as number,
  },
  {
    key: 'impressions',
    label: 'Impressions',
    align: 'right' as const,
    sortable: true,
    sortValue: (row: Record<string, React.ReactNode>) => row._impressions as number,
  },
  {
    key: 'ctr',
    label: 'CTR',
    align: 'right' as const,
    sortable: true,
    sortValue: (row: Record<string, React.ReactNode>) => row._ctr as number,
  },
  {
    key: 'cost',
    label: 'Cost',
    align: 'right' as const,
    sortable: true,
    sortValue: (row: Record<string, React.ReactNode>) => row._cost as number,
  },
  {
    key: 'leads',
    label: 'Leads',
    align: 'right' as const,
    sortable: true,
    sortValue: (row: Record<string, React.ReactNode>) => row._leads as number,
  },
  {
    key: 'cpl',
    label: 'CPL',
    align: 'right' as const,
    sortable: true,
    sortValue: (row: Record<string, React.ReactNode>) => row._cpl as number,
  },
]

export function SearchTermsTable({ rows }: { rows: SearchTermRow[] }) {
  const tableRows = rows.map((r) => ({
    term: r.term,
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
