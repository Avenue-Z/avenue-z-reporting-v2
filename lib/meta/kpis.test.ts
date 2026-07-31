import { describe, expect, test } from 'vitest'
import { transformMetaKpis } from './kpis'

const totals = {
  cost: '5000',
  impressions: '200000',
  reach: '120000',
  Frequency: '1.67',
  inline_link_clicks: '3400',
  CTR: '0.017',
  CPM: '25',
  CPC: '1.47',
  landing_page_views: '2600',
  cost_per_landing_page_view: '1.92',
  action_post_engagement: '8000',
}

describe('transformMetaKpis', () => {
  test('core KPIs and derived rates', () => {
    const k = transformMetaKpis(totals, null)
    expect(k.length).toBe(12)
    expect(k.find((c) => c.key === 'spend')!.value).toBe(5000)
    expect(k.find((c) => c.key === 'reach')!.value).toBe(120000)
    // Engagement Rate derived = 8000 / 200000 * 100 = 4.0
    expect(k.find((c) => c.key === 'engRate')!.value).toBe(4)
    // CTR comes as a 0-1 fraction (0.017) and must render as percent (1.7)
    expect(k.find((c) => c.key === 'ctr')!.value).toBe(1.7)
  })

  test('Cost / LPV keeps cents (regression for the whole-dollar rounding defect)', () => {
    // The fixture carries 1.92; before the fix Math.round(1.92) rendered $2.
    const k = transformMetaKpis(totals, null)
    expect(k.find((c) => c.key === 'costPerLpv')!.value).toBe(1.92)

    // A sub-dollar Cost / LPV must not collapse to 0 (a real 42 cents rendered $0).
    const subDollar = transformMetaKpis({ ...totals, cost_per_landing_page_view: '0.42' }, null)
    expect(subDollar.find((c) => c.key === 'costPerLpv')!.value).toBe(0.42)

    // Cost / LPV rounds to 2dp, matching CPM and CPC.
    const threeDp = transformMetaKpis({ ...totals, cost_per_landing_page_view: '3.456' }, null)
    expect(threeDp.find((c) => c.key === 'costPerLpv')!.value).toBe(3.46)
  })
})
