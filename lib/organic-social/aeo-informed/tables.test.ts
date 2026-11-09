// lib/organic-social/aeo-informed/tables.test.ts
import { describe, it, expect } from 'vitest'
import { buildSocialsRows, splitSocials, buildGapRows, urlTypeLabel } from './tables'
import type { UrlAgg } from './types'
import type { BrandChannels } from './ownership'

const agg = (url: string, o: Partial<UrlAgg> = {}): UrlAgg => ({
  url, title: null, channelTitle: null, classification: 'ARTICLE', retrievals: 0, citations: 0, positionSum: 0, positionCount: 0, brandIds: [], ...o,
})
const brands: BrandChannels[] = [
  { id: 'b_ren', name: 'Example', isOwn: true, platforms: ['linkedin'] },
  { id: 'b_globex', name: 'Globex', isOwn: false, platforms: ['linkedin'] },
  { id: 'b_initech', name: 'Initech', isOwn: false, platforms: [] },
]
const base = { chatsCurrent: 8944, chatsPrior: 8867, brands, domainType: 'Organic Social' }

describe('urlTypeLabel', () => {
  it('maps Peec built-in classifications to display names', () => {
    expect(urlTypeLabel('HOW_TO_GUIDE')).toBe('How-To Guide')
    expect(urlTypeLabel('ARTICLE')).toBe('Article')
    expect(urlTypeLabel('LISTICLE')).toBe('Listicle')
    expect(urlTypeLabel('COMPARISON')).toBe('Comparison')
    expect(urlTypeLabel('PROFILE')).toBe('Profile')
    expect(urlTypeLabel('OTHER')).toBe('Other')
    expect(urlTypeLabel('CATEGORY_PAGE')).toBe('Category page')
  })
  it('passes a custom or unknown name through, and keeps null', () => {
    expect(urlTypeLabel('My custom type')).toBe('My custom type')
    expect(urlTypeLabel(null)).toBeNull()
  })
})

describe('buildSocialsRows', () => {
  it('ranks by retrievals descending with the URL as the tie-break', () => {
    const rows = buildSocialsRows({ ...base, current: [agg('https://x.com/b', { retrievals: 5 }), agg('https://x.com/a', { retrievals: 5 }), agg('https://x.com/c', { retrievals: 9 })], prior: [] })
    expect(rows.map((r) => [r.rank, r.url])).toEqual([[1, 'https://x.com/c'], [2, 'https://x.com/a'], [3, 'https://x.com/b']])
  })

  it('retrieved % is retrievals over the window chats, and its delta is in points against the prior window', () => {
    const [r] = buildSocialsRows({ ...base, current: [agg('https://x.com/a', { retrievals: 288, citations: 269 })], prior: [agg('https://x.com/a', { retrievals: 185, citations: 200 })] })
    expect(r.retrievals).toBe(288)
    expect(r.retrievalsDelta).toBe(103)
    expect(r.retrievedPct).toBeCloseTo(288 / 8944, 10)
    expect(r.retrievedPctDelta).toBeCloseTo(288 / 8944 - 185 / 8867, 10)
    expect(r.totalCitations).toBe(269)
    expect(r.totalCitationsDelta).toBe(69)
  })

  it('a URL with no prior row has null deltas, not a fake jump', () => {
    const [r] = buildSocialsRows({ ...base, current: [agg('https://x.com/new', { retrievals: 10 })], prior: [agg('https://x.com/other', { retrievals: 50 })] })
    expect([r.retrievalsDelta, r.retrievedPctDelta, r.totalCitationsDelta]).toEqual([null, null, null])
  })

  it('zero chats gives a 0 percent and a null delta, never NaN', () => {
    const [r] = buildSocialsRows({ ...base, chatsCurrent: 0, chatsPrior: 0, current: [agg('https://x.com/a', { retrievals: 4 })], prior: [agg('https://x.com/a', { retrievals: 2 })] })
    expect(r.retrievedPct).toBe(0)
    expect(r.retrievedPctDelta).toBeNull()
    expect(r.retrievalsDelta).toBe(2)
  })

  it('flags whether our own brand is mentioned, counts brands, and lists names with our own first', () => {
    const rows = buildSocialsRows({ ...base, current: [
      agg('https://x.com/a', { retrievals: 2, brandIds: ['b_initech', 'b_ren', 'b_globex'] }),
      agg('https://x.com/b', { retrievals: 1, brandIds: ['b_globex', 'zz_unknown'] }),
      agg('https://x.com/c', { retrievals: 0, brandIds: [] }),
    ], prior: [] })
    expect(rows[0]).toMatchObject({ ownBrandMentioned: true, mentionedBrandCount: 3, mentionedBrandNames: 'Example|Globex|Initech' })
    expect(rows[1]).toMatchObject({ ownBrandMentioned: false, mentionedBrandCount: 2, mentionedBrandNames: 'Globex' })
    expect(rows[2]).toMatchObject({ ownBrandMentioned: false, mentionedBrandCount: 0, mentionedBrandNames: null })
  })

  it('carries the channel, the display URL type, the domain type and the owner', () => {
    const [r] = buildSocialsRows({ ...base, current: [agg('https://www.linkedin.com/pulse/x', { retrievals: 1, title: 'T', channelTitle: 'Example Life & Health Insurance Company of America', classification: 'HOW_TO_GUIDE' })], prior: [] })
    expect(r).toMatchObject({ title: 'T', channelTitle: 'Example Life & Health Insurance Company of America', urlType: 'How-To Guide', domainType: 'Organic Social', ownerBrandId: 'b_ren', isOwnChannel: true })
  })

  it('a row with no owner is not an own channel', () => {
    const [r] = buildSocialsRows({ ...base, current: [agg('https://www.linkedin.com/pulse/x', { retrievals: 1, channelTitle: 'Some Author' })], prior: [] })
    expect(r).toMatchObject({ ownerBrandId: null, isOwnChannel: false })
  })
})

