import { linkedinQuery } from './base'
import type { LinkedInCreativeRow } from './types'

export interface LinkedInCreativeTotals {
  spend: number
  impressions: number
  clicks: number
  leads: number
  leadFormOpens: number
  landingPageClicks: number
}

export function creativeTotals(rows: LinkedInCreativeRow[]): LinkedInCreativeTotals {
  return rows.reduce(
    (t, r) => ({
      spend: t.spend + r.spend,
      impressions: t.impressions + r.impressions,
      clicks: t.clicks + r.clicks,
      leads: t.leads + r.leads,
      leadFormOpens: t.leadFormOpens + r.leadFormOpens,
      landingPageClicks: t.landingPageClicks + r.landingPageClicks,
    }),
    { spend: 0, impressions: 0, clicks: 0, leads: 0, leadFormOpens: 0, landingPageClicks: 0 },
  )
}

export function transformCreative(rows: Record<string, string>[]): LinkedInCreativeRow[] {
  const num = (r: Record<string, string>, id: string) => Number(r[id] || 0)
  const total = rows.reduce((s, r) => s + num(r, 'spend'), 0)
  return rows
    .map((r): LinkedInCreativeRow => {
      const spend = num(r, 'spend')
      return {
        ad: r.creativeDscName || r.creativeId || '—',
        audience: r.campaignName ?? '',       // audience segment (Brokers / HR / Broad B2B)
        campaign: r.campaignGroupName ?? '',  // funnel/objective grouping
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

export async function getCreativeRows(
  slug: string,
  dateRange: string,
): Promise<LinkedInCreativeRow[]> {
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
  return transformCreative(rows)
}
