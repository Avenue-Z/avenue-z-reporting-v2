import { awQuery, isLeadAction } from './base'
import type { GeoRegion } from './types'
import type { PaidSearchConfig } from '@/lib/db/schema'

export function transformGeo(metricRows: Record<string, string>[], leadRows: Record<string, string>[], cfg: PaidSearchConfig): GeoRegion[] {
  const leads = new Map<string, number>() // key: region␟dma
  for (const r of leadRows) {
    if (!isLeadAction(r.ConversionTypeName, cfg)) continue
    const k = `${r.Region || 'Unknown'}␟${r.Metroarea || '—'}`
    leads.set(k, (leads.get(k) ?? 0) + Number(r.Conversions || 0))
  }

  const regions = new Map<string, GeoRegion>()
  for (const r of metricRows) {
    const region = r.Region || 'Unknown'
    const dma = r.Metroarea || '—'
    const clicks = Number(r.Clicks || 0), cost = Number(r.Cost || 0)
    const l = leads.get(`${region}␟${dma}`) ?? 0
    let reg = regions.get(region)
    if (!reg) { reg = { region, clicks: 0, cost: 0, leads: 0, dmas: [] }; regions.set(region, reg) }
    reg.clicks += clicks; reg.cost += cost; reg.leads += l
    reg.dmas.push({ dma, clicks, cost, leads: l })
  }

  const out = [...regions.values()]
  for (const reg of out) reg.dmas.sort((a, b) => b.leads - a.leads || b.cost - a.cost)
  return out.sort((a, b) => b.leads - a.leads || b.cost - a.cost)
}

export async function getGeoRows(slug: string, dateRange: string): Promise<GeoRegion[]> {
  const { getClientBySlug } = await import('@/lib/db/queries')
  const cfg = (await getClientBySlug(slug))!.paidSearchConfig!
  const [m, l] = await Promise.all([
    awQuery(slug, ['Region', 'Metroarea', 'Clicks', 'Cost'], dateRange),
    awQuery(slug, ['Region', 'Metroarea', 'ConversionTypeName', 'Conversions'], dateRange),
  ])
  return transformGeo(m, l, cfg)
}
