import { DataTable } from '@/components/charts/data-table'
import { usd, num, pct } from '@/lib/supermetrics/format'
import type { LinkedInCreativeRow } from '@/lib/linkedin/types'

const columns = [
  { key: 'ad', label: 'Ad Name', align: 'left' as const, sortable: true },
  { key: 'audience', label: 'Audience', align: 'left' as const, sortable: true },
  { key: 'campaign', label: 'Campaign', align: 'left' as const, sortable: true },
  { key: 'spend', label: 'Spend', align: 'right' as const, sortable: true, sortKey: '_spend' },
  { key: 'impressions', label: 'Impressions', align: 'right' as const, sortable: true, sortKey: '_impressions' },
  { key: 'clicks', label: 'Clicks', align: 'right' as const, sortable: true, sortKey: '_clicks' },
  { key: 'ctr', label: 'CTR', align: 'right' as const, sortable: true, sortKey: '_ctr' },
  { key: 'cpc', label: 'CPC', align: 'right' as const, sortable: true, sortKey: '_cpc' },
  { key: 'leads', label: 'Leads', align: 'right' as const, sortable: true, sortKey: '_leads' },
  { key: 'costPerLead', label: 'Cost / Lead', align: 'right' as const, sortable: true, sortKey: '_costPerLead' },
  { key: 'leadFormOpens', label: 'LF Opens', align: 'right' as const, sortable: true, sortKey: '_leadFormOpens' },
  { key: 'leadFormCompletionRate', label: 'LF Compl. Rate', align: 'right' as const, sortable: true, sortKey: '_leadFormCompletionRate' },
  { key: 'landingPageClicks', label: 'LP Clicks', align: 'right' as const, sortable: true, sortKey: '_landingPageClicks' },
  { key: 'shareOfSpend', label: 'Share of Spend', align: 'right' as const, sortable: true, sortKey: '_shareOfSpend' },
  { key: 'status', label: 'Status', align: 'left' as const, sortable: true },
]

export function LinkedInCreativeTable({ rows }: { rows: LinkedInCreativeRow[] }) {
  const tableRows = rows.map((r) => ({
    ad: r.ad, audience: r.audience, campaign: r.campaign, status: r.status,
    spend: usd(r.spend), impressions: num(r.impressions), clicks: num(r.clicks),
    ctr: pct(r.ctr), cpc: '$' + r.cpc.toFixed(2),
    leads: num(r.leads), costPerLead: '$' + r.costPerLead.toFixed(2),
    leadFormOpens: num(r.leadFormOpens), leadFormCompletionRate: pct(r.leadFormCompletionRate),
    landingPageClicks: num(r.landingPageClicks), shareOfSpend: pct(r.shareOfSpend),
    _spend: r.spend, _impressions: r.impressions, _clicks: r.clicks, _ctr: r.ctr, _cpc: r.cpc,
    _leads: r.leads, _costPerLead: r.costPerLead, _leadFormOpens: r.leadFormOpens,
    _leadFormCompletionRate: r.leadFormCompletionRate, _landingPageClicks: r.landingPageClicks,
    _shareOfSpend: r.shareOfSpend,
  }))
  return <DataTable columns={columns} rows={tableRows} defaultSort={{ key: 'spend', dir: 'desc' }} />
}
