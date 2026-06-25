import { strict as assert } from 'node:assert'
import { transformKpis } from './kpis'

const cfg = { googleAdsAccountId: '4136001852', leadActions: [{ name: 'contact_individual_lead', category: 'contact' as const }] }
const totals = { Cost: '18915.79', Clicks: '10409', Impressions: '113718', Ctr: '9.15', CPC: '1.81' }
const actions = [{ ConversionTypeName: 'contact_individual_lead', Conversions: '14' }, { ConversionTypeName: 'Calls from ads', Conversions: '13' }]
const kpis = transformKpis(totals, actions, null, null, cfg)
const leads = kpis.find((k) => k.key === 'leads')!
assert.equal(leads.value, 14)                               // calls excluded
assert.equal(kpis.find((k) => k.key === 'cpl')!.value, Math.round(18915.79 / 14))
assert.equal(kpis.length, 8)

// Test delta-vs-compare logic: prior period is smaller, so expect positive deltas
const compareTotals = { Cost: '9457.90', Clicks: '5204', Impressions: '56859' }
const compareActionRows = [{ ConversionTypeName: 'contact_individual_lead', Conversions: '7' }]
const kpis2 = transformKpis(totals, actions, compareTotals, compareActionRows, cfg)

// Leads: 14 vs 7 → (14 - 7) / 7 * 100 = 100% increase
const leadsCard = kpis2.find((k) => k.key === 'leads')!
assert.ok(leadsCard.delta !== undefined, 'leads delta should be defined')
assert.ok(Math.abs(leadsCard.delta - 100) < 0.001, `leads delta should be ~100, got ${leadsCard.delta}`)

// Cost: 18915.79 vs 9457.90 → (18915.79 - 9457.90) / 9457.90 * 100 = ~100%
const costCard = kpis2.find((k) => k.key === 'cost')!
assert.ok(costCard.delta !== undefined, 'cost delta should be defined')
assert.ok(costCard.delta > 0, `cost delta should be > 0, got ${costCard.delta}`)

// Round 2: deltas present for all comparable metrics when a comparison period exists
for (const key of ['impressions', 'ctr', 'cpc', 'cpl', 'convRate']) {
  const card = kpis2.find((k) => k.key === key)!
  assert.ok(card.delta !== undefined, `${key} delta should be defined with a comparison period`)
}
// Cost-efficiency metrics invert delta coloring (down = good)
assert.equal(kpis2.find((k) => k.key === 'cpc')!.invertDelta, true)
assert.equal(kpis2.find((k) => k.key === 'cpl')!.invertDelta, true)
// Non-cost metrics do not invert
assert.ok(!kpis2.find((k) => k.key === 'ctr')!.invertDelta)
assert.ok(!kpis2.find((k) => k.key === 'impressions')!.invertDelta)
// Without a comparison period, the new deltas stay undefined
for (const key of ['impressions', 'ctr', 'cpc', 'cpl', 'convRate']) {
  assert.equal(kpis.find((k) => k.key === key)!.delta, undefined, `${key} delta should be undefined without comparison`)
}

console.log('ok')
