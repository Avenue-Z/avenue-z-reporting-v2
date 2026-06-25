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

// Reach unavailable (LinkedIn returns null for ranges >~90 days) → show "—",
// drop the Frequency suffix, and suppress deltas. Must NOT render a false 0.
const noReach: Record<string, string> = { ...totals }
delete noReach.approximateUniqueImpressions
const k3 = transformLinkedInKpis(noReach, null)
const reach = k3.find((c) => c.key === 'reach')!
const freq = k3.find((c) => c.key === 'frequency')!
assert.equal(reach.value, '—')
assert.equal(reach.delta, undefined)
assert.equal(freq.value, '—')
assert.equal(freq.suffix, undefined)
assert.equal(freq.delta, undefined)
// a real zero reach ('0') is NOT treated as unavailable
const zeroReach = transformLinkedInKpis({ ...totals, approximateUniqueImpressions: '0' }, null)
assert.equal(zeroReach.find((c) => c.key === 'reach')!.value, 0)
console.log('ok')
