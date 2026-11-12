// lib/organic-social/aeo-informed/tables.test.ts
import { describe, it, expect } from 'vitest'
import { buildSocialsRows, splitSocials, buildGapRows, urlTypeLabel } from './tables'
import type { UrlAgg } from './types'
import type { BrandChannels } from './ownership'

const agg = (url: string, o: Partial<UrlAgg> = {}): UrlAgg => ({
  url, title: null, channelTitle: null, classification: 'ARTICLE', retrievals: 0, citations: 0, positionSum: 0, positionCount: 0, brandIds: [], ...o,
})
const brands: BrandChannels[] = [
  { id: 'b_own', name: 'Example', isOwn: true, platforms: ['linkedin'] },
  { id: 'b_globex', name: 'Globex', isOwn: false, platforms: ['linkedin'] },
  { id: 'b_initech', name: 'Initech', isOwn: false, platforms: [] },
]
const base = { chatsCurrent: 1200, chatsPrior: 1000, brands, domainType: 'Organic Social' }

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
    const [r] = buildSocialsRows({ ...base, current: [agg('https://x.com/a', { retrievals: 60, citations: 40 })], prior: [agg('https://x.com/a', { retrievals: 45, citations: 30 })] })
    expect(r.retrievals).toBe(60)
    expect(r.retrievalsDelta).toBe(15)
    expect(r.retrievedPct).toBeCloseTo(60 / 1200, 10)
    expect(r.retrievedPctDelta).toBeCloseTo(60 / 1200 - 45 / 1000, 10)
    expect(r.totalCitations).toBe(40)
    expect(r.totalCitationsDelta).toBe(10)
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

  it('no chats in the current window gives a 0 percent and a null change even when the previous window had chats', () => {
    const [r] = buildSocialsRows({ ...base, chatsCurrent: 0, chatsPrior: 100, current: [agg('https://x.com/a', { retrievals: 4 })], prior: [agg('https://x.com/a', { retrievals: 2 })] })
    expect(r.retrievedPct).toBe(0)
    expect(r.retrievedPctDelta).toBeNull()
  })

  it('flags whether our own brand is mentioned, counts brands, and lists names with our own first', () => {
    const rows = buildSocialsRows({ ...base, current: [
      agg('https://x.com/a', { retrievals: 2, brandIds: ['b_initech', 'b_own', 'b_globex'] }),
      agg('https://x.com/b', { retrievals: 1, brandIds: ['b_globex', 'zz_unknown'] }),
      agg('https://x.com/c', { retrievals: 0, brandIds: [] }),
    ], prior: [] })
    expect(rows[0]).toMatchObject({ ownBrandMentioned: true, mentionedBrandCount: 3, mentionedBrandNames: 'Example|Globex|Initech' })
    expect(rows[1]).toMatchObject({ ownBrandMentioned: false, mentionedBrandCount: 2, mentionedBrandNames: 'Globex' })
    expect(rows[2]).toMatchObject({ ownBrandMentioned: false, mentionedBrandCount: 0, mentionedBrandNames: null })
  })

  it('carries the channel, the display URL type, the domain type and the owner', () => {
    const [r] = buildSocialsRows({ ...base, current: [agg('https://www.linkedin.com/pulse/x', { retrievals: 1, title: 'T', channelTitle: 'Example Co Insurance Group', classification: 'HOW_TO_GUIDE' })], prior: [] })
    expect(r).toMatchObject({ title: 'T', channelTitle: 'Example Co Insurance Group', urlType: 'How-To Guide', domainType: 'Organic Social', ownerBrandId: 'b_own', isOwnChannel: true })
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
    const { own, competitor } = splitSocials(rows, 'b_own')
    expect(own.map((r) => r.url)).toEqual(['https://www.linkedin.com/pulse/own1', 'https://www.linkedin.com/posts/examplebenefits_two'])
    expect(competitor.map((r) => r.url)).toEqual(['https://www.linkedin.com/company/globex'])
  })
  it('ranks each table from 1', () => {
    const { own, competitor } = splitSocials(rows, 'b_own')
    expect(own.map((r) => r.rank)).toEqual([1, 2])
    expect(competitor.map((r) => r.rank)).toEqual([1])
  })
})

