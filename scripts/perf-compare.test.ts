/**
 * scripts/perf-compare.test.ts — unit tests for perf-compare's parser
 * and delta math. Run with: npx tsx scripts/perf-compare.test.ts
 */
import { strict as assert } from 'node:assert'
import { splitByBoundaries, perVendorDelta, type PerfEntry } from './perf-compare'

const sample: string[] = [
  // boundary: cold pass starts
  `PERF {"ts":"2026-05-28T18:00:00.000Z","vendor":"_walk","fn":"boundary","label":"cold","ms":0,"ok":true}`,
  // cold pass entries
  `PERF {"ts":"2026-05-28T18:00:00.100Z","vendor":"ga4","fn":"runReport","ms":400,"ok":true,"cached":false}`,
  `PERF {"ts":"2026-05-28T18:00:00.500Z","vendor":"ga4","fn":"runReport","ms":600,"ok":true,"cached":false}`,
  `PERF {"ts":"2026-05-28T18:00:01.000Z","vendor":"hubspot","fn":"getDeals","ms":800,"ok":true,"cached":false}`,
  // boundary: warm pass starts
  `PERF {"ts":"2026-05-28T18:00:30.000Z","vendor":"_walk","fn":"boundary","label":"warm","ms":0,"ok":true}`,
  // warm pass entries
  `PERF {"ts":"2026-05-28T18:00:30.100Z","vendor":"ga4","fn":"runReport","ms":2,"ok":true,"cached":true}`,
  `PERF {"ts":"2026-05-28T18:00:30.200Z","vendor":"ga4","fn":"runReport","ms":3,"ok":true,"cached":true}`,
  `PERF {"ts":"2026-05-28T18:00:30.300Z","vendor":"hubspot","fn":"getDeals","ms":2,"ok":true,"cached":true}`,
  // noise
  `not a perf line`,
]

const { cold, warm } = splitByBoundaries(sample, 'cold', 'warm')

// Boundary markers themselves must be excluded from both buckets.
assert.equal(cold.length, 3, 'cold bucket should have 3 entries, got ' + cold.length)
assert.equal(warm.length, 3, 'warm bucket should have 3 entries, got ' + warm.length)
assert.ok(cold.every((e: PerfEntry) => e.vendor !== '_walk'))
assert.ok(warm.every((e: PerfEntry) => e.vendor !== '_walk'))

const deltas = perVendorDelta(cold, warm)
const ga4 = deltas.find((d) => d.vendor === 'ga4')!
assert.equal(ga4.coldTotalMs, 1000)
assert.equal(ga4.warmTotalMs, 5)
assert.equal(ga4.deltaPct, -99)
assert.equal(ga4.hitRatePct, 100, 'all warm calls cached:true → 100% hit rate')

const hs = deltas.find((d) => d.vendor === 'hubspot')!
assert.equal(hs.coldTotalMs, 800)
assert.equal(hs.warmTotalMs, 2)
assert.equal(hs.hitRatePct, 100)

console.log('perf-compare.test: passed')
