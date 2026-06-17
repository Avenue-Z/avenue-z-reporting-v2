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
console.log('ok')
