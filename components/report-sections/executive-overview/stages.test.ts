import { describe, it, expect } from 'vitest'
import { buildStages } from './stages'

const totals = { sessions: 89234, activeUsers: 62108, newUsers: 34872, conversions: 1847, bounceRate: 0.384, sessionConversionRate: 0.021 }
const cmpTotals = { sessions: 77300 }
const peec = {
  weeklyVisibility: [{ visibility: 22.1 }, { visibility: 24.8 }],
  brandRankings: [{ name: 'Competitor', sov: 30, isYou: false }, { name: 'Renaissance', sov: 11.3, isYou: true }],
  trackedPrompts: [{}, {}, {}],
}

describe('buildStages', () => {
  it('always returns four stages in funnel order', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    expect(s.map(x => x.key)).toEqual(['aeo', 'ga4', 'inbound', 'pipeline'])
  })

  it('marks the two CRM stages unconnected and gives them no metric', () => {
    const s = buildStages({ totals, cmpTotals, peec, trendRows: [] })
    const crm = s.filter(x => x.key === 'inbound' || x.key === 'pipeline')
    expect(crm).toHaveLength(2)
    for (const stage of crm) {
      expect(stage.connected).toBe(false)
      expect(stage.metric).toBeUndefined()
      expect(stage.delta).toBeUndefined()
    }
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
