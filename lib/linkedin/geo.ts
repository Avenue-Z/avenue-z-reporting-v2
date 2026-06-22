import { linkedinQuery } from './base'
import type { LinkedInGeoRow } from './types'

export function transformLinkedInGeo(rows: Record<string, string>[]): LinkedInGeoRow[] {
  const num = (r: Record<string, string>, id: string) => Number(r[id] || 0)
  return rows
    .map((r): LinkedInGeoRow => ({
      region: r.memberRegion,
      spend: num(r, 'spend'),
      impressions: num(r, 'impressions'),
      clicks: num(r, 'clicks'),
      leads: num(r, 'oneClickLeads'),
    }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 15)
}

export async function getLinkedInGeoRows(slug: string, dateRange: string): Promise<LinkedInGeoRow[]> {
  const rows = await linkedinQuery(slug, ['memberRegion', 'spend', 'impressions', 'clicks', 'oneClickLeads'], dateRange, { maxRows: 500 })
  return transformLinkedInGeo(rows)
}
