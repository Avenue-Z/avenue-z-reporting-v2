// lib/linkedin/creative.test.ts
// Run: npx tsx --env-file=.env.local lib/linkedin/creative.test.ts
import { strict as assert } from 'node:assert'
import { transformCreative, buildCreativeTree, creativeGrandTotals } from './creative'

// --- flat leaf transform ---
const rows = [
  { creativeDscName: 'Ad A', campaignName: 'Brokers', campaignGroupName: 'Prospecting', creativeStatus: 'ACTIVE', spend: '300', impressions: '10000', clicks: '120', ctr: '0.012', cpc: '2.5', oneClickLeads: '5', oneClickLeadsCost: '60', oneClickLeadFormOpens: '20', leadFormCompletionRate: '0.25', landingPageClicks: '80' },
  { creativeDscName: 'Ad B', campaignName: 'HR', campaignGroupName: 'Lead Gen', creativeStatus: 'PAUSED', spend: '100', impressions: '4000', clicks: '40', ctr: '0.010', cpc: '2.5', oneClickLeads: '2', oneClickLeadsCost: '50', oneClickLeadFormOpens: '8', leadFormCompletionRate: '0.25', landingPageClicks: '30' },
]
const out = transformCreative(rows)
assert.equal(out[0].ad, 'Ad A')                  // sorted by spend desc
assert.equal(out[0].campaign, 'Brokers')         // campaignName -> campaign
assert.equal(out[0].campaignGroup, 'Prospecting')// campaignGroupName -> campaignGroup
assert.equal(out[0].status, 'ACTIVE')
assert.equal(out[0].shareOfSpend, 75)            // 300 / 400 * 100
// blank ad name falls back to creativeId
const fb = transformCreative([{ campaignName: 'X', campaignGroupName: 'Y', creativeStatus: 'ACTIVE', spend: '10', creativeId: '999' }])
assert.equal(fb[0].ad, '999')

// --- tree build: Campaign Group -> Campaign -> Ad ---
const treeRows = [
  { creativeDscName: 'Ad A', campaignName: 'Brokers', campaignGroupName: 'Prospecting', creativeStatus: 'ACTIVE', spend: '300', impressions: '8000', clicks: '200', ctr: '0.025', cpc: '1.5', oneClickLeads: '6', oneClickLeadsCost: '50', oneClickLeadFormOpens: '20', leadFormCompletionRate: '0.30', landingPageClicks: '100' },
  { creativeDscName: 'Ad C', campaignName: 'Brokers', campaignGroupName: 'Prospecting', creativeStatus: 'ACTIVE', spend: '100', impressions: '4000', clicks: '100', ctr: '0.025', cpc: '1.0', oneClickLeads: '2', oneClickLeadsCost: '50', oneClickLeadFormOpens: '10', leadFormCompletionRate: '0.20', landingPageClicks: '50' },
  { creativeDscName: 'Ad B', campaignName: 'HR', campaignGroupName: 'Lead Gen', creativeStatus: 'PAUSED', spend: '100', impressions: '5000', clicks: '50', ctr: '0.010', cpc: '2.0', oneClickLeads: '1', oneClickLeadsCost: '100', oneClickLeadFormOpens: '5', leadFormCompletionRate: '0.20', landingPageClicks: '25' },
]
const tree = buildCreativeTree(treeRows)
// grand total spend = 500
assert.equal(tree.length, 2)                     // Prospecting, Lead Gen
assert.equal(tree[0].name, 'Prospecting')        // 400 spend, sorted desc
assert.equal(tree[0].spend, 400)
assert.equal(tree[0].campaigns.length, 1)
assert.equal(tree[0].campaigns[0].name, 'Brokers')
assert.equal(tree[0].campaigns[0].ads.length, 2)
assert.equal(tree[0].campaigns[0].spend, 400)
// derived metrics recomputed from sums (NOT summed):
// impressions 12000, clicks 300 -> ctr 300/12000*100 = 2.5
assert.equal(tree[0].ctr, 2.5)
// spend 400 / clicks 300 = 1.33
assert.equal(tree[0].cpc, 1.33)
// spend 400 / leads 8 = 50
assert.equal(tree[0].costPerLead, 50)
// leads 8 / leadFormOpens 30 * 100 = 26.7
assert.equal(tree[0].leadFormCompletionRate, 26.7)
// share of grand total: 400 / 500 * 100 = 80
assert.equal(tree[0].shareOfSpend, 80)
assert.equal(tree[1].name, 'Lead Gen')
assert.equal(tree[1].shareOfSpend, 20)           // 100 / 500
assert.equal(tree[0].shareOfSpend + tree[1].shareOfSpend, 100)

// --- grand totals ---
const totals = creativeGrandTotals(tree)
assert.equal(totals.spend, 500)
assert.equal(totals.impressions, 17000)
assert.equal(totals.clicks, 350)
assert.equal(totals.leads, 9)
assert.equal(totals.leadFormOpens, 35)
assert.equal(totals.landingPageClicks, 175)
assert.equal(totals.shareOfSpend, 100)
console.log('ok')
