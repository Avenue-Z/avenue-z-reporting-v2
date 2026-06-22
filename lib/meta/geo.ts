import { metaQuery } from './base'
import type { MetaGeoRow } from './types'

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

export async function getMetaGeoRows(slug: string, dateRange: string): Promise<MetaGeoRow[]> {
  const rows = await metaQuery(slug, ['Region', 'cost', 'inline_link_clicks', 'landing_page_views', 'action_post_engagement'], dateRange, { maxRows: 500 })
  return transformMetaGeo(rows)
}
