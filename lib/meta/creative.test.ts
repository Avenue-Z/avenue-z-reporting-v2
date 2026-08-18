import { describe, expect, test } from 'vitest'
import { transformCreative, buildCreativeTree, creativeGrandTotals } from './creative'

describe('transformCreative (flat)', () => {
  test('sorts by spend desc and maps fields', () => {
    const rows = [
      { ad_name: 'Ad A', adcampaign_name: 'Awareness', adset_name: 'Set 1', adstatus: 'ACTIVE', cost: '300', impressions: '10000', reach: '8000', Frequency: '1.25', inline_link_clicks: '200', CTR: '2.0', CPC: '1.5', landing_page_views: '150', cost_per_landing_page_view: '2.0', action_post_engagement: '500' },
      { ad_name: 'Ad B', adcampaign_name: 'Traffic', adset_name: 'Set 2', adstatus: 'PAUSED', cost: '100', impressions: '5000', reach: '4000', Frequency: '1.25', inline_link_clicks: '80', CTR: '1.6', CPC: '1.25', landing_page_views: '60', cost_per_landing_page_view: '1.67', action_post_engagement: '180' },
    ]
    const out = transformCreative(rows)
    expect(out[0].ad).toBe('Ad A')                 // sorted by spend desc
    expect(out[0].campaign).toBe('Awareness')      // adcampaign_name -> campaign
    expect(out[0].adSet).toBe('Set 1')             // adset_name -> adSet
    expect(out[0].shareOfSpend).toBe(75)           // 300 / 400 * 100
  })
})

describe('buildCreativeTree + creativeGrandTotals', () => {
  const treeRows = [
    { ad_name: 'Ad A', adcampaign_name: 'Awareness', adset_name: 'Set 1', adstatus: 'ACTIVE', cost: '300', impressions: '8000', reach: '5000', Frequency: '1.6', inline_link_clicks: '200', CTR: '2.5', CPC: '1.5', landing_page_views: '150', cost_per_landing_page_view: '2.0', action_post_engagement: '500' },
    { ad_name: 'Ad C', adcampaign_name: 'Awareness', adset_name: 'Set 1', adstatus: 'ACTIVE', cost: '100', impressions: '4000', reach: '3000', Frequency: '1.3', inline_link_clicks: '100', CTR: '2.5', CPC: '1.0', landing_page_views: '50', cost_per_landing_page_view: '2.0', action_post_engagement: '200' },
    { ad_name: 'Ad B', adcampaign_name: 'Traffic', adset_name: 'Set 2', adstatus: 'PAUSED', cost: '100', impressions: '5000', reach: '4000', Frequency: '1.25', inline_link_clicks: '80', CTR: '1.6', CPC: '1.25', landing_page_views: '60', cost_per_landing_page_view: '1.67', action_post_engagement: '180' },
  ]

  test('aggregates the tree and recomputes derived metrics from sums', () => {
    const tree = buildCreativeTree(treeRows)
    expect(tree.length).toBe(2)                    // Awareness, Traffic
    expect(tree[0].name).toBe('Awareness')         // 400 spend, sorted desc
    expect(tree[0].spend).toBe(400)
    expect(tree[0].adSets.length).toBe(1)
    expect(tree[0].adSets[0].name).toBe('Set 1')
    expect(tree[0].adSets[0].ads.length).toBe(2)
    expect(tree[0].adSets[0].spend).toBe(400)
    // derived metrics recomputed from sums (NOT summed):
    expect(tree[0].frequency).toBe(1.5)            // impressions 12000, reach 8000
    expect(tree[0].ctr).toBe(2.5)                  // linkClicks 300 / impressions 12000 * 100
    expect(tree[0].cpc).toBe(1.33)                 // cost 400 / linkClicks 300
    expect(tree[0].costPerLpv).toBe(2)             // cost 400 / lpv 200
    expect(tree[0].shareOfSpend).toBe(80)          // 400 / 500 * 100
    expect(tree[1].name).toBe('Traffic')
    expect(tree[1].shareOfSpend).toBe(20)          // 100 / 500
    expect(tree[0].shareOfSpend + tree[1].shareOfSpend).toBe(100)
  })

  test('grand totals', () => {
    const totals = creativeGrandTotals(buildCreativeTree(treeRows))
    expect(totals.spend).toBe(500)
    expect(totals.impressions).toBe(17000)
    expect(totals.reach).toBe(12000)
    expect(totals.engagements).toBe(880)
    expect(totals.shareOfSpend).toBe(100)
  })
})

describe('Cost / LPV keeps cents at every level', () => {
  const centRows = [
    { ad_name: 'Ad D', adcampaign_name: 'Traffic', adset_name: 'Set 3', adstatus: 'ACTIVE', cost: '30', impressions: '4000', reach: '3000', Frequency: '1.3', inline_link_clicks: '90', CTR: '2.25', CPC: '0.33', landing_page_views: '100', cost_per_landing_page_view: '0.30', action_post_engagement: '120' },
    { ad_name: 'Ad E', adcampaign_name: 'Traffic', adset_name: 'Set 3', adstatus: 'ACTIVE', cost: '15', impressions: '2000', reach: '1500', Frequency: '1.33', inline_link_clicks: '40', CTR: '2.0', CPC: '0.38', landing_page_views: '100', cost_per_landing_page_view: '0.15', action_post_engagement: '60' },
  ]

  test('leaf rows read the field verbatim without collapsing sub-dollar values', () => {
    const centFlat = transformCreative(centRows)
    expect(centFlat[0].costPerLpv).toBe(0.3)   // Ad D, from the field
    expect(centFlat[1].costPerLpv).toBe(0.15)  // Ad E, from the field
  })

  test('aggregates recompute spend / lpv and keep cents', () => {
    // spend 45 / lpv 200 = 0.225 -> 0.23 at 2dp
    const centTree = buildCreativeTree(centRows)
    expect(centTree[0].spend).toBe(45)
    expect(centTree[0].lpv).toBe(200)
    expect(centTree[0].costPerLpv).toBe(0.23)
  })
})
