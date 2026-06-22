// lib/linkedin/creative.test.ts
// Run: npx tsx --env-file=.env.local lib/linkedin/creative.test.ts
import { strict as assert } from 'node:assert'
import { transformCreative, creativeTotals } from './creative'

const rows = [
  { creativeDscName: 'Ad A', campaignName: 'Brokers', campaignGroupName: 'AVZ | Traffic | Prospecting', creativeStatus: 'ACTIVE', spend: '300', impressions: '10000', clicks: '120', ctr: '1.2', cpc: '2.5', oneClickLeads: '5', oneClickLeadsCost: '60', oneClickLeadFormOpens: '20', leadFormCompletionRate: '25', landingPageClicks: '80' },
  { creativeDscName: 'Ad B', campaignName: 'HR', campaignGroupName: 'AVZ | Lead Gen', creativeStatus: 'PAUSED', spend: '100', impressions: '4000', clicks: '40', ctr: '1.0', cpc: '2.5', oneClickLeads: '2', oneClickLeadsCost: '50', oneClickLeadFormOpens: '8', leadFormCompletionRate: '25', landingPageClicks: '30' },
]

const out = transformCreative(rows)
// sorted by spend desc
assert.equal(out[0].ad, 'Ad A')
assert.equal(out[0].audience, 'Brokers')          // Audience = campaignName
assert.equal(out[0].campaign, 'AVZ | Traffic | Prospecting') // Campaign = campaignGroupName
assert.equal(out[0].status, 'ACTIVE')
assert.equal(out[0].shareOfSpend, 75)              // 300 / 400 * 100
assert.equal(out[1].shareOfSpend, 25)
// blank ad name falls back
const fb = transformCreative([{ campaignName: 'X', campaignGroupName: 'Y', creativeStatus: 'ACTIVE', spend: '10', creativeId: '999' }])
assert.equal(fb[0].ad, '999')

const tot = creativeTotals(transformCreative(rows))
assert.equal(tot.spend, 400)
assert.equal(tot.impressions, 14000)
assert.equal(tot.clicks, 160)
assert.equal(tot.leads, 7)
assert.equal(tot.leadFormOpens, 28)
assert.equal(tot.landingPageClicks, 110)
console.log('ok')