describe('buildGapRows', () => {
  const current = [
    agg('https://x.com/a', { retrievals: 80, citations: 30, positionSum: 25, positionCount: 10, brandIds: ['b_globex', 'b_initech'], classification: 'ARTICLE' }),
    agg('https://x.com/b', { retrievals: 50, citations: 70, positionSum: 40, positionCount: 10, brandIds: ['b_globex'] }),
    agg('https://x.com/c', { retrievals: 7, citations: 0, brandIds: ['b_initech'] }),
  ]
  it('citation share is the row citations over the sum across every row, and the shares add up to 1', () => {
    const rows = buildGapRows({ brands, domainType: 'Organic Social', current, prior: [] })
    expect(rows[0].citationShare).toBeCloseTo(30 / 100, 10)
    expect(rows.reduce((s, r) => s + r.citationShare, 0)).toBeCloseTo(1, 10)
  })
  it('a view with zero total citations gives a share of 0, not NaN', () => {
    const rows = buildGapRows({ brands, domainType: 'Organic Social', current: [agg('https://x.com/a', { retrievals: 3 })], prior: [] })
    expect(rows[0].citationShare).toBe(0)
  })
  it('position is the average inline rank, null when never cited inline', () => {
    const rows = buildGapRows({ brands, domainType: 'Organic Social', current, prior: [] })
    expect(rows[0].citationPosition).toBeCloseTo(2.5, 10)
    expect(rows[1].citationPosition).toBeCloseTo(4, 10)
    expect(rows[2].citationPosition).toBeNull()
  })
  it('fills deltas against the prior window, null when new', () => {
    const rows = buildGapRows({ brands, domainType: 'Organic Social', current, prior: [agg('https://x.com/a', { retrievals: 60, citations: 20 }), agg('https://x.com/b', { retrievals: 40, citations: 30 })] })
    expect(rows.map((r) => [r.rank, r.url, r.retrievalsDelta, r.totalCitationsDelta])).toEqual([
      [1, 'https://x.com/a', 20, 10], [2, 'https://x.com/b', 10, 40], [3, 'https://x.com/c', null, null],
    ])
  })
  it('sorts by competitor brands mentioned times retrievals, highest first, as the outline screenshot is ordered; ties go to retrievals then URL', () => {
    const rows = buildGapRows({
      brands, domainType: 'Organic Social', prior: [],
      current: [
        agg('https://x.com/few', { retrievals: 40, brandIds: ['b_globex'] }),                                   // 1 x 40 = 40
        agg('https://x.com/many', { retrievals: 7, brandIds: ['b_globex', 'b_initech', 'b_own'] }),             // 3 x 7 = 21
        agg('https://x.com/mid', { retrievals: 19, brandIds: ['b_globex', 'b_initech'] }),                      // 2 x 19 = 38
        agg('https://x.com/tie-b', { retrievals: 10, brandIds: ['b_globex', 'b_initech'] }),                    // 20
        agg('https://x.com/tie-a', { retrievals: 10, brandIds: ['b_globex', 'b_initech'] }),                    // 20
        agg('https://x.com/tie-c', { retrievals: 20, brandIds: ['b_globex'] }),                                 // 20, more retrievals
      ],
    })
    expect(rows.map((r) => r.url.split('/').pop())).toEqual(['few', 'mid', 'many', 'tie-c', 'tie-a', 'tie-b'])
    expect(rows.map((r) => r.rank)).toEqual([1, 2, 3, 4, 5, 6])
  })
  it('keeps the rows Peec returned: a URL that comes back as two rows (different competitors) is two rows, each with its own numbers', () => {
    const rows = buildGapRows({
      brands, domainType: 'Organic Social', prior: [],
      current: [agg('https://x.com/dup', { retrievals: 9, citations: 0, brandIds: ['b_globex'] }), agg('https://x.com/dup', { retrievals: 5, citations: 0, brandIds: ['b_initech'] }), agg('https://x.com/one', { retrievals: 4, citations: 2, brandIds: ['b_globex'] })],
    })
    expect(rows).toHaveLength(3)
    expect(rows.filter((r) => r.url === 'https://x.com/dup').map((r) => r.retrievals).sort()).toEqual([5, 9])
    expect(rows.reduce((s, r) => s + r.citationShare, 0)).toBeCloseTo(1, 10)
  })
  it('a repeated URL is compared with the previous row that names the same competitors, and with nothing when that is ambiguous', () => {
    const rows = buildGapRows({
      brands, domainType: 'Organic Social',
      current: [
        agg('https://x.com/dup', { retrievals: 9, citations: 1, brandIds: ['b_globex'] }), agg('https://x.com/dup', { retrievals: 5, citations: 0, brandIds: ['b_initech'] }),
        agg('https://x.com/amb', { retrievals: 8, citations: 0, brandIds: ['b_globex'] }), agg('https://x.com/amb', { retrievals: 6, citations: 0, brandIds: ['b_initech'] }),
        agg('https://x.com/solo', { retrievals: 7, citations: 3, brandIds: ['b_globex'] }),
      ],
      prior: [
        agg('https://x.com/dup', { retrievals: 4, citations: 1, brandIds: ['b_globex'] }), agg('https://x.com/dup', { retrievals: 2, citations: 0, brandIds: ['b_initech'] }),
        agg('https://x.com/amb', { retrievals: 20, citations: 0, brandIds: ['b_own'] }),
        agg('https://x.com/solo', { retrievals: 2, citations: 1, brandIds: ['b_globex', 'b_initech'] }),
      ],
    })
    const by = (u: string, r: number) => rows.find((x) => x.url === u && x.retrievals === r)!
    expect([by('https://x.com/dup', 9).retrievalsDelta, by('https://x.com/dup', 5).retrievalsDelta]).toEqual([5, 3])
    expect([by('https://x.com/amb', 8).retrievalsDelta, by('https://x.com/amb', 6).retrievalsDelta]).toEqual([null, null])
    expect([by('https://x.com/solo', 7).retrievalsDelta, by('https://x.com/solo', 7).totalCitationsDelta]).toEqual([5, 2])
  })
  it('lists mentioned brands and the count, and keeps the URL type label and domain type', () => {
    const [r] = buildGapRows({ brands, domainType: 'Organic Social', current, prior: [] })
    expect(r).toMatchObject({ mentionedBrandCount: 2, mentionedBrandNames: 'Globex|Initech', urlType: 'Article', domainType: 'Organic Social' })
  })
})

