import { describe, it, expect } from 'vitest'
import {
  buildContentPerformanceRows, engagementRateByPath, blankCountsByColumn, type PathMetrics,
} from './content-performance-rows'
import type { CalendarPage } from '@/lib/content-calendar/pages'
import type { OwnedUrlCitations } from './url-citations'
import type { CoverageProjection } from './coverage-projection'
import { EMPTY_COVERAGE_PROJECTION } from './coverage-projection'

const page = (o: Partial<CalendarPage> = {}): CalendarPage => ({
  urlKey: 'ex.com/a', url: 'https://ex.com/a', topic: 'Topic A', contentType: 'Blog',
  published: true, badge: 'new', publishDate: '2026-01-01', lastOptimizedDate: null, ...o,
})
const cite = (urlKey: string, n: number, title: string | null = null) => ({
  url: `https://${urlKey}`, urlKey, domain: 'ex.com', classification: 'x', title,
  citationCount: n, citationRate: 0, citationAvg: 0, engines: [], mentionedBrandIds: [],
  competitorBrandNames: [], mentionsYourBrand: true,
})
const owned = (rows: ReturnType<typeof cite>[], o: Partial<OwnedUrlCitations> = {}): OwnedUrlCitations => ({
  rows, totalCitationCount: 100, complete: true, ...o,
})
const cov = (m: Record<string, string[]>, o: Partial<CoverageProjection> = {}): CoverageProjection => ({
  ...EMPTY_COVERAGE_PROJECTION, promptIdsByUrlKey: m, ...o,
})
const none = (): PathMetrics => ({ aiReferred: null, organic: null, engagementRate: null })

const base = (o: Record<string, unknown> = {}) => ({
  pages: [page()], owned: owned([]), ownedPrior: null, coverage: cov({}), coveragePrior: null,
  totalTrackedPrompts: 10, current: none, prior: null, ...o,
}) as Parameters<typeof buildContentPerformanceRows>[0]

describe('buildContentPerformanceRows', () => {
  it('AZ page with no citations still appears with citationShare 0 when owned is complete', () => {
    const [r] = buildContentPerformanceRows(base())
    expect(r.citationShare).toBe(0)
    expect(r.scopes).toEqual(['az', 'all']) // All = union, includes every AZ row
  })
  it('citationShare is null when owned.complete is false', () => {
    const [r] = buildContentPerformanceRows(base({ owned: owned([], { complete: false }) }))
    expect(r.citationShare).toBeNull()
  })
  it('citationShare is null when total is 0', () => {
    const [r] = buildContentPerformanceRows(base({ owned: owned([], { totalCitationCount: 0 }) }))
    expect(r.citationShare).toBeNull()
  })
  it('promptCoverage is null, not 0, when coverage.complete is false', () => {
    const [r] = buildContentPerformanceRows(base({ coverage: cov({}, { complete: false }) }))
    expect(r.promptCoverage).toBeNull()
    const [r2] = buildContentPerformanceRows(base({ totalTrackedPrompts: 0 }))
    expect(r2.promptCoverage).toBeNull()
  })
  it('computes coverage and share with deltas', () => {
    const [r] = buildContentPerformanceRows(base({
      owned: owned([cite('ex.com/a', 20)]),
      ownedPrior: owned([cite('ex.com/a', 10)]),
      coverage: cov({ 'ex.com/a': ['p1', 'p2', 'p3'] }),
      coveragePrior: cov({ 'ex.com/a': ['p1'] }),
    }))
    expect(r.promptCoverage).toBe(30)
    expect(r.promptCoverageDelta).toBe(20)
    expect(r.citationShare).toBe(20)
    expect(r.citationShareDelta).toBe(10)
  })
  it('a cited owned page in the calendar appears once with its badge in both scopes', () => {
    const rows = buildContentPerformanceRows(base({ owned: owned([cite('ex.com/a', 5)]) }))
    expect(rows).toHaveLength(1)
    expect(rows[0].badge).toBe('new')
    expect(rows[0].scopes).toEqual(['az', 'all'])
  })
  it('non-calendar cited page is all-only with null badge; uncited ones are dropped', () => {
    const rows = buildContentPerformanceRows(base({
      owned: owned([cite('ex.com/z', 5, 'Zed'), cite('ex.com/q', 0)]),
    }))
    const z = rows.find((r) => r.key === 'ex.com/z')!
    expect(z.scopes).toEqual(['all'])
    expect(z.badge).toBeNull()
    expect(z.title).toBe('Zed')
    expect(z.slug).toBe('/z')
    expect(rows.find((r) => r.key === 'ex.com/q')).toBeUndefined()
  })
  it('title falls back to labelFromPath', () => {
    const rows = buildContentPerformanceRows(base({ pages: [], owned: owned([cite('ex.com/my-page', 3)]) }))
    expect(rows[0].title).toBe('My Page')
  })
  it('organicDelta null when prior organic is 0; otherwise percent change', () => {
    const mk = (p: number) => buildContentPerformanceRows(base({
      current: () => ({ aiReferred: 10, organic: 50, engagementRate: 0.6 }),
      prior: () => ({ aiReferred: 5, organic: p, engagementRate: 0.5 }),
    }))[0]
    expect(mk(0).organicDelta).toBeNull()
    expect(mk(25).organicDelta).toBe(100)
    expect(mk(25).aiReferredDelta).toBe(100)
    expect(mk(25).engagementRateDelta).toBeCloseTo(10)
  })
})

describe('engagementRateByPath', () => {
  it('weights /p and /p/ by sessions', () => {
    const m = engagementRateByPath([
      { pagePath: '/p', sessions: 100, engagementRate: 0.5 },
      { pagePath: '/p/', sessions: 300, engagementRate: 0.7 },
    ])
    expect(m.get('/p')).toBeCloseTo(0.65)
  })
  it('skips bad rows and omits zero-weight paths', () => {
    const m = engagementRateByPath([
      { pagePath: '/a', sessions: 0, engagementRate: 0.5 },
      { pagePath: '/b', sessions: 10, engagementRate: null },
      { pagePath: '/c', sessions: 10, engagementRate: NaN },
    ])
    expect(m.size).toBe(0)
  })
})

describe('blankCountsByColumn', () => {
  it('counts null cells per column', () => {
    const rows = buildContentPerformanceRows(base({ pages: [page(), page({ urlKey: 'ex.com/b', url: 'https://ex.com/b', publishDate: null })] }))
    const c = blankCountsByColumn(rows)
    expect(c.publishDate).toBe(1)
    expect(c.organic).toBe(2)
    expect(c.citationShare).toBe(0)
  })
})
