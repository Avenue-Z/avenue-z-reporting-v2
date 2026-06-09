// lib/aeo/bucket.test.ts
// Run: npx tsx lib/aeo/bucket.test.ts
import { strict as assert } from 'node:assert'
import { bucketDaily } from './bucket'
import type { DailyPoint } from './types'

const days: DailyPoint[] = [
  { date: '2026-02-09', visibility: 10 }, // Mon
  { date: '2026-02-10', visibility: 20 }, // Tue (same ISO week)
  { date: '2026-02-16', visibility: 30 }, // next Mon
  { date: '2026-03-02', visibility: 40 }, // March
  { date: '2026-04-06', visibility: 60 }, // Q2
]

// daily = passthrough, sorted
const daily = bucketDaily(days, 'daily')
assert.equal(daily.length, 5)
assert.equal(daily[0].key, '2026-02-09')
assert.equal(daily[0].visibility, 10)

// weekly = ISO Monday weeks, averaged within a week
const weekly = bucketDaily(days, 'weekly')
assert.equal(weekly[0].key, '2026-02-09')
assert.equal(weekly[0].visibility, 15) // (10+20)/2
assert.equal(weekly[1].key, '2026-02-16')

// monthly = calendar month, key 'YYYY-MM'
const monthly = bucketDaily(days, 'monthly')
assert.equal(monthly[0].key, '2026-02')
assert.equal(monthly[0].visibility, 20) // (10+20+30)/3
assert.equal(monthly.find((m) => m.key === '2026-03')?.visibility, 40)

// quarterly = 'YYYY-Qn'
const quarterly = bucketDaily(days, 'quarterly')
assert.equal(quarterly[0].key, '2026-Q1')
assert.equal(quarterly[1].key, '2026-Q2')
assert.equal(quarterly[1].visibility, 60)

// empty input
assert.deepEqual(bucketDaily([], 'weekly'), [])

console.log('bucket.test.ts: all assertions passed')