describe('splitSocials', () => {
  const rows = buildSocialsRows({ ...base, current: [
    agg('https://www.linkedin.com/pulse/own1', { retrievals: 9, channelTitle: 'Example Life' }),
    agg('https://www.linkedin.com/pulse/third', { retrievals: 8, channelTitle: 'Some Author' }),
    agg('https://www.linkedin.com/company/globex', { retrievals: 7, channelTitle: 'Globex' }),
    agg('https://www.linkedin.com/posts/examplebenefits_two', { retrievals: 6, channelTitle: 'Example Benefits' }),
  ], prior: [] })
  it('puts own-brand rows in own, competitor-owned rows in competitor, and drops unowned rows from both', () => {
    const { own, competitor } = splitSocials(rows, 'b_ren')
    expect(own.map((r) => r.url)).toEqual(['https://www.linkedin.com/pulse/own1', 'https://www.linkedin.com/posts/examplebenefits_two'])
    expect(competitor.map((r) => r.url)).toEqual(['https://www.linkedin.com/company/globex'])
  })
  it('ranks each table from 1', () => {
    const { own, competitor } = splitSocials(rows, 'b_ren')
    expect(own.map((r) => r.rank)).toEqual([1, 2])
    expect(competitor.map((r) => r.rank)).toEqual([1])
  })
})

describe('buildGapRows', () => {
  const current = [
    agg('https://x.com/a', { retrievals: 194, citations: 126, positionSum: 34, positionCount: 10, brandIds: ['b_globex', 'b_initech'], classification: 'ARTICLE' }),
    agg('https://x.com/b', { retrievals: 145, citations: 220, positionSum: 27, positionCount: 10, brandIds: ['b_globex'] }),
    agg('https://x.com/c', { retrievals: 7, citations: 0, brandIds: ['b_initech'] }),
  ]
  it('citation share is the row citations over the sum across every row, and the shares add up to 1', () => {
    const rows = buildGapRows({ brands, domainType: 'Organic Social', current, prior: [] })
    expect(rows[0].citationShare).toBeCloseTo(126 / 346, 10)
    expect(rows.reduce((s, r) => s + r.citationShare, 0)).toBeCloseTo(1, 10)
  })
  it('a view with zero total citations gives a share of 0, not NaN', () => {
    const rows = buildGapRows({ brands, domainType: 'Organic Social', current: [agg('https://x.com/a', { retrievals: 3 })], prior: [] })
    expect(rows[0].citationShare).toBe(0)
  })
  it('position is the average inline rank, null when never cited inline', () => {
    const rows = buildGapRows({ brands, domainType: 'Organic Social', current, prior: [] })
    expect(rows[0].citationPosition).toBeCloseTo(3.4, 10)
    expect(rows[1].citationPosition).toBeCloseTo(2.7, 10)
    expect(rows[2].citationPosition).toBeNull()
  })
  it('sorts by retrievals and fills deltas against the prior window, null when new', () => {
    const rows = buildGapRows({ brands, domainType: 'Organic Social', current, prior: [agg('https://x.com/a', { retrievals: 107, citations: 63 }), agg('https://x.com/b', { retrievals: 112, citations: 77 })] })
    expect(rows.map((r) => [r.rank, r.url, r.retrievalsDelta, r.totalCitationsDelta])).toEqual([
      [1, 'https://x.com/a', 87, 63], [2, 'https://x.com/b', 33, 143], [3, 'https://x.com/c', null, null],
    ])
  })
  it('lists mentioned brands and the count, and keeps the URL type label and domain type', () => {
    const [r] = buildGapRows({ brands, domainType: 'Organic Social', current, prior: [] })
    expect(r).toMatchObject({ mentionedBrandCount: 2, mentionedBrandNames: 'Globex|Initech', urlType: 'Article', domainType: 'Organic Social' })
  })
})
