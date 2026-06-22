import { metaQuery } from './base'
import type { CreativeRow } from './types'

export function transformCreative(rows: Record<string, string>[]): CreativeRow[] {
  const num = (r: Record<string, string>, id: string) => Number(r[id] || 0)
  const total = rows.reduce((s, r) => s + num(r, 'cost'), 0)
  return rows
    .map((r): CreativeRow => {
      const spend = num(r, 'cost')
      return {
        ad: r.ad_name,
        campaign: r.Campaignname,
        status: r.adstatus ?? '',
        spend,
        impressions: num(r, 'impressions'),
        reach: num(r, 'reach'),
        frequency: +num(r, 'Frequency').toFixed(1),
        linkClicks: num(r, 'inline_link_clicks'),
        ctr: +num(r, 'CTR').toFixed(1),
        cpc: +num(r, 'CPC').toFixed(2),
        lpv: num(r, 'landing_page_views'),
        costPerLpv: Math.round(num(r, 'cost_per_landing_page_view')),
        engagements: num(r, 'action_post_engagement'),
        shareOfSpend: total ? +((spend / total) * 100).toFixed(1) : 0,
      }
    })
    .sort((a, b) => b.spend - a.spend)
}

export async function getCreativeRows(
  slug: string,
  dateRange: string,
): Promise<CreativeRow[]> {
  const rows = await metaQuery(slug, [
    'ad_name',
    'Campaignname',
    'adstatus',
    'cost',
    'impressions',
    'reach',
    'Frequency',
    'inline_link_clicks',
    'CTR',
    'CPC',
    'landing_page_views',
    'cost_per_landing_page_view',
    'action_post_engagement',
  ], dateRange, { maxRows: 200 })
  return transformCreative(rows)
}
