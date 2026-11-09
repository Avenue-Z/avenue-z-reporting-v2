// lib/organic-social/aeo-informed/ownership.ts
// Which tracked brand owns a social URL. Peec has no channel id on URL rows and no "your channels" filter, so we match.
// Rule, measured against the client's own PDF (docs: section 9): a registered handle in the URL path is the precise signal and wins;
// otherwise the channel title starting with the brand name at a word boundary. LinkedIn /pulse/ articles carry no handle, so they need the title.
// Proven on LinkedIn for the own brand only; the title rule can over-match (for example "MetLife Gulf" for MetLife).
import type { PeecBrand, PeecSocialChannel } from './types'

export type BrandChannels = { id: string; name: string; isOwn: boolean; slugs: string[] }
export type OwnedRow = { url: string; channelTitle: string | null }

const MIN_SLUG = 4

export function normalizeName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()
}

/** '@RenBenefits' becomes 'renbenefits'; 'company/foo' becomes 'foo'. */
export function handleSlug(handle: string): string {
  return handle.trim().toLowerCase().replace(/^@/, '').replace(/^(company|in|user|channel|c)\//, '')
}

export function buildBrandChannels(brands: PeecBrand[], channels: PeecSocialChannel[]): BrandChannels[] {
  return brands.map((b) => ({
    id: b.id,
    name: b.name,
    isOwn: b.is_own,
    slugs: channels.filter((c) => c.brand_id === b.id).map((c) => handleSlug(c.channel_handle)).filter((s) => s.length > 0),
  }))
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function pathOf(url: string): string {
  try {
    return new URL(url).pathname.toLowerCase()
  } catch {
    return url.toLowerCase()
  }
}

/** The brand id that owns this row, or null when none does or two brands tie. */
export function ownerOf(row: OwnedRow, brands: BrandChannels[]): string | null {
  const path = pathOf(row.url)

  // 1) A registered handle in the path. The handle must start a path segment (or follow an @) and must not run into a longer word.
  let best = 0
  let winners = new Set<string>()
  for (const b of brands) {
    for (const slug of b.slugs) {
      if (slug.length < MIN_SLUG) continue
      if (!new RegExp(`(?:^|[/@])${escape(slug)}(?![a-z0-9])`).test(path)) continue
      if (slug.length > best) { best = slug.length; winners = new Set([b.id]) }
      else if (slug.length === best) winners.add(b.id)
    }
  }
  if (winners.size === 1) return [...winners][0]
  if (winners.size > 1) return null

  // 2) The channel title starts with the brand name at a word boundary. The longer name wins.
  const title = row.channelTitle ? normalizeName(row.channelTitle) : ''
  if (!title) return null
  best = 0
  winners = new Set()
  for (const b of brands) {
    const name = normalizeName(b.name)
    if (!name) continue
    if (title !== name && !title.startsWith(name + ' ')) continue
    if (name.length > best) { best = name.length; winners = new Set([b.id]) }
    else if (name.length === best) winners.add(b.id)
  }
  return winners.size === 1 ? [...winners][0] : null
}
