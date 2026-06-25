import { awQuery, isLeadAction } from './base'
import type { KeywordRow } from './types'
import type { PaidSearchConfig } from '@/lib/db/schema'

export function transformKeywords(metricRows: Record<string, string>[], leadRows: Record<string, string>[], cfg: PaidSearchConfig): KeywordRow[] {
  const leads = new Map<string, number>()
  for (const r of leadRows) {
    if (!isLeadAction(r.ConversionTypeName, cfg)) continue
    const k = `${r.Keyword}␟${r.Matchtype}`
    leads.set(k, (leads.get(k) ?? 0) + Number(r.Conversions || 0))
  }
  return metricRows
    .map((r): KeywordRow => {
      const clicks = Number(r.Clicks || 0), impressions = Number(r.Impressions || 0), cost = Number(r.Cost || 0)
      const l = leads.get(`${r.Keyword}␟${r.Matchtype}`) ?? 0
      return { keyword: r.Keyword, matchType: r.Matchtype, clicks, impressions, cost, leads: l, ctr: impressions ? +((clicks / impressions) * 100).toFixed(1) : 0, cpl: l ? Math.round(cost / l) : 0 }
    })
    .sort((a, b) => b.leads - a.leads || b.cost - a.cost)
}

export async function getKeywordRows(slug: string, dateRange: string): Promise<KeywordRow[]> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const cfg = (await getClientBySlug(slug))!.paidSearchConfig!
  const [m, l] = await Promise.all([
    awQuery(slug, ['Keyword', 'Matchtype', 'Clicks', 'Impressions', 'Cost'], dateRange),
    awQuery(slug, ['Keyword', 'Matchtype', 'ConversionTypeName', 'Conversions'], dateRange),
  ])
  // Surface the TOP keywords (sorted leads→cost desc), not the long tail.
  return transformKeywords(m, l, cfg).slice(0, 50)
}
