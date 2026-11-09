// lib/organic-social/aeo-informed/ownership.ts
// Which tracked brand owns a social URL. Peec attributes a source to a channel through the row's channel_title, and the client's own PDF
// reproduces from that signal alone: a handle in the URL path adds rows Peec does not count (measured: it moved the first point of the
// "used as a source" graph from 3.1% to 3.4%, and the title rule alone gives 3.13%). So a row is owned by the brand whose name starts the
// channel title at a word boundary, provided the brand registered a channel on that URL's platform. The longer name wins, a tie is no owner.
// Proven for the own brand on LinkedIn. The title rule can over-match a competitor (a "Acme Cyber" channel for Acme).
import type { PeecBrand, PeecSocialChannel } from './types'
import { peecPlatformOf } from './platform'

export type BrandChannels = { id: string; name: string; isOwn: boolean; platforms: string[] }
export type OwnedRow = { url: string; channelTitle: string | null }

export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
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
