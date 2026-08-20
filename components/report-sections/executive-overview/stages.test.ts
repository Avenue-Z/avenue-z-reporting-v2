import { describe, it, expect } from 'vitest'
import { buildStages } from './stages'

const totals = { sessions: 89234, activeUsers: 62108, newUsers: 34872, conversions: 1847, bounceRate: 0.384, sessionConversionRate: 0.021 }
const cmpTotals = { sessions: 77300 }
// weekStart values are both in the past relative to the default `buildStages`
// `now` (real current time), so none of these fixtures accidentally trip the
// partial-week drop in the tests below that don't pass a fixed `now`.
const peec = {
  weeklyVisibility: [{ weekStart: '2020-01-06', visibility: 22.1 }, { weekStart: '2020-01-13', visibility: 24.8 }],
  brandRankings: [{ name: 'Competitor', sov: 30, isYou: false }, { name: 'Renaissance', sov: 11.3, isYou: true }],
  trackedPrompts: [{}, {}, {}],
}

describe('buildStages', () => {
  it('always returns four stages in funnel order', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    expect(s.map(x => x.key)).toEqual(['aeo', 'ga4', 'inbound', 'pipeline'])
  })

  it('always marks the two CRM stages unconnected and gives them no metric: this page has no CRM data source', () => {
    // Not gated on any client config flag. index.tsx fetches only GA4 and
    // Peec, so there is nothing a CRM-configured client could see here either
    // A prior version derived this from the client's hubspotTokenEnvVar,
    // which claimed a connection this page could not honor and rendered an
    // empty hero line for any CRM-configured client.
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    const crm = s.filter(x => x.key === 'inbound' || x.key === 'pipeline')
    expect(crm).toHaveLength(2)
    for (const stage of crm) {
      expect(stage.connected).toBe(false)
      expect(stage.metric).toBeUndefined()
      expect(stage.delta).toBeUndefined()
      expect(stage.unconnectedHint).toContain('CRM')
    }
  })

  it('marks the AEO stage unconnected when Peec is not configured for the client', () => {
    const s = buildStages({ totals, cmpTotals, peec: null, trendRows: [] })
    expect(s.find(x => x.key === 'aeo')?.connected).toBe(false)
  })

  it('gives the unconnected AEO stage an AI-visibility hint, never CRM wording', () => {
    // A Peec outage or an unconfigured Peec project must never tell the
    // reader to connect a CRM, which names the wrong data source.
    const s = buildStages({ totals, cmpTotals, peec: null, trendRows: [] })
    expect(s.find(x => x.key === 'aeo')?.unconnectedHint).not.toContain('CRM')
  })

  it('never marks the GA4 or AEO stages unconnected', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    expect(s.find(x => x.key === 'ga4')?.connected).not.toBe(false)
    expect(s.find(x => x.key === 'aeo')?.connected).not.toBe(false)
  })

  it('reads AI visibility from the latest week and the delta from the prior one', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    const aeo = s.find(x => x.key === 'aeo')!
    expect(aeo.metric).toBe('24.8%')
    expect(aeo.delta).toBeCloseTo(12.2, 0)
  })

  it('finds share of voice by the isYou flag, not by brand name', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    expect(s.find(x => x.key === 'aeo')?.subMetric).toContain('11.3%')
  })

  // Paul CR3 (207) finding: the AEO card badged "YTD" over a hero metric that
  // is actually the last complete week (see the partial-week tests below),
  // and every card's delta caption hardcoded "vs prior period" even though
  // the AEO delta compares two complete weeks, not a 30-day period.
  it('badges the AEO stage with its real hero window, never YTD', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    const aeo = s.find(x => x.key === 'aeo')!
    expect(aeo.badge).not.toBe('YTD')
    expect(aeo.badge).toBe('LAST FULL WEEK')
  })

  it('gives the AEO stage its own delta label, "vs prior week", not the default', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    expect(s.find(x => x.key === 'aeo')?.deltaLabel).toBe('vs prior week')
  })

  it('leaves the GA4 stage without a deltaLabel override, so it falls back to "vs prior period"', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    expect(s.find(x => x.key === 'ga4')?.deltaLabel).toBeUndefined()
  })

  it('gives the year-to-date share-of-voice subMetric its own time qualifier, since the hero is last-full-week', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    const subMetric = s.find(x => x.key === 'aeo')?.subMetric ?? ''
    expect(subMetric).toContain('11.3%')
    expect(subMetric.toLowerCase()).toContain('year to date')
  })

  it('leaves share of voice out when no brand is flagged isYou', () => {
    const noMatch = { ...peec, brandRankings: [{ name: 'Competitor', sov: 30, isYou: false }] }
    const s = buildStages({ totals, cmpTotals, peec: noMatch, trendRows: [] })
    expect(s.find(x => x.key === 'aeo')?.subMetric).toBeUndefined()
  })

  it('degrades to a dash when GA4 failed, rather than claiming zero', () => {
    const s = buildStages({ totals: null, cmpTotals: null, peec, trendRows: [] })
    expect(s.find(x => x.key === 'ga4')?.metric).toBe('—')
  })

  it('still returns four stages when every source failed', () => {
    const s = buildStages({ totals: null, cmpTotals: null, peec: null, trendRows: [] })
    expect(s).toHaveLength(4)
  })

  it('a failed totals query yields no delta, not minus one hundred percent', () => {
    const s = buildStages({ totals: null, cmpTotals, peec, trendRows: [] })
    expect(s.find(x => x.key === 'ga4')?.delta).toBeUndefined()
  })
})

