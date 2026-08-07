import { describe, expect, test, vi, type Mock } from 'vitest'
// kpis.ts imports ./base (→ lib/db → next-auth); mock it so jsdom can load the module.
vi.mock('@/lib/meta/base', () => ({ metaQuery: vi.fn(), resolveCompareIso: vi.fn() }))
import { getMetaKpis, transformMetaKpis } from './kpis'
import { metaQuery, resolveCompareIso } from './base'
import { money } from '@/lib/paid-media/format'

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
    // Money KPIs now carry the raw numeric value + format:'money'; the cents
    // rounding happens at display time in money(). The old defect was Math.round
    // in the transform collapsing 1.92 → $2 and 0.42 → $0.
    const k = transformMetaKpis(totals, null)
    const lpv = k.find((c) => c.key === 'costPerLpv')!
    expect(lpv.value).toBe(1.92)
    expect(lpv.format).toBe('money')
    expect(money(lpv.value as number)).toBe('$1.92')

    // A sub-dollar Cost / LPV must not collapse to $0 (a real 42 cents rendered $0).
    const subDollar = transformMetaKpis({ ...totals, cost_per_landing_page_view: '0.42' }, null)
    expect(money(subDollar.find((c) => c.key === 'costPerLpv')!.value as number)).toBe('$0.42')

    // Full precision is retained in the transform; money() rounds to 2dp at display.
    const threeDp = transformMetaKpis({ ...totals, cost_per_landing_page_view: '3.456' }, null)
    const raw = threeDp.find((c) => c.key === 'costPerLpv')!.value as number
    expect(raw).toBe(3.456)
    expect(money(raw)).toBe('$3.46')
  })

  test('money KPIs carry format:money and no $ prefix', () => {
    const k = transformMetaKpis(totals, null)
    for (const key of ['spend', 'cpm', 'cpc', 'costPerLpv']) {
      const kpi = k.find((c) => c.key === key)!
      expect(kpi.format).toBe('money')
      expect(kpi.prefix).toBeUndefined()
    }
  })

  test('attaches prior-period compareValue on spend and linkClicks', () => {
    const k = transformMetaKpis(
      { cost: '100', inline_link_clicks: '10' },
      { cost: '80', inline_link_clicks: '8' },
    )
    expect(k.find((x) => x.key === 'spend')!.compareValue).toBe(80)
    expect(k.find((x) => x.key === 'linkClicks')!.compareValue).toBe(8)
  })

  test('compareValue is undefined when there is no compare period', () => {
    const k = transformMetaKpis({ cost: '100', inline_link_clicks: '10' }, null)
    expect(k.find((x) => x.key === 'spend')!.compareValue).toBeUndefined()
  })

  test('compare-period fetch failure degrades to no-delta, current values preserved', async () => {
    // getMetaKpis's compare fetch is best-effort (.catch(() => null)); a failed
    // compare query must drop the delta + compareValue but keep the current values.
    ;(resolveCompareIso as Mock).mockReturnValue('2026-07-01,2026-07-31')
    ;(metaQuery as Mock).mockImplementation((_slug: string, _fields: string[], range: string) =>
      range === '2026-07-01,2026-07-31'
        ? Promise.reject(new Error('compare timeout'))
        : Promise.resolve([{ cost: '100', inline_link_clicks: '10' }]),
    )
    const k = await getMetaKpis('acme', 'last_30_days', 'previous_period')
    const spend = k.find((x) => x.key === 'spend')!
    expect(spend.value).toBe(100) // current value preserved
    expect(spend.delta).toBeUndefined() // compare failed → no delta
    expect(spend.compareValue).toBeUndefined()
  })
})
