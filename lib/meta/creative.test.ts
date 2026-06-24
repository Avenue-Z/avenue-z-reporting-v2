import { strict as assert } from 'node:assert'
import { transformCreative, creativeTotals } from './creative'

const rows = [
  { ad_name: 'Ad A', adcampaign_name: 'Awareness', adstatus: 'ACTIVE', cost: '300', impressions: '10000', reach: '8000', Frequency: '1.25', inline_link_clicks: '200', CTR: '2.0', CPC: '1.5', landing_page_views: '150', cost_per_landing_page_view: '2.0', action_post_engagement: '500' },
  { ad_name: 'Ad B', adcampaign_name: 'Traffic', adstatus: 'PAUSED', cost: '100', impressions: '5000', reach: '4000', Frequency: '1.25', inline_link_clicks: '80', CTR: '1.6', CPC: '1.25', landing_page_views: '60', cost_per_landing_page_view: '1.67', action_post_engagement: '180' },
]

const out = transformCreative(rows)
assert.equal(out[0].ad, 'Ad A')                 // sorted by spend desc
assert.equal(out[0].campaign, 'Awareness')      // adcampaign_name maps to campaign
assert.equal(out[0].shareOfSpend, 75)           // 300 / 400 * 100
assert.equal(out[1].shareOfSpend, 25)
assert.equal(out[0].status, 'ACTIVE')

const tot = creativeTotals(transformCreative(rows))
assert.equal(tot.cost, 400)
assert.equal(tot.impressions, 15000)
assert.equal(tot.reach, 12000)
assert.equal(tot.linkClicks, 280)
assert.equal(tot.lpv, 210)
assert.equal(tot.engagements, 680)
console.log('ok')
