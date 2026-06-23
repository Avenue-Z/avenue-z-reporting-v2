// Run: npx tsx --env-file=.env.local lib/organic-social/trends.test.ts
// (--env-file: importing ./base transitively loads the DB client via ga4/client,
//  which throws at init without DATABASE_URL. The transform under test is pure.)
import { strict as assert } from 'node:assert'
import { readFileSync } from 'node:fs'
import { transformTrend } from './trends'
import { METRICS } from './metrics'
import type { ReportsDataResponse, GraphMetric } from '@/lib/dash-social/types'

const fixture = JSON.parse(readFileSync(new URL('./__fixtures__/reports-graph.json', import.meta.url), 'utf8')) as ReportsDataResponse<GraphMetric>
const series = transformTrend(fixture, METRICS.totalFollowers)
assert.ok(series.channels.includes('Instagram'), 'Instagram series present')
assert.ok(series.points.length >= 28, 'a point per day in the window')
// each point has a date plus a numeric value per channel (nulls coerced to 0)
const p = series.points[0]
assert.ok('date' in p, 'point has date')
assert.ok(series.channels.every((c) => typeof p[c] === 'number'), 'point has numeric per-channel values')
// points are date-sorted ascending
for (let i = 1; i < series.points.length; i++) assert.ok(String(series.points[i - 1].date) <= String(series.points[i].date), 'sorted by date')
console.log('organic trends: all assertions passed')
