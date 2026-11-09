// lib/organic-social/aeo-informed/tables.ts
// The three tables in the outline, built from per-URL sums. Percentages are fractions 0..1. A delta is null when the URL has no row in the prior window.
import type { UrlAgg } from './types'
import { citationPosition } from './urls'
import { ownerOf, type BrandChannels } from './ownership'

export type SocialsRow = {
  rank: number
  url: string
  title: string | null
  channelTitle: string | null
  ownerBrandId: string | null
  isOwnChannel: boolean
  urlType: string | null
  domainType: string
  ownBrandMentioned: boolean
  mentionedBrandCount: number
  mentionedBrandNames: string | null
  retrievals: number
  retrievalsDelta: number | null
  retrievedPct: number
  retrievedPctDelta: number | null
  totalCitations: number
  totalCitationsDelta: number | null
}

export type GapRow = {
  rank: number
  url: string
  title: string | null
  channelTitle: string | null
  urlType: string | null
  domainType: string
  mentionedBrandCount: number
  mentionedBrandNames: string | null
  citationShare: number
  citationPosition: number | null
  retrievals: number
  retrievalsDelta: number | null
  totalCitations: number
  totalCitationsDelta: number | null
}

const URL_TYPES: Record<string, string> = {
  HOMEPAGE: 'Homepage', CATEGORY_PAGE: 'Category page', PRODUCT_PAGE: 'Product page', LISTICLE: 'Listicle', COMPARISON: 'Comparison',
  PROFILE: 'Profile', ALTERNATIVE: 'Alternative', DISCUSSION: 'Discussion', HOW_TO_GUIDE: 'How-To Guide', ARTICLE: 'Article', OTHER: 'Other',
}

/** Display name for a Peec URL classification. A custom classification name passes through. */
export function urlTypeLabel(c: string | null): string | null {
  return c === null ? null : URL_TYPES[c] ?? c
}

function brandNames(ids: string[], brands: BrandChannels[]): string | null {
  const byId = new Map(brands.map((b) => [b.id, b]))
  const named = ids.map((id) => byId.get(id)).filter((b): b is BrandChannels => b !== undefined)
  named.sort((a, b) => Number(b.isOwn) - Number(a.isOwn) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base' }))
  return named.length ? named.map((b) => b.name).join('|') : null
}

const byRetrievals = <T extends { retrievals: number; url: string }>(a: T, b: T) => b.retrievals - a.retrievals || (a.url < b.url ? -1 : a.url > b.url ? 1 : 0)
const delta = (cur: number, prior: UrlAgg | undefined, pick: (u: UrlAgg) => number): number | null => (prior ? cur - pick(prior) : null)

export type SocialsInput = { current: UrlAgg[]; prior: UrlAgg[]; chatsCurrent: number; chatsPrior: number; brands: BrandChannels[]; domainType: string }

/**
 * Every tagged URL, ranked by retrievals. Split into the own and competitor tables with splitSocials.
 * Ownership here uses the URL's chosen channel title (the row with the most retrievals). The graphs decide per row, so a URL whose rows carry
 * different titles (for example null on some days) can be starred here while part of its citations are missing from a graph. Both match Peec's own views.
 */
export function buildSocialsRows(i: SocialsInput): SocialsRow[] {
  const prior = new Map(i.prior.map((u) => [u.url, u]))
  const ownId = i.brands.find((b) => b.isOwn)?.id ?? null
  return [...i.current].sort(byRetrievals).map((u, idx) => {
    const p = prior.get(u.url)
    const pct = i.chatsCurrent > 0 ? u.retrievals / i.chatsCurrent : 0
    const priorPct = p && i.chatsPrior > 0 ? p.retrievals / i.chatsPrior : null
    const owner = ownerOf({ url: u.url, channelTitle: u.channelTitle }, i.brands)
    return {
      rank: idx + 1,
      url: u.url,
      title: u.title,
      channelTitle: u.channelTitle,
      ownerBrandId: owner,
      isOwnChannel: owner !== null && owner === ownId,
      urlType: urlTypeLabel(u.classification),
      domainType: i.domainType,
      ownBrandMentioned: ownId !== null && u.brandIds.includes(ownId),
      mentionedBrandCount: u.brandIds.length,
      mentionedBrandNames: brandNames(u.brandIds, i.brands),
      retrievals: u.retrievals,
      retrievalsDelta: delta(u.retrievals, p, (x) => x.retrievals),
      retrievedPct: pct,
      retrievedPctDelta: priorPct === null || i.chatsCurrent <= 0 ? null : pct - priorPct,
      totalCitations: u.citations,
      totalCitationsDelta: delta(u.citations, p, (x) => x.citations),
    }
  })
}

/** Own table: rows owned by our brand. Competitor table: rows owned by any other brand with a match. Unowned rows are in neither. Each table is ranked from 1. */
export function splitSocials(rows: SocialsRow[], ownBrandId: string): { own: SocialsRow[]; competitor: SocialsRow[] } {
  const rerank = (list: SocialsRow[]) => list.map((r, i) => ({ ...r, rank: i + 1 }))
  return {
    own: rerank(rows.filter((r) => r.ownerBrandId === ownBrandId)),
    competitor: rerank(rows.filter((r) => r.ownerBrandId !== null && r.ownerBrandId !== ownBrandId)),
  }
}

export type GapInput = { current: UrlAgg[]; prior: UrlAgg[]; brands: BrandChannels[]; domainType: string }

/** URL Gaps. The caller pulls with the gap filter, so every row is a source where our brand is not mentioned. Citation share is over every row of the pull. */
export function buildGapRows(i: GapInput): GapRow[] {
  const prior = new Map(i.prior.map((u) => [u.url, u]))
  const total = i.current.reduce((s, u) => s + u.citations, 0)
  return [...i.current].sort(byRetrievals).map((u, idx) => {
    const p = prior.get(u.url)
    return {
      rank: idx + 1,
      url: u.url,
      title: u.title,
      channelTitle: u.channelTitle,
      urlType: urlTypeLabel(u.classification),
      domainType: i.domainType,
      mentionedBrandCount: u.brandIds.length,
      mentionedBrandNames: brandNames(u.brandIds, i.brands),
      citationShare: total > 0 ? u.citations / total : 0,
      citationPosition: citationPosition(u),
      retrievals: u.retrievals,
      retrievalsDelta: delta(u.retrievals, p, (x) => x.retrievals),
      totalCitations: u.citations,
      totalCitationsDelta: delta(u.citations, p, (x) => x.citations),
    }
  })
}
