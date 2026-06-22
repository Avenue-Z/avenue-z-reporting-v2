// lib/linkedin/kpis.test.ts
// Run: npx tsx --env-file=.env.local lib/linkedin/kpis.test.ts
import { strict as assert } from 'node:assert'
import { transformLinkedInKpis } from './kpis'

const totals = {
  spend: '12000',
  impressions: '480000',
  approximateUniqueImpressions: '300000',
  clicks: '6000',
  ctr: '0.0125',
  cpm: '25',
  cpc: '2',
  landingPageClicks: '4000',
  oneClickLeads: '150',
  oneClickLeadsCost: '80',
  oneClickLeadFormOpens: '500',
  leadFormCompletionRate: '0.30',
}

const k = transformLinkedInKpis(totals, null)
assert.equal(k.length, 14)
assert.equal(k.find((c) => c.key === 'spend')!.value, 12000)
assert.equal(k.find((c) => c.key === 'reach')!.value, 300000)
// derived Frequency = 480000 / 300000 = 1.6
assert.equal(k.find((c) => c.key === 'frequency')!.value, 1.6)
// derived Cost per Visit = 12000 / 4000 = 3.00
assert.equal(k.find((c) => c.key === 'costPerVisit')!.value, 3)
assert.equal(k.find((c) => c.key === 'leads')!.value, 150)
// ctr / leadFormCompletionRate come as 0-1 fractions → render as percent
assert.equal(k.find((c) => c.key === 'ctr')!.value, 1.25)
assert.equal(k.find((c) => c.key === 'leadFormCompletionRate')!.value, 30)

// delta vs a prior period (spend 10000 → +20%)
const k2 = transformLinkedInKpis(totals, { ...totals, spend: '10000' })
assert.equal(k2.find((c) => c.key === 'spend')!.delta, 20)
console.log('ok')
