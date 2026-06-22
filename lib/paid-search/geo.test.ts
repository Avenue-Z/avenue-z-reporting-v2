import { strict as assert } from 'node:assert'
import { transformGeo } from './geo'

const cfg = { googleAdsAccountId: '1', leadActions: [{ name: 'broker_group_lead', category: 'broker' as const }] }
const metrics = [{ Region: 'Texas', Clicks: '100', Cost: '400' }, { Region: 'Ohio', Clicks: '50', Cost: '200' }]
const leads = [{ Region: 'Ohio', ConversionTypeName: 'broker_group_lead', Conversions: '5' }, { Region: 'Texas', ConversionTypeName: 'broker_group_lead', Conversions: '2' }]
const rows = transformGeo(metrics, leads, cfg)
assert.equal(rows[0].region, 'Ohio')   // 5 leads ranks first
assert.equal(rows[0].leads, 5)
console.log('ok')
