import { describe, expect, test, vi, type Mock } from 'vitest'
// Mock the DB lookup + the SM query, but keep the real isLeadAction so the pure
// transformKpis tests still scope leads correctly.
vi.mock('@/lib/db/queries', () => ({ getClientBySlug: vi.fn() }))
vi.mock('./base', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./base')>()
  return { ...actual, awQuery: vi.fn(), resolveCompareIso: vi.fn() }
})
import { getPaidSearchKpis, transformKpis } from './kpis'
import { awQuery, resolveCompareIso } from './base'
import { getClientBySlug } from '@/lib/db/queries'

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

  test('CPL is null (renders —) when there are no leads', () => {
    const noLeadTotals = { Cost: '500', Clicks: '100', Impressions: '2000' }
    const k = transformKpis(noLeadTotals, [], null, null, cfg)
    const cpl = k.find((c) => c.key === 'cpl')!
    expect(cpl.value).toBeNull()
    expect(cpl.delta).toBeUndefined()
  })

  test('attaches prior-period compareValue on cost, clicks and leads', () => {
    const k = transformKpis(
      { Cost: '100', Clicks: '10', Impressions: '1000' },
      [{ ConversionTypeName: 'contact_individual_lead', Conversions: '5' }],
      { Cost: '80', Clicks: '8', Impressions: '900' },
      [{ ConversionTypeName: 'contact_individual_lead', Conversions: '4' }],
      cfg,
    )
    expect(k.find((x) => x.key === 'cost')!.compareValue).toBe(80)
    expect(k.find((x) => x.key === 'clicks')!.compareValue).toBe(8)
    expect(k.find((x) => x.key === 'leads')!.compareValue).toBe(4)
  })

  test('compare-period fetch failure degrades to no-delta, current values preserved', async () => {
    // getPaidSearchKpis's compare totals + actions fetches are best-effort
    // (.catch(() => null)); a failed compare must drop delta + compareValue while
    // the current-period values remain intact.
    ;(getClientBySlug as Mock).mockResolvedValue({ paidSearchConfig: cfg })
    ;(resolveCompareIso as Mock).mockReturnValue('2026-07-01,2026-07-31')
    ;(awQuery as Mock).mockImplementation((_slug: string, fields: string[], range: string) => {
      if (range === '2026-07-01,2026-07-31') return Promise.reject(new Error('compare timeout'))
      if (fields.includes('ConversionTypeName'))
        return Promise.resolve([{ ConversionTypeName: 'contact_individual_lead', Conversions: '14' }])
      return Promise.resolve([{ Cost: '18915.79', Clicks: '10409', Impressions: '113718' }])
    })
    const k = await getPaidSearchKpis('acme', 'last_30_days', 'previous_period')
    const cost = k.find((x) => x.key === 'cost')!
    expect(cost.value).toBe(18915.79) // current value preserved
    expect(cost.delta).toBeUndefined() // compare failed → no delta
    expect(cost.compareValue).toBeUndefined()
    // Current-period leads still scope correctly off the successful main fetch.
    expect(k.find((x) => x.key === 'leads')!.value).toBe(14)
  })
})
