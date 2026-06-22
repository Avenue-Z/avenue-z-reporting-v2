import { strict as assert } from 'node:assert'
import { transformMetaKpis } from './kpis'

const totals = {
  cost: '5000',
  impressions: '200000',
  reach: '120000',
  Frequency: '1.67',
  inline_link_clicks: '3400',
  CTR: '1.7',
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
console.log('ok')
