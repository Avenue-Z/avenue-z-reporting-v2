import { strict as assert } from 'node:assert'
import { transformHero } from './hero'

const cfg = { googleAdsAccountId: '1', leadActions: [{ name: 'broker_group_lead', category: 'broker' as const }] }
const metrics = [{ Yearweekiso: '2026|02', Cost: '500', Clicks: '40', Impressions: '900' }, { Yearweekiso: '2026|01', Cost: '300', Clicks: '20', Impressions: '600' }]
const leadWeeks = [{ Yearweekiso: '2026|02', ConversionTypeName: 'broker_group_lead', Conversions: '2' }, { Yearweekiso: '2026|02', ConversionTypeName: 'Calls from ads', Conversions: '9' }]
const pts = transformHero(metrics, leadWeeks, cfg)
assert.deepEqual(pts.map((p) => p.week), ['2026|01', '2026|02'])  // sorted asc
assert.equal(pts[0].leads, 0)                                       // W01 had no leads
assert.equal(pts[1].leads, 2)                                       // calls excluded
console.log('ok')
