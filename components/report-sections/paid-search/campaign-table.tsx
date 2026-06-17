import { DataTable } from '@/components/charts/data-table'
import { campaignTotals } from '@/lib/paid-search/campaigns'
import { usd, num, pct } from '@/lib/paid-search/base'
import type { CampaignRow } from '@/lib/paid-search/types'

const columns = [
  {
    key: 'campaign',
    label: 'Campaign',
    align: 'left' as const,
    sortable: true,
    sortValue: (row: Record<string, React.ReactNode>) => String(row.campaign ?? ''),
  },
  {
    key: 'cost',
    label: 'Cost',
    align: 'right' as const,
    sortable: true,
    sortValue: (row: Record<string, React.ReactNode>) => Number(row._cost ?? 0),
  },
  {
    key: 'clicks',
    label: 'Clicks',
    align: 'right' as const,
    sortable: true,
    sortValue: (row: Record<string, React.ReactNode>) => Number(row._clicks ?? 0),
  },
  {
    key: 'impressions',
    label: 'Impressions',
    align: 'right' as const,
    sortable: true,
    sortValue: (row: Record<string, React.ReactNode>) => Number(row._impressions ?? 0),
  },
  {
    key: 'ctr',
    label: 'CTR',
    align: 'right' as const,
    sortable: true,
    sortValue: (row: Record<string, React.ReactNode>) => Number(row._ctr ?? 0),
  },
  {
    key: 'cpc',
    label: 'Avg. CPC',
    align: 'right' as const,
    sortable: true,
    sortValue: (row: Record<string, React.ReactNode>) => Number(row._cpc ?? 0),
  },
  {
    key: 'leads',
    label: 'Leads',
    align: 'right' as const,
    sortable: true,
    sortValue: (row: Record<string, React.ReactNode>) => Number(row._leads ?? 0),
  },
  {
    key: 'cpl',
    label: 'CPL',
    align: 'right' as const,
    sortable: true,
    sortValue: (row: Record<string, React.ReactNode>) => Number(row._cpl ?? 0),
  },
  {
    key: 'convRate',
    label: 'Conv Rate',
    align: 'right' as const,
    sortable: true,
    sortValue: (row: Record<string, React.ReactNode>) => Number(row._convRate ?? 0),
  },
]

function toTableRow(r: CampaignRow): Record<string, React.ReactNode> {
  return {
    campaign: r.campaign,
    cost: usd(r.cost),
    clicks: num(r.clicks),
    impressions: num(r.impressions),
    ctr: pct(r.ctr),
    cpc: usd(r.cpc),
    leads: num(r.leads),
    cpl: usd(r.cpl),
    convRate: pct(r.convRate),
    // raw numeric shadow fields for sortValue
    _cost: r.cost,
    _clicks: r.clicks,
    _impressions: r.impressions,
    _ctr: r.ctr,
    _cpc: r.cpc,
    _leads: r.leads,
    _cpl: r.cpl,
    _convRate: r.convRate,
  }
}

export function CampaignTable({ rows }: { rows: CampaignRow[] }) {
  const totals = campaignTotals(rows)
  const totalsRow: Record<string, React.ReactNode> = {
    campaign: 'Total',
    cost: usd(totals.cost),
    clicks: num(totals.clicks),
    impressions: num(totals.impressions),
    ctr: pct(totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0),
    cpc: usd(totals.clicks ? totals.cost / totals.clicks : 0),
    leads: num(totals.leads),
    cpl: usd(totals.leads ? Math.round(totals.cost / totals.leads) : 0),
    convRate: pct(totals.clicks ? (totals.leads / totals.clicks) * 100 : 0),
  }

  return (
    <DataTable
      columns={columns}
      rows={rows.map(toTableRow)}
      defaultSort={{ key: 'cost', dir: 'desc' }}
      totalsRow={totalsRow}
    />
  )
}
