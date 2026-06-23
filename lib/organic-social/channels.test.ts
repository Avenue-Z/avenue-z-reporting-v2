// Run: npx tsx --env-file=.env.local lib/organic-social/channels.test.ts
// (--env-file: importing ./base transitively loads the DB client via ga4/client,
//  which throws at init without DATABASE_URL. The transform under test is pure.)
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { transformChannels } from './channels'
import type { ReportsDataResponse, TotalMetric } from '@/lib/dash-social/types'

const fixture = JSON.parse(readFileSync(new URL('./__fixtures__/reports-total.json', import.meta.url), 'utf8')) as ReportsDataResponse<TotalMetric>
const rows = transformChannels(fixture)
// 3 CHANNEL entries (IG/FB/X); the BRAND entry must NOT become a row.
assert.equal(rows.length, 3, 'one row per channel, BRAND entry skipped')
assert.ok(rows.every((r) => typeof r.followers === 'number'), 'numeric followers')
assert.ok(rows.some((r) => r.channel === 'Facebook' && r.followers === 4993), 'Facebook row mapped from fixture')
console.log('organic channels: all assertions passed')
