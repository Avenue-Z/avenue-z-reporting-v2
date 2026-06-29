// Run: npx tsx --env-file=.env.local lib/paid-search/hero.test.ts
import { strict as assert } from 'node:assert'
import { transformHero } from './hero'
import { bucketLabel } from './week-label'

const cfg = { googleAdsAccountId: '1', leadActions: [{ name: 'broker_group_lead', category: 'broker' as const }] }

// Weekly granularity (long ranges)
const metrics = [{ Yearweekiso: '2026|02', Cost: '500', Clicks: '40', Impressions: '900' }, { Yearweekiso: '2026|01', Cost: '300', Clicks: '20', Impressions: '600' }]
const leadWeeks = [{ Yearweekiso: '2026|02', ConversionTypeName: 'broker_group_lead', Conversions: '2' }, { Yearweekiso: '2026|02', ConversionTypeName: 'Calls from ads', Conversions: '9' }]
const pts = transformHero(metrics, leadWeeks, cfg, 'Yearweekiso')
assert.deepEqual(pts.map((p) => p.week), ['2026|01', '2026|02'])  // sorted asc
assert.equal(pts[0].leads, 0)                                       // W01 had no leads
assert.equal(pts[1].leads, 2)                                       // calls excluded

// Daily granularity (short ranges → one bar per day)
const dayMetrics = [{ Date: '2026-06-16', Cost: '50', Clicks: '4', Impressions: '90' }, { Date: '2026-06-15', Cost: '30', Clicks: '2', Impressions: '60' }]
const dayLeads = [{ Date: '2026-06-16', ConversionTypeName: 'broker_group_lead', Conversions: '1' }]
const dayPts = transformHero(dayMetrics, dayLeads, cfg, 'Date')
assert.deepEqual(dayPts.map((p) => p.week), ['2026-06-15', '2026-06-16'])  // sorted asc
assert.equal(dayPts[1].leads, 1)

// bucketLabel handles both key formats
assert.equal(bucketLabel('2026-06-15'), 'Jun 15')
assert.equal(bucketLabel('2026|01'), 'Dec 29')  // ISO week 1 of 2026 starts Mon Dec 29, 2025

console.log('ok')