describe('citation rate (team feedback 2026-11-12)', () => {
  it('citation rate is citations over retrievals, and is not capped at 100%', () => {
    const [r] = buildSocialsRows({ ...base, current: [agg('https://x.com/a', { retrievals: 145, citations: 220 })], prior: [] })
    expect(r.citationRate).toBeCloseTo(220 / 145, 10)
    const [g] = buildGapRows({ current: [agg('https://x.com/a', { retrievals: 145, citations: 220, brandIds: ['b_globex'] })], prior: [], brands, domainType: 'Organic Social' })
    expect(g.citationRate).toBeCloseTo(220 / 145, 10)
  })
  it('citation rate is null at 0 retrievals and its change is null', () => {
    const [r] = buildSocialsRows({ ...base, current: [agg('https://x.com/a', { retrievals: 0, citations: 0 })], prior: [agg('https://x.com/a', { retrievals: 4, citations: 2 })] })
    expect(r.citationRate).toBeNull()
    expect(r.citationRateDelta).toBeNull()
  })
  it('rate change is current rate minus previous rate, null for a new URL or a previous rate of null', () => {
    const rows = buildSocialsRows({ ...base,
      current: [agg('https://x.com/a', { retrievals: 10, citations: 5 }), agg('https://x.com/b', { retrievals: 8, citations: 4 }), agg('https://x.com/c', { retrievals: 6, citations: 3 })],
      prior: [agg('https://x.com/a', { retrievals: 20, citations: 4 }), agg('https://x.com/c', { retrievals: 0, citations: 0 })] })
    const by = new Map(rows.map((r) => [r.url, r]))
    expect(by.get('https://x.com/a')!.citationRateDelta).toBeCloseTo(0.5 - 0.2, 10)
    expect(by.get('https://x.com/b')!.citationRateDelta).toBeNull()
    expect(by.get('https://x.com/c')!.citationRateDelta).toBeNull()
    const [g] = buildGapRows({ current: [agg('https://x.com/g', { retrievals: 10, citations: 5, brandIds: ['b_globex'] })], prior: [agg('https://x.com/g', { retrievals: 10, citations: 2, brandIds: ['b_globex'] })], brands, domainType: 'Organic Social' })
    expect(g.citationRateDelta).toBeCloseTo(0.5 - 0.2, 10)
  })
  it('mentionedBrandIds follows the names order, own brand first, and skips ids that are not a brand', () => {
    const [r] = buildSocialsRows({ ...base, current: [agg('https://x.com/a', { retrievals: 1, brandIds: ['b_initech', 'b_unknown', 'b_globex', 'b_own'] })], prior: [] })
    expect(r.mentionedBrandNames).toBe('Example|Globex|Initech')
    expect(r.mentionedBrandIds).toBe('b_own|b_globex|b_initech')
    const [g] = buildGapRows({ current: [agg('https://x.com/g', { retrievals: 1, brandIds: ['b_initech', 'b_globex'] })], prior: [], brands, domainType: 'Organic Social' })
    expect(g.mentionedBrandIds).toBe('b_globex|b_initech')
    const [none] = buildSocialsRows({ ...base, current: [agg('https://x.com/n', { retrievals: 1, brandIds: ['b_unknown'] })], prior: [] })
    expect([none.mentionedBrandNames, none.mentionedBrandIds]).toEqual([null, null])
  })
})
