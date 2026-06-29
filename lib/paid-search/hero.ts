import { awQuery, isLeadAction, pickTimeField } from './base'
import type { HeroPoint } from './types'
import type { PaidSearchConfig } from '@/lib/db/schema'

export function transformHero(
  metricRows: Record<string, string>[],
  leadRows: Record<string, string>[],
  cfg: PaidSearchConfig,
  dateField: 'Date' | 'Yearweekiso',
): HeroPoint[] {
  const leads = new Map<string, number>()
  for (const r of leadRows) {
    if (!isLeadAction(r.ConversionTypeName, cfg)) continue
    leads.set(r[dateField], (leads.get(r[dateField]) ?? 0) + Number(r.Conversions || 0))
  }
  return metricRows
    .map((r): HeroPoint => ({
      // Daily "YYYY-MM-DD" or ISO weekly "year|week" (e.g. "2026|09") — both are
      // sortable as strings and carry the date the chart renders (hero.tsx bucketLabel).
      week: r[dateField],
      cost: Number(r.Cost || 0),
      clicks: Number(r.Clicks || 0),
      impressions: Number(r.Impressions || 0),
      leads: leads.get(r[dateField]) ?? 0,
    }))
    .sort((a, b) => a.week.localeCompare(b.week))
}

export async function getHeroSeries(slug: string, dateRange: string): Promise<HeroPoint[]> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const cfg = (await getClientBySlug(slug))!.paidSearchConfig!
  const field = pickTimeField(dateRange)
  const [m, l] = await Promise.all([
    awQuery(slug, [field, 'Cost', 'Clicks', 'Impressions'], dateRange),
    awQuery(slug, [field, 'ConversionTypeName', 'Conversions'], dateRange),
  ])
  return transformHero(m, l, cfg, field)
}