// Wednesday. Its ISO week (Monday-start, UTC) is 2026-08-17.
const NOW = new Date('2026-08-19T12:00:00Z')

describe('buildStages: AI Visibility partial-week handling', () => {
  it('drops the last bucket when it is the current, still-accumulating week, for both the hero metric and the delta', () => {
    const peecData = {
      weeklyVisibility: [
        { weekStart: '2026-08-03', visibility: 20.0 },
        { weekStart: '2026-08-10', visibility: 22.1 },
        { weekStart: '2026-08-17', visibility: 5.0 }, // partial: only 2 days of the current week so far
      ],
      brandRankings: [],
      trackedPrompts: [],
    }
    const s = buildStages({ totals, cmpTotals, peec: peecData, trendRows: [], now: NOW })
    const aeo = s.find(x => x.key === 'aeo')!
    // Hero comes from the last COMPLETE week (Aug 10), not the partial Aug 17 bucket.
    expect(aeo.metric).toBe('22.1%')
    // Delta compares the two complete weeks (22.1 vs 20.0), not the partial vs a full week.
    expect(aeo.delta).toBeCloseTo(10.5, 1)
  })

  it('does nothing when the last bucket is not the current week (Peec already excludes it)', () => {
    const peecData = {
      weeklyVisibility: [
        { weekStart: '2026-08-03', visibility: 20.0 },
        { weekStart: '2026-08-10', visibility: 22.1 },
      ],
      brandRankings: [],
      trackedPrompts: [],
    }
    const s = buildStages({ totals, cmpTotals, peec: peecData, trendRows: [], now: NOW })
    const aeo = s.find(x => x.key === 'aeo')!
    expect(aeo.metric).toBe('22.1%')
    expect(aeo.delta).toBeCloseTo(10.5, 1)
  })

  it('falls back to no delta, not a crash, when only one complete week remains after dropping the partial one', () => {
    const peecData = {
      weeklyVisibility: [
        { weekStart: '2026-08-10', visibility: 22.1 },
        { weekStart: '2026-08-17', visibility: 5.0 }, // partial, dropped
      ],
      brandRankings: [],
      trackedPrompts: [],
    }
    const s = buildStages({ totals, cmpTotals, peec: peecData, trendRows: [], now: NOW })
    const aeo = s.find(x => x.key === 'aeo')!
    expect(aeo.metric).toBe('22.1%')
    expect(aeo.delta).toBeUndefined()
  })
})
