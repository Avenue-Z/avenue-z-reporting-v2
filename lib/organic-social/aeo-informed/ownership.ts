// lib/organic-social/aeo-informed/ownership.ts
// Which tracked brand owns a social URL. Peec attributes a source to a channel through the row's channel_title, and the views we mirror reproduce from
// that signal alone: a handle in the URL path adds rows Peec does not count (it pulled one point of the "used as a source" graph well away from what Peec
// draws). So a row is owned by the brand whose name starts the channel title at a word boundary, provided the brand registered a channel on that URL's
// platform. The longer name wins; a tie is no owner; a row with no title has no owner.
// Known limits: proven for the own brand on LinkedIn only. The title rule can over-match: an unrelated channel titled "<Brand> Something" is credited to
// the brand, for a competitor or for our own brand (it would be starred in the own table and counted in the graphs).
import type { PeecBrand, PeecSocialChannel } from './types'
import { peecPlatformOf } from './platform'

export type BrandChannels = { id: string; name: string; isOwn: boolean; platforms: string[] }
export type OwnedRow = { url: string; channelTitle: string | null }

export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim()
}

export function buildBrandChannels(brands: PeecBrand[], channels: PeecSocialChannel[]): BrandChannels[] {
  return brands.map((b) => ({
    id: b.id,
    name: b.name,
    isOwn: b.is_own,
    platforms: [...new Set(channels.filter((c) => c.brand_id === b.id).map((c) => c.platform.toLowerCase()))].sort(),
  }))
}

/** The brand id that owns this row, or null when none does or two brands tie. */
export function ownerOf(row: OwnedRow, brands: BrandChannels[]): string | null {
  const platform = peecPlatformOf(row.url)
  const title = row.channelTitle ? normalizeName(row.channelTitle) : ''
  if (platform === null || title === '') return null
  let best = 0
  let winners = new Set<string>()
  for (const b of brands) {
    if (!b.platforms.includes(platform)) continue
    const name = normalizeName(b.name)
    if (!name) continue
    if (title !== name && !title.startsWith(name + ' ')) continue
    if (name.length > best) { best = name.length; winners = new Set([b.id]) }
    else if (name.length === best) winners.add(b.id)
  }
  return winners.size === 1 ? [...winners][0] : null
}
