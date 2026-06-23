// lib/organic-social/kpis.test.ts
// Run: npx tsx --env-file=.env.local lib/organic-social/kpis.test.ts
// (--env-file: importing ./base transitively loads the DB client via ga4/client,
//  which throws at init without DATABASE_URL. The transform under test is pure.)
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { transformKpis } from './kpis'
import type { ReportsDataResponse, TotalMetric } from '@/lib/dash-social/types'

const fixture = JSON.parse(readFileSync(new URL('./__fixtures__/reports-total.json', import.meta.url), 'utf8')) as ReportsDataResponse<TotalMetric>
const kpis = transformKpis(fixture)

// Total Followers sums across the three CHANNEL entries (skipping the BRAND entry).
const followers = kpis.find((k) => k.key === 'totalFollowers')
assert.ok(followers, 'totalFollowers KPI present')
// fixture: IG 29 + FB 4993 + X (see fixture) — must exceed the largest single channel.
assert.ok(followers!.value >= 4993, 'followers summed across channels, BRAND entry skipped')
// Five cards, in order; engagement rate is a derived percent.
assert.deepEqual(kpis.map((k) => k.key), ['totalFollowers', 'netNewFollowers', 'impressions', 'engagements', 'engagementRate'])
const er = kpis.find((k) => k.key === 'engagementRate')!
assert.equal(er.suffix, '%', 'engagementRate is a percent KPI')
console.log('organic kpis: all assertions passed')
