import { metaQuery, resolveCompareIso } from './base'
import type { MetaGeoRow } from './types'

const GEO_FIELDS = ['Region', 'cost', 'inline_link_clicks', 'landing_page_views', 'action_post_engagement']

export function transformMetaGeo(rows: Record<string, string>[]): MetaGeoRow[] {
  const num = (r: Record<string, string>, id: string) => Number(r[id] || 0)
  return rows
    .map((r): MetaGeoRow => ({
      region: r.Region,
      spend: num(r, 'cost'),
      linkClicks: num(r, 'inline_link_clicks'),
      lpv: num(r, 'landing_page_views'),
      engagements: num(r, 'action_post_engagement'),
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 15)
}

export interface MetaGeoData {
  rows: MetaGeoRow[]
  totalRegions: number
  prevTopRegionSpend: number | null
  prevTotalRegions: number | null
}

export async function getMetaGeoData(
  slug: string,
  dateRange: string,
  compareRange: string | null,
): Promise<MetaGeoData> {
  const compareIso = resolveCompareIso(dateRange, compareRange)
  const [cur, prev] = await Promise.all([
    metaQuery(slug, GEO_FIELDS, dateRange, { maxRows: 500 }),
    compareIso
      ? metaQuery(slug, GEO_FIELDS, compareIso, { maxRows: 500 })
      : Promise.resolve(null),
  ])

  const rows = transformMetaGeo(cur)
  const topRegion = rows[0]?.region ?? null

  let prevTopRegionSpend: number | null = null
  let prevTotalRegions: number | null = null
  if (prev) {
    prevTotalRegions = prev.length
    if (topRegion) {
      const match = prev.find((r) => r.Region === topRegion)
      prevTopRegionSpend = match ? Number(match.cost || 0) : 0
    }
  }

  return { rows, totalRegions: cur.length, prevTopRegionSpend, prevTotalRegions }
}
