import { strict as assert } from 'node:assert'
import { transformCreative, buildCreativeTree, creativeGrandTotals } from './creative'

// --- flat transform (unchanged behavior) ---
const rows = [
  { ad_name: 'Ad A', adcampaign_name: 'Awareness', adset_name: 'Set 1', adstatus: 'ACTIVE', cost: '300', impressions: '10000', reach: '8000', Frequency: '1.25', inline_link_clicks: '200', CTR: '2.0', CPC: '1.5', landing_page_views: '150', cost_per_landing_page_view: '2.0', action_post_engagement: '500' },
  { ad_name: 'Ad B', adcampaign_name: 'Traffic', adset_name: 'Set 2', adstatus: 'PAUSED', cost: '100', impressions: '5000', reach: '4000', Frequency: '1.25', inline_link_clicks: '80', CTR: '1.6', CPC: '1.25', landing_page_views: '60', cost_per_landing_page_view: '1.67', action_post_engagement: '180' },
]
const out = transformCreative(rows)
assert.equal(out[0].ad, 'Ad A')                 // sorted by spend desc
assert.equal(out[0].campaign, 'Awareness')      // adcampaign_name -> campaign
assert.equal(out[0].adSet, 'Set 1')             // adset_name -> adSet
assert.equal(out[0].shareOfSpend, 75)           // 300 / 400 * 100

// --- tree build + aggregation ---
const treeRows = [
  { ad_name: 'Ad A', adcampaign_name: 'Awareness', adset_name: 'Set 1', adstatus: 'ACTIVE', cost: '300', impressions: '8000', reach: '5000', Frequency: '1.6', inline_link_clicks: '200', CTR: '2.5', CPC: '1.5', landing_page_views: '150', cost_per_landing_page_view: '2.0', action_post_engagement: '500' },
  { ad_name: 'Ad C', adcampaign_name: 'Awareness', adset_name: 'Set 1', adstatus: 'ACTIVE', cost: '100', impressions: '4000', reach: '3000', Frequency: '1.3', inline_link_clicks: '100', CTR: '2.5', CPC: '1.0', landing_page_views: '50', cost_per_landing_page_view: '2.0', action_post_engagement: '200' },
  { ad_name: 'Ad B', adcampaign_name: 'Traffic', adset_name: 'Set 2', adstatus: 'PAUSED', cost: '100', impressions: '5000', reach: '4000', Frequency: '1.25', inline_link_clicks: '80', CTR: '1.6', CPC: '1.25', landing_page_views: '60', cost_per_landing_page_view: '1.67', action_post_engagement: '180' },
]
const tree = buildCreativeTree(treeRows)
// grand total spend = 500
assert.equal(tree.length, 2)                    // Awareness, Traffic
assert.equal(tree[0].name, 'Awareness')         // 400 spend, sorted desc
assert.equal(tree[0].spend, 400)
assert.equal(tree[0].adSets.length, 1)
assert.equal(tree[0].adSets[0].name, 'Set 1')
assert.equal(tree[0].adSets[0].ads.length, 2)
assert.equal(tree[0].adSets[0].spend, 400)
// derived metrics recomputed from sums (NOT summed):
// impressions 12000, reach 8000 -> frequency 1.5
assert.equal(tree[0].frequency, 1.5)
// linkClicks 300 / impressions 12000 * 100 = 2.5
assert.equal(tree[0].ctr, 2.5)
// cost 400 / linkClicks 300 = 1.33
assert.equal(tree[0].cpc, 1.33)
// cost 400 / lpv 200 = 2
assert.equal(tree[0].costPerLpv, 2)
// share of grand total: 400 / 500 * 100 = 80
assert.equal(tree[0].shareOfSpend, 80)
assert.equal(tree[1].name, 'Traffic')
assert.equal(tree[1].shareOfSpend, 20)          // 100 / 500
assert.equal(tree[0].shareOfSpend + tree[1].shareOfSpend, 100)

// --- grand totals ---
const totals = creativeGrandTotals(tree)
assert.equal(totals.spend, 500)
assert.equal(totals.impressions, 17000)
assert.equal(totals.reach, 12000)
assert.equal(totals.engagements, 880)
assert.equal(totals.shareOfSpend, 100)
console.log('ok')
