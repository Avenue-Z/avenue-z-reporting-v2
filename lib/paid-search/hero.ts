import { awQuery, isLeadAction } from './base'
import type { HeroPoint } from './types'
import type { PaidSearchConfig } from '@/lib/db/schema'

export function transformHero(
  metricWeekRows: Record<string, string>[],
  leadWeekRows: Record<string, string>[],
  cfg: PaidSearchConfig,
): HeroPoint[] {
  const leads = new Map<string, number>()
  for (const r of leadWeekRows) {
    if (!isLeadAction(r.ConversionTypeName, cfg)) continue
    leads.set(r.Yearweekiso, (leads.get(r.Yearweekiso) ?? 0) + Number(r.Conversions || 0))
  }
  return metricWeekRows
    .map((r): HeroPoint => ({
      // ISO "year|week", e.g. "2026|09" — sortable and carries the year so the
      // chart can render the week's Monday date (see hero.tsx weekLabel).
      week: r.Yearweekiso,
      cost: Number(r.Cost || 0),
      clicks: Number(r.Clicks || 0),
      impressions: Number(r.Impressions || 0),
      leads: leads.get(r.Yearweekiso) ?? 0,
    }))
    .sort((a, b) => a.week.localeCompare(b.week))
}

export async function getHeroSeries(slug: string, dateRange: string): Promise<HeroPoint[]> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const cfg = (await getClientBySlug(slug))!.paidSearchConfig!
  const [m, l] = await Promise.all([
    awQuery(slug, ['Yearweekiso', 'Cost', 'Clicks', 'Impressions'], dateRange),
    awQuery(slug, ['Yearweekiso', 'ConversionTypeName', 'Conversions'], dateRange),
  ])
  return transformHero(m, l, cfg)
}
