import { strict as assert } from 'node:assert'
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

const k = transformMetaKpis(totals, null)
assert.equal(k.length, 12)
assert.equal(k.find((c) => c.key === 'spend')!.value, 5000)
assert.equal(k.find((c) => c.key === 'reach')!.value, 120000)
// Engagement Rate derived = 8000 / 200000 * 100 = 4.0
assert.equal(k.find((c) => c.key === 'engRate')!.value, 4)
// CTR comes as a 0-1 fraction (0.017) and must render as percent (1.7)
assert.equal(k.find((c) => c.key === 'ctr')!.value, 1.7)

// Cost / LPV keeps cents, like every other per-unit cost KPI.
// The fixture above carries 1.92 and was never asserted, which is how the
// rounding defect survived: Math.round(1.92) rendered $2.
assert.equal(k.find((c) => c.key === 'costPerLpv')!.value, 1.92)

// A sub-dollar Cost / LPV must not collapse to 0. This is the client-visible
// case: a real cost of 42 cents was rendering as $0.
const subDollar = transformMetaKpis({ ...totals, cost_per_landing_page_view: '0.42' }, null)
assert.equal(subDollar.find((c) => c.key === 'costPerLpv')!.value, 0.42)

// Cost / LPV rounds to 2dp, matching CPM and CPC.
const threeDp = transformMetaKpis({ ...totals, cost_per_landing_page_view: '3.456' }, null)
assert.equal(threeDp.find((c) => c.key === 'costPerLpv')!.value, 3.46)

console.log('ok')
