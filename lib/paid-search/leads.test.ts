// Run: npx tsx --env-file=.env.local lib/paid-search/leads.test.ts
import { strict as assert } from 'node:assert'
import { transformLeads } from './leads'

const cfg = {
  googleAdsAccountId: '4136001852',
  leadActions: [
    { name: 'employer_dental_lead', category: 'employer' as const },
    { name: 'employer_vision_lead', category: 'employer' as const }, // absent in data → must show 0
    { name: 'broker_group_lead', category: 'broker' as const },
    { name: 'contact_individual_lead', category: 'contact' as const },
  ],
}
const actionRows = [
  { ConversionTypeName: 'contact_individual_lead', Conversions: '14' },
  { ConversionTypeName: 'broker_group_lead', Conversions: '3' },
  { ConversionTypeName: 'employer_dental_lead', Conversions: '3' },
  { ConversionTypeName: 'Calls from ads', Conversions: '13' }, // excluded
]
const weeklyRows = [
  { Weekiso: '2026-W01', ConversionTypeName: 'contact_individual_lead', Conversions: '2' },
  { Weekiso: '2026-W01', ConversionTypeName: 'Calls from ads', Conversions: '5' }, // excluded
]
const b = transformLeads(actionRows, weeklyRows, cfg)
assert.equal(b.totalLeads, 20)                 // 14+3+3, calls excluded
assert.equal(b.categoryTotals.employer, 3)     // dental 3 + vision 0
assert.equal(b.categoryTotals.contact, 14)
assert.equal(b.byAction.find((a) => a.name === 'employer_vision_lead')!.count, 0) // absent → 0
assert.equal(b.weekly[0].leads, 2)             // calls excluded from weekly
console.log('ok')
