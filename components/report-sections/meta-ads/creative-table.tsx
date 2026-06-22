import { DataTable } from '@/components/charts/data-table'
import { usd, num, pct } from '@/lib/supermetrics/format'
import type { CreativeRow } from '@/lib/meta/types'

const columns = [
  { key: 'ad', label: 'Ad Name', align: 'left' as const, sortable: true },
  { key: 'campaign', label: 'Campaign', align: 'left' as const, sortable: true },
  { key: 'spend', label: 'Spend', align: 'right' as const, sortable: true, sortKey: '_spend' },
  { key: 'impressions', label: 'Impressions', align: 'right' as const, sortable: true, sortKey: '_impressions' },
  { key: 'reach', label: 'Reach', align: 'right' as const, sortable: true, sortKey: '_reach' },
  { key: 'frequency', label: 'Frequency', align: 'right' as const, sortable: true, sortKey: '_frequency' },
  { key: 'linkClicks', label: 'Link Clicks', align: 'right' as const, sortable: true, sortKey: '_linkClicks' },
  { key: 'ctr', label: 'CTR', align: 'right' as const, sortable: true, sortKey: '_ctr' },
  { key: 'cpc', label: 'CPC', align: 'right' as const, sortable: true, sortKey: '_cpc' },
  { key: 'lpv', label: 'LPV', align: 'right' as const, sortable: true, sortKey: '_lpv' },
  { key: 'costPerLpv', label: 'Cost / LPV', align: 'right' as const, sortable: true, sortKey: '_costPerLpv' },
  { key: 'engagements', label: 'Engagements', align: 'right' as const, sortable: true, sortKey: '_engagements' },
  { key: 'shareOfSpend', label: 'Share of Spend', align: 'right' as const, sortable: true, sortKey: '_shareOfSpend' },
  { key: 'status', label: 'Status', align: 'left' as const, sortable: true },
]

export function CreativeTable({ rows }: { rows: CreativeRow[] }) {
  const tableRows = rows.map((r) => ({
    ad: r.ad, campaign: r.campaign, status: r.status,
    spend: usd(r.spend), impressions: num(r.impressions), reach: num(r.reach),
    frequency: r.frequency.toFixed(1) + 'x', linkClicks: num(r.linkClicks),
    ctr: pct(r.ctr), cpc: '$' + r.cpc.toFixed(2), lpv: num(r.lpv), costPerLpv: usd(r.costPerLpv),
    engagements: num(r.engagements), shareOfSpend: pct(r.shareOfSpend),
    _spend: r.spend, _impressions: r.impressions, _reach: r.reach, _frequency: r.frequency,
    _linkClicks: r.linkClicks, _ctr: r.ctr, _cpc: r.cpc, _lpv: r.lpv, _costPerLpv: r.costPerLpv,
    _engagements: r.engagements, _shareOfSpend: r.shareOfSpend,
  }))
  return <DataTable columns={columns} rows={tableRows} defaultSort={{ key: 'spend', dir: 'desc' }} />
}
