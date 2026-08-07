import { DataTable } from '@/components/charts/data-table'
import { campaignTotals } from '@/lib/paid-search/campaigns'
import { num, pct } from '@/lib/paid-search/base'
import { money, costPerLead } from '@/lib/paid-media/format'
import type { CampaignRow } from '@/lib/paid-search/types'

const columns = [
  { key: 'campaign', label: 'Campaign', align: 'left' as const, sortable: true },
  { key: 'cost', label: 'Cost', align: 'right' as const, sortable: true, sortKey: '_cost' },
  { key: 'clicks', label: 'Clicks', align: 'right' as const, sortable: true, sortKey: '_clicks' },
  { key: 'impressions', label: 'Impressions', align: 'right' as const, sortable: true, sortKey: '_impressions' },
  { key: 'ctr', label: 'CTR', align: 'right' as const, sortable: true, sortKey: '_ctr' },
  { key: 'cpc', label: 'Avg. CPC', align: 'right' as const, sortable: true, sortKey: '_cpc' },
  { key: 'leads', label: 'Leads', align: 'right' as const, sortable: true, sortKey: '_leads' },
  { key: 'cpl', label: 'CPL', align: 'right' as const, sortable: true, sortKey: '_cpl' },
  { key: 'convRate', label: 'Conv Rate', align: 'right' as const, sortable: true, sortKey: '_convRate' },
]

function toTableRow(r: CampaignRow): Record<string, React.ReactNode> {
  return {
    campaign: r.campaign,
    cost: money(r.cost),
    clicks: num(r.clicks),
    impressions: num(r.impressions),
    ctr: pct(r.ctr),
    cpc: money(r.cpc),
    leads: num(r.leads),
    cpl: costPerLead(r.cost, r.leads),
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
    cost: money(totals.cost),
    clicks: num(totals.clicks),
    impressions: num(totals.impressions),
    ctr: pct(totals.impressions ? (totals.clicks / totals.impressions) * 100 : 0),
    cpc: money(totals.clicks ? totals.cost / totals.clicks : 0),
    leads: num(totals.leads),
    cpl: costPerLead(totals.cost, totals.leads),
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
