import { awQuery, isLeadAction } from './base'
import type { CampaignRow } from './types'
import type { PaidSearchConfig } from '@/lib/db/schema'

export function transformCampaigns(
  metricRows: Record<string, string>[],
  leadRows: Record<string, string>[],
  cfg: PaidSearchConfig,
): CampaignRow[] {
  const leadsByCampaign = new Map<string, number>()
  for (const r of leadRows) {
    if (!isLeadAction(r.ConversionTypeName, cfg)) continue
    const k = r.Campaignname
    leadsByCampaign.set(k, (leadsByCampaign.get(k) ?? 0) + Number(r.Conversions || 0))
  }
  const rows = metricRows.map((r): CampaignRow => {
    const cost = Number(r.Cost || 0)
    const clicks = Number(r.Clicks || 0)
    const impressions = Number(r.Impressions || 0)
    const leads = leadsByCampaign.get(r.Campaignname) ?? 0
    return {
      campaign: r.Campaignname,
      cost, clicks, impressions,
      ctr: impressions ? (clicks / impressions) * 100 : 0,
      cpc: clicks ? cost / clicks : 0,
      leads,
      cpl: leads ? Math.round(cost / leads) : 0,
      convRate: clicks ? (leads / clicks) * 100 : 0,
    }
  })
  return rows.sort((a, b) => b.cost - a.cost)
}

export function campaignTotals(rows: CampaignRow[]) {
  return rows.reduce(
    (t, r) => ({ cost: t.cost + r.cost, clicks: t.clicks + r.clicks, impressions: t.impressions + r.impressions, leads: t.leads + r.leads }),
    { cost: 0, clicks: 0, impressions: 0, leads: 0 },
  )
}

export async function getCampaignRows(slug: string, dateRange: string): Promise<CampaignRow[]> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const cfg = (await getClientBySlug(slug))!.paidSearchConfig!
  const [metricRows, leadRows] = await Promise.all([
    awQuery(slug, ['Campaignname', 'Cost', 'Clicks', 'Impressions'], dateRange),
    awQuery(slug, ['Campaignname', 'ConversionTypeName', 'Conversions'], dateRange),
  ])
  return transformCampaigns(metricRows, leadRows, cfg)
}
