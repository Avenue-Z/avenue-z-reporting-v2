import { strict as assert } from 'node:assert'
import { transformGeo } from './geo'

const cfg = { googleAdsAccountId: '1', leadActions: [{ name: 'broker_group_lead', category: 'broker' as const }] }
const metrics = [
  { Region: 'Texas', Metroarea: 'Dallas-Ft. Worth TX', Clicks: '100', Cost: '400' },
  { Region: 'Texas', Metroarea: 'Houston TX',          Clicks: '60',  Cost: '250' },
  { Region: 'Ohio',  Metroarea: 'Columbus OH',         Clicks: '50',  Cost: '200' },
]
const leads = [
  { Region: 'Ohio',  Metroarea: 'Columbus OH',         ConversionTypeName: 'broker_group_lead', Conversions: '5' },
  { Region: 'Texas', Metroarea: 'Dallas-Ft. Worth TX', ConversionTypeName: 'broker_group_lead', Conversions: '2' },
  { Region: 'Texas', Metroarea: 'Houston TX',          ConversionTypeName: 'broker_group_lead', Conversions: '1' },
]
const rows = transformGeo(metrics, leads, cfg)

assert.equal(rows[0].region, 'Ohio')   // 5 leads ranks first
assert.equal(rows[0].leads, 5)
assert.equal(rows[1].region, 'Texas')  // 2 + 1 = 3 leads
assert.equal(rows[1].leads, 3)
assert.equal(rows[1].clicks, 160)      // region totals aggregate its DMAs
assert.equal(rows[1].dmas.length, 2)
assert.equal(rows[1].dmas[0].dma, 'Dallas-Ft. Worth TX') // 2 leads ranks first within region

console.log('ok')
