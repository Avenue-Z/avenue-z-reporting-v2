import { linkedinQuery } from './base'
import type {
  LinkedInCreativeRow,
  LinkedInCreativeMetrics,
  LinkedInCampaignNode,
  LinkedInCampaignGroupNode,
} from './types'

export function transformCreative(rows: Record<string, string>[]): LinkedInCreativeRow[] {
  const num = (r: Record<string, string>, id: string) => Number(r[id] || 0)
  const total = rows.reduce((s, r) => s + num(r, 'spend'), 0)
  return rows
    .map((r): LinkedInCreativeRow => {
      const spend = num(r, 'spend')
      return {
        ad: r.creativeDscName || r.creativeId || '—',
        campaign: r.campaignName ?? '',       // LinkedIn Campaign (audience segment)
        campaignGroup: r.campaignGroupName ?? '', // LinkedIn Campaign Group (funnel/objective)
        status: r.creativeStatus ?? '',
        spend,
        impressions: num(r, 'impressions'),
        clicks: num(r, 'clicks'),
        ctr: +(num(r, 'ctr') * 100).toFixed(2), // LinkedIn ctr is a 0-1 fraction
        cpc: +num(r, 'cpc').toFixed(2),
        leads: num(r, 'oneClickLeads'),
        costPerLead: +num(r, 'oneClickLeadsCost').toFixed(2),
        leadFormOpens: num(r, 'oneClickLeadFormOpens'),
        leadFormCompletionRate: +(num(r, 'leadFormCompletionRate') * 100).toFixed(1), // 0-1 fraction
        landingPageClicks: num(r, 'landingPageClicks'),
        shareOfSpend: total ? +((spend / total) * 100).toFixed(1) : 0,
      }
    })
    .sort((a, b) => b.spend - a.spend)
}

function aggregate(items: LinkedInCreativeMetrics[], grandTotalSpend: number): LinkedInCreativeMetrics {
  const spend = items.reduce((s, r) => s + r.spend, 0)
  const impressions = items.reduce((s, r) => s + r.impressions, 0)
  const clicks = items.reduce((s, r) => s + r.clicks, 0)
  const leads = items.reduce((s, r) => s + r.leads, 0)
  const leadFormOpens = items.reduce((s, r) => s + r.leadFormOpens, 0)
  const landingPageClicks = items.reduce((s, r) => s + r.landingPageClicks, 0)
  return {
    spend,
    impressions,
    clicks,
    leads,
    leadFormOpens,
    landingPageClicks,
    // Derived metrics are recomputed from the sums, never summed.
    ctr: impressions ? +((clicks / impressions) * 100).toFixed(2) : 0,
    cpc: clicks ? +(spend / clicks).toFixed(2) : 0,
    costPerLead: leads ? +(spend / leads).toFixed(2) : 0,
    leadFormCompletionRate: leadFormOpens ? +((leads / leadFormOpens) * 100).toFixed(1) : 0,
    shareOfSpend: grandTotalSpend ? +((spend / grandTotalSpend) * 100).toFixed(1) : 0,
  }
}

export function buildCreativeTree(rows: Record<string, string>[]): LinkedInCampaignGroupNode[] {
  const ads = transformCreative(rows)
  const grandTotalSpend = ads.reduce((s, r) => s + r.spend, 0)

  // Group by campaign group, then campaign (Map preserves insertion order).
  const byGroup = new Map<string, Map<string, LinkedInCreativeRow[]>>()
  for (const ad of ads) {
    const groupKey = ad.campaignGroup || '—'
    const campKey = ad.campaign || '—'
    if (!byGroup.has(groupKey)) byGroup.set(groupKey, new Map())
    const camps = byGroup.get(groupKey)!
    if (!camps.has(campKey)) camps.set(campKey, [])
    camps.get(campKey)!.push(ad)
  }

  const groups: LinkedInCampaignGroupNode[] = []
  for (const [groupName, camps] of byGroup) {
    const campaigns: LinkedInCampaignNode[] = []
    for (const [campName, campAds] of camps) {
      campaigns.push({ name: campName, ...aggregate(campAds, grandTotalSpend), ads: campAds })
    }
    const allAds = campaigns.flatMap((c) => c.ads)
    groups.push({ name: groupName, ...aggregate(allAds, grandTotalSpend), campaigns })
  }

  // Default ordering: spend desc at every level (the client re-sorts on demand).
  groups.sort((a, b) => b.spend - a.spend)
  for (const g of groups) {
    g.campaigns.sort((a, b) => b.spend - a.spend)
    for (const c of g.campaigns) c.ads.sort((a, b) => b.spend - a.spend)
  }
  return groups
}

export function creativeGrandTotals(groups: LinkedInCampaignGroupNode[]): LinkedInCreativeMetrics {
  const grandSpend = groups.reduce((s, g) => s + g.spend, 0)
  return aggregate(groups, grandSpend)
}

export async function getCreativeTree(
  slug: string,
  dateRange: string,
): Promise<LinkedInCampaignGroupNode[]> {
  const rows = await linkedinQuery(slug, [
    'creativeDscName',
    'campaignName',
    'campaignGroupName',
    'creativeStatus',
    'spend',
    'impressions',
    'clicks',
    'ctr',
    'cpc',
    'oneClickLeads',
    'oneClickLeadsCost',
    'oneClickLeadFormOpens',
    'leadFormCompletionRate',
    'landingPageClicks',
  ], dateRange, { maxRows: 200 })
  return buildCreativeTree(rows)
}
