import { describe, it, expect } from 'vitest'
import { buildCompetitorDomainRows, buildBrandAbsentRows, humanisePageType, toCompetitorGapRows } from './competitor-tables'
import { EMPTY_COVERAGE_PROJECTION, type CoverageProjection } from './coverage-projection'
import type { TopDomain } from './client'
import type { UrlCitation } from './url-citations'

// Characterisation: expected values were produced by running the pre-extraction
// inline logic from content-impact.tsx (Section H) on this fixture.
const dom = (domain: string, o: Partial<TopDomain>): TopDomain => ({
  domain, retrieved: 10, retrievedDelta: 2.5, citationRate: 1, citationRateDelta: 0,
  citationCount: 0, priorCitationCount: 0, type: 'Competitor', ...o,
})
const cov = (p: Record<string, string[]>, byUrl: Record<string, string[]> = {}): CoverageProjection => ({
  ...EMPTY_COVERAGE_PROJECTION, promptIdsByDomain: p, promptIdsByUrlKey: byUrl,
})
const competitorDomains = [
  dom('a.com', { retrieved: 40.25, retrievedDelta: 3, citationCount: 60, priorCitationCount: 30 }),
  dom('b.com', { retrieved: 20, retrievedDelta: -1.5, citationCount: 30, priorCitationCount: 45 }),
  dom('c.com', { retrieved: 5, retrievedDelta: 0, citationCount: 10, priorCitationCount: 0 }),
]
const coverage = cov({ 'a.com': ['p1', 'p2', 'p3'], 'b.com': ['p1'] })
const coveragePrior = cov({ 'a.com': ['p1'], 'b.com': ['p1', 'p2'] })
const byModel = { 'a.com': { ChatGPT: 20, Perplexity: 40 }, 'b.com': { ChatGPT: 30 }, 'c.com': {} } as never
const base = { competitorDomains, domainCitationsByModel: byModel, coverage, coveragePrior, totalTrackedPrompts: 6, models: null, showDeltas: true }

describe('buildCompetitorDomainRows (H1)', () => {
  it('pins today\'s numbers with deltas on', () => {
    expect(buildCompetitorDomainRows(base)).toEqual([
      { domain: 'a.com', aiVisibility: 40.25, aiVisibilityDelta: 3, citationShare: 60, citationShareDelta: 20, promptCoverage: 50, promptCoverageDelta: 33 },
      { domain: 'b.com', aiVisibility: 20, aiVisibilityDelta: -1.5, citationShare: 30, citationShareDelta: -30, promptCoverage: 17, promptCoverageDelta: -16 },
      { domain: 'c.com', aiVisibility: 5, aiVisibilityDelta: 0, citationShare: 10, citationShareDelta: 10, promptCoverage: 0, promptCoverageDelta: 0 },
    ])
  })
  it('nulls every delta when showDeltas is false', () => {
    for (const r of buildCompetitorDomainRows({ ...base, showDeltas: false })) {
      expect([r.aiVisibilityDelta, r.citationShareDelta, r.promptCoverageDelta]).toEqual([null, null, null])
    }
  })
  it('model filter filters rows and nulls every delta (FB-063)', () => {
    const rows = buildCompetitorDomainRows({ ...base, models: ['ChatGPT'] })
    expect(rows).toEqual([
      { domain: 'b.com', aiVisibility: 20, aiVisibilityDelta: null, citationShare: 60, citationShareDelta: null, promptCoverage: 17, promptCoverageDelta: null },
      { domain: 'a.com', aiVisibility: 40.25, aiVisibilityDelta: null, citationShare: 40, citationShareDelta: null, promptCoverage: 50, promptCoverageDelta: null },
    ])
  })
  it('null prior coverage leaves coverage deltas null but keeps the others', () => {
    const r = buildCompetitorDomainRows({ ...base, coveragePrior: null })[0]
    expect(r.promptCoverageDelta).toBeNull()
    expect(r.citationShareDelta).toBe(20)
  })
})

const mk = (path: string, o: Partial<UrlCitation> = {}): UrlCitation => ({
  url: `https://x.com/${path}`, urlKey: `x.com/${path}`, domain: 'x.com', classification: 'ARTICLE', title: path,
  citationCount: 10, citationRate: 0, citationAvg: 0, engines: [], mentionedBrandIds: [],
  competitorBrandNames: ['Acme'], mentionsYourBrand: false, ...o,
})
const citations = [
  mk('a', { citationCount: 50 }),
  mk('b', { citationCount: 25, competitorBrandNames: ['Acme', 'Zed'], classification: 'LISTICLE' }),
  mk('own', { citationCount: 100, mentionsYourBrand: true }),
  mk('none', { citationCount: 5, competitorBrandNames: [] }),
  mk('new', { citationCount: 20, title: null }),
]
const prior = [mk('a', { citationCount: 20 }), mk('b', { citationCount: 0 }), mk('own', { citationCount: 80 })]
const urlCov = cov({}, { 'x.com/a': ['p1', 'p2'] })

