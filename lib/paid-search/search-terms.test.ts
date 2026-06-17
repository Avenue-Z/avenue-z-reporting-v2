import { strict as assert } from 'node:assert'
import { transformSearchTerms } from './search-terms'

const cfg = { googleAdsAccountId: '1', leadActions: [{ name: 'broker_group_lead', category: 'broker' as const }] }
const metrics = [
  { Searchterm: 'dental insurance', Clicks: '80', Impressions: '1000', Cost: '300' },
  { Searchterm: 'broker benefits', Clicks: '40', Impressions: '500', Cost: '500' },
]
const leads = [
  { Searchterm: 'dental insurance', ConversionTypeName: 'broker_group_lead', Conversions: '2' },
  { Searchterm: 'broker benefits', ConversionTypeName: 'broker_group_lead', Conversions: '2' },
]
const rows = transformSearchTerms(metrics, leads, cfg)
assert.equal(rows[0].term, 'broker benefits') // equal leads(2) → higher cost(500) first
assert.equal(rows[0].cpl, 250)
console.log('ok')
