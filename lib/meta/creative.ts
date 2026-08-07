import { metaQuery } from './base'
import type { CreativeRow, CreativeMetrics, AdSetNode, CampaignNode } from './types'

export function transformCreative(rows: Record<string, string>[]): CreativeRow[] {
  const num = (r: Record<string, string>, id: string) => Number(r[id] || 0)
  const total = rows.reduce((s, r) => s + num(r, 'cost'), 0)
  return rows
    .map((r): CreativeRow => {
      const spend = num(r, 'cost')
      return {
        ad: r.ad_name,
        campaign: r.adcampaign_name,
        adSet: r.adset_name ?? '',
        status: r.adstatus ?? '',
        spend,
        impressions: num(r, 'impressions'),
        reach: num(r, 'reach'),
        frequency: +num(r, 'Frequency').toFixed(1),
        linkClicks: num(r, 'inline_link_clicks'),
        ctr: +(num(r, 'CTR') * 100).toFixed(1), // Meta CTR is a 0-1 fraction
        cpc: +num(r, 'CPC').toFixed(2),
        lpv: num(r, 'landing_page_views'),
        costPerLpv: +num(r, 'cost_per_landing_page_view').toFixed(2),
        engagements: num(r, 'action_post_engagement'),
        shareOfSpend: total ? +((spend / total) * 100).toFixed(1) : 0,
      }
    })
    .sort((a, b) => b.spend - a.spend)
}

function aggregate(items: CreativeMetrics[], grandTotalSpend: number): CreativeMetrics {
  const spend = items.reduce((s, r) => s + r.spend, 0)
  const impressions = items.reduce((s, r) => s + r.impressions, 0)
  const reach = items.reduce((s, r) => s + r.reach, 0)
  const linkClicks = items.reduce((s, r) => s + r.linkClicks, 0)
  const lpv = items.reduce((s, r) => s + r.lpv, 0)
  const engagements = items.reduce((s, r) => s + r.engagements, 0)
  return {
    spend,
    impressions,
    reach,
    linkClicks,
    lpv,
    engagements,
    // Derived metrics are recomputed from the sums, never summed.
    // CTR/CPC use link clicks to stay consistent with the Link Clicks column.
    frequency: reach ? +(impressions / reach).toFixed(1) : 0,
    ctr: impressions ? +((linkClicks / impressions) * 100).toFixed(1) : 0,
    cpc: linkClicks ? +(spend / linkClicks).toFixed(2) : 0,
    costPerLpv: lpv ? +(spend / lpv).toFixed(2) : 0,
    shareOfSpend: grandTotalSpend ? +((spend / grandTotalSpend) * 100).toFixed(1) : 0,
  }
}

export function buildCreativeTree(rows: Record<string, string>[]): CampaignNode[] {
  const ads = transformCreative(rows)
  const grandTotalSpend = ads.reduce((s, r) => s + r.spend, 0)

  // Group by campaign, then ad set (Map preserves insertion order).
  const byCampaign = new Map<string, Map<string, CreativeRow[]>>()
  for (const ad of ads) {
    const campKey = ad.campaign || '—'
    const setKey = ad.adSet || '—'
    if (!byCampaign.has(campKey)) byCampaign.set(campKey, new Map())
    const sets = byCampaign.get(campKey)!
    if (!sets.has(setKey)) sets.set(setKey, [])
    sets.get(setKey)!.push(ad)
  }

  const campaigns: CampaignNode[] = []
  for (const [campName, sets] of byCampaign) {
    const adSets: AdSetNode[] = []
    for (const [setName, setAds] of sets) {
      adSets.push({ name: setName, ...aggregate(setAds, grandTotalSpend), ads: setAds })
    }
    const allAds = adSets.flatMap((s) => s.ads)
    campaigns.push({ name: campName, ...aggregate(allAds, grandTotalSpend), adSets })
  }

  // Default ordering: spend desc at every level (the client re-sorts on demand).
  campaigns.sort((a, b) => b.spend - a.spend)
  for (const c of campaigns) {
    c.adSets.sort((a, b) => b.spend - a.spend)
    for (const s of c.adSets) s.ads.sort((a, b) => b.spend - a.spend)
  }
  return campaigns
}

export function creativeGrandTotals(campaigns: CampaignNode[]): CreativeMetrics {
  const grandSpend = campaigns.reduce((s, c) => s + c.spend, 0)
  return aggregate(campaigns, grandSpend)
}

export async function getCreativeTree(
  slug: string,
  dateRange: string,
): Promise<CampaignNode[]> {
  const rows = await metaQuery(slug, [
    'ad_name',
    'adcampaign_name',
    'adset_name',
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
  return buildCreativeTree(rows)
}
