import { strict as assert } from 'node:assert'
import { transformHero } from './hero'

const cfg = { googleAdsAccountId: '1', leadActions: [{ name: 'broker_group_lead', category: 'broker' as const }] }
const metrics = [{ Weekiso: '2026-W02', Cost: '500', Clicks: '40', Impressions: '900' }, { Weekiso: '2026-W01', Cost: '300', Clicks: '20', Impressions: '600' }]
const leadWeeks = [{ Weekiso: '2026-W02', ConversionTypeName: 'broker_group_lead', Conversions: '2' }, { Weekiso: '2026-W02', ConversionTypeName: 'Calls from ads', Conversions: '9' }]
const pts = transformHero(metrics, leadWeeks, cfg)
assert.deepEqual(pts.map((p) => p.week), ['2026-W01', '2026-W02'])  // sorted asc
assert.equal(pts[0].leads, 0)                                       // W01 had no leads
assert.equal(pts[1].leads, 2)                                       // calls excluded
console.log('ok')
