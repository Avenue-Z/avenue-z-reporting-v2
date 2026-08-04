import { describe, expect, test } from 'vitest'
import { transformKpis } from './kpis'

const cfg = { googleAdsAccountId: '4136001852', leadActions: [{ name: 'contact_individual_lead', category: 'contact' as const }] }
const totals = { Cost: '18915.79', Clicks: '10409', Impressions: '113718', Ctr: '9.15', CPC: '1.81' }
const actions = [{ ConversionTypeName: 'contact_individual_lead', Conversions: '14' }, { ConversionTypeName: 'Calls from ads', Conversions: '13' }]

describe('transformKpis', () => {
  const kpis = transformKpis(totals, actions, null, null, cfg)

  test('scopes leads to configured lead actions (calls excluded)', () => {
    expect(kpis.find((k) => k.key === 'leads')!.value).toBe(14)
  })

  test('CPL is exact cents — cost / leads, not rounded (item 11d)', () => {
    // Was Math.round(cost/leads); the cents work makes it exact so the per-row
    // and total CPL never disagree at two precisions.
    expect(kpis.find((k) => k.key === 'cpl')!.value).toBeCloseTo(18915.79 / 14, 6)
  })

  test('produces the 8 canonical KPI cards', () => {
    expect(kpis.length).toBe(8)
  })

  test('deltas vs a smaller prior period are positive and correctly signed', () => {
    const compareTotals = { Cost: '9457.90', Clicks: '5204', Impressions: '56859' }
    const compareActionRows = [{ ConversionTypeName: 'contact_individual_lead', Conversions: '7' }]
    const kpis2 = transformKpis(totals, actions, compareTotals, compareActionRows, cfg)

    // Leads: 14 vs 7 → 100% increase
    const leadsCard = kpis2.find((k) => k.key === 'leads')!
    expect(leadsCard.delta).toBeDefined()
    expect(leadsCard.delta!).toBeCloseTo(100, 3)

    // Cost: 18915.79 vs 9457.90 → ~100% increase
    const costCard = kpis2.find((k) => k.key === 'cost')!
    expect(costCard.delta).toBeDefined()
    expect(costCard.delta!).toBeGreaterThan(0)

    // Deltas present for all comparable metrics when a comparison period exists
    for (const key of ['impressions', 'ctr', 'cpc', 'cpl', 'convRate']) {
      expect(kpis2.find((k) => k.key === key)!.delta).toBeDefined()
    }

    // Cost-efficiency metrics invert delta coloring (down = good)
    expect(kpis2.find((k) => k.key === 'cpc')!.invertDelta).toBe(true)
    expect(kpis2.find((k) => k.key === 'cpl')!.invertDelta).toBe(true)
    // Non-cost metrics do not invert
    expect(kpis2.find((k) => k.key === 'ctr')!.invertDelta).toBeFalsy()
    expect(kpis2.find((k) => k.key === 'impressions')!.invertDelta).toBeFalsy()
  })

  test('without a comparison period the deltas stay undefined', () => {
    for (const key of ['impressions', 'ctr', 'cpc', 'cpl', 'convRate']) {
      expect(kpis.find((k) => k.key === key)!.delta).toBeUndefined()
    }
  })
})
