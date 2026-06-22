import { awQuery, isLeadAction } from './base'
import type { GeoRow } from './types'
import type { PaidSearchConfig } from '@/lib/db/schema'

export function transformGeo(metricRows: Record<string, string>[], leadRows: Record<string, string>[], cfg: PaidSearchConfig): GeoRow[] {
  const leads = new Map<string, number>()
  for (const r of leadRows) {
    if (!isLeadAction(r.ConversionTypeName, cfg)) continue
    leads.set(r.Region, (leads.get(r.Region) ?? 0) + Number(r.Conversions || 0))
  }
  return metricRows
    .map((r): GeoRow => ({ region: r.Region, clicks: Number(r.Clicks || 0), cost: Number(r.Cost || 0), leads: leads.get(r.Region) ?? 0 }))
    .sort((a, b) => b.leads - a.leads)
}

export async function getGeoRows(slug: string, dateRange: string): Promise<GeoRow[]> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const cfg = (await getClientBySlug(slug))!.paidSearchConfig!
  const [m, l] = await Promise.all([
    awQuery(slug, ['Region', 'Clicks', 'Cost'], dateRange),
    awQuery(slug, ['Region', 'ConversionTypeName', 'Conversions'], dateRange),
  ])
  return transformGeo(m, l, cfg)
}