describe('buildBrandAbsentRows (H2)', () => {
  it('pins today\'s numbers, adding pageType and promptIds', () => {
    expect(buildBrandAbsentRows({ citations, citationsPrior: prior, coverage: urlCov, showDelta: true })).toEqual([
      { domain: 'x.com', articleTitle: 'a', url: 'https://x.com/a', citationShare: 25, citationShareDelta: 5, competitorsMentioned: 'Acme', pageType: 'ARTICLE', promptIds: ['p1', 'p2'] },
      { domain: 'x.com', articleTitle: 'b', url: 'https://x.com/b', citationShare: 12.5, citationShareDelta: 12.5, competitorsMentioned: 'Acme, Zed', pageType: 'LISTICLE', promptIds: [] },
      { domain: 'x.com', articleTitle: null, url: 'https://x.com/new', citationShare: 10, citationShareDelta: null, competitorsMentioned: 'Acme', pageType: 'ARTICLE', promptIds: [] },
    ])
  })
  it('excludes rows mentioning your brand or naming no competitor', () => {
    const urls = buildBrandAbsentRows({ citations, citationsPrior: prior, coverage: urlCov, showDelta: true }).map((r) => r.url)
    expect(urls).not.toContain('https://x.com/own')
    expect(urls).not.toContain('https://x.com/none')
  })
  it('nulls deltas when showDelta is false or there is no prior', () => {
    for (const args of [{ citationsPrior: prior, showDelta: false }, { citationsPrior: null, showDelta: true }]) {
      const rows = buildBrandAbsentRows({ citations, coverage: urlCov, ...args })
      expect(rows.every((r) => r.citationShareDelta === null)).toBe(true)
      expect(rows[0].citationShare).toBe(25)
    }
  })
})

describe('humanisePageType', () => {
  it('maps known Peec classifications and title-cases the rest', () => {
    expect(humanisePageType('ARTICLE')).toBe('Article')
    expect(humanisePageType('LISTICLE')).toBe('Listicle')
    expect(humanisePageType('UGC')).toBe('Forum')
    expect(humanisePageType('FORUM')).toBe('Forum')
    expect(humanisePageType('PRODUCT_PAGE')).toBe('Product page')
    expect(humanisePageType('HOW_TO_GUIDE')).toBe('How-to guide')
    expect(humanisePageType('SOME_NEW_KIND')).toBe('Some New Kind')
  })
  it('is null (rendered --) when Peec gave no classification', () => {
    expect(humanisePageType('')).toBeNull()
    expect(humanisePageType('  ')).toBeNull()
  })
})

describe('toCompetitorGapRows (D-15 data boundary)', () => {
  const base = buildBrandAbsentRows({ citations, citationsPrior: prior, coverage: urlCov, showDelta: true })
  const promptTextById = new Map([['p1', 'first prompt text'], ['p2', 'second prompt text']])

  it('client rows carry only the count: no prompt ids, no prompt text', () => {
    const rows = toCompetitorGapRows(base, { audience: 'client', coverageOk: true, promptTextById })
    expect(rows[0]).toEqual({
      domain: 'x.com', articleTitle: 'a', url: 'https://x.com/a', citationShare: 25, citationShareDelta: 5,
      competitorsMentioned: 'Acme', pageTypeLabel: 'Article', promptCount: 2,
    })
    const wire = JSON.stringify(rows)
    expect(wire).not.toContain('first prompt text')
    expect(wire).not.toContain('"p1"')
    expect(wire).not.toContain('promptIds')
  })
  it('internal rows also carry the prompt texts, looked up by id', () => {
    const rows = toCompetitorGapRows(base, { audience: 'internal', coverageOk: true, promptTextById })
    expect(rows[0].promptCount).toBe(2)
    expect(rows[0].prompts).toEqual(['first prompt text', 'second prompt text'])
    expect(rows[1].prompts).toEqual([])
    expect(JSON.stringify(rows)).not.toContain('promptIds')
  })
  it('an unusable coverage walk renders the count as -- (null), never 0, and shows no prompts', () => {
    for (const audience of ['client', 'internal'] as const) {
      const rows = toCompetitorGapRows(base, { audience, coverageOk: false, promptTextById })
      expect(rows.every((r) => r.promptCount === null && r.prompts === undefined)).toBe(true)
    }
  })
})
