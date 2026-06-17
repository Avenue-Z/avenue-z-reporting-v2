import { awQuery, isLeadAction } from './base'
import type { SearchTermRow } from './types'
import type { PaidSearchConfig } from '@/lib/db/schema'

export function transformSearchTerms(metricRows: Record<string, string>[], leadRows: Record<string, string>[], cfg: PaidSearchConfig): SearchTermRow[] {
  const leads = new Map<string, number>()
  for (const r of leadRows) {
    if (!isLeadAction(r.ConversionTypeName, cfg)) continue
    leads.set(r.Searchterm, (leads.get(r.Searchterm) ?? 0) + Number(r.Conversions || 0))
  }
  return metricRows
    .map((r): SearchTermRow => {
      const clicks = Number(r.Clicks || 0), impressions = Number(r.Impressions || 0), cost = Number(r.Cost || 0)
      const l = leads.get(r.Searchterm) ?? 0
      return { term: r.Searchterm, clicks, impressions, cost, leads: l, ctr: impressions ? +((clicks / impressions) * 100).toFixed(1) : 0, cpl: l ? Math.round(cost / l) : 0 }
    })
    .sort((a, b) => b.leads - a.leads || b.cost - a.cost)
}

export async function getSearchTermRows(slug: string, dateRange: string): Promise<SearchTermRow[]> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const cfg = (await getClientBySlug(slug))!.paidSearchConfig!
  const [m, l] = await Promise.all([
    awQuery(slug, ['Searchterm', 'Clicks', 'Impressions', 'Cost'], dateRange),
    awQuery(slug, ['Searchterm', 'ConversionTypeName', 'Conversions'], dateRange),
  ])
  return transformSearchTerms(m, l, cfg)
}
