// lib/dashboard/adapters/triplewhale.test.ts
// Run: npx tsx lib/dashboard/adapters/triplewhale.test.ts
import { strict as assert } from 'node:assert'
import { groupRowsFromTw, seriesPointsFromTw, buildTwGroupedKey, buildTwSeriesKey } from './triplewhale'

// groupRowsFromTw: SQL row shape { dim, value } → flat helper output.
{
  const rows = [
    { dim: 'Google', value: 1000 },
    { dim: 'Meta', value: 500 },
  ]
  assert.deepEqual(groupRowsFromTw(rows), [
    { dim: 'Google', value: 1000 },
    { dim: 'Meta',   value: 500 },
  ])
}
// groupRowsFromTw: numeric strings coerced; null/undefined → 0.
{
  const rows = [
    { dim: 'A', value: '100' },
    { dim: 'B', value: null },
    { dim: 'C', value: undefined },
  ] as unknown as { dim: unknown; value: unknown }[]
  assert.deepEqual(groupRowsFromTw(rows), [
    { dim: 'A', value: 100 },
    { dim: 'B', value: 0 },
    { dim: 'C', value: 0 },
  ])
}

// seriesPointsFromTw: bucket from DATE_TRUNC already ISO; sorted ascending.
{
  const rows = [
    { bucket: '2026-06-23', value: 150 },
    { bucket: '2026-06-22', value: 100 },
  ]
  assert.deepEqual(seriesPointsFromTw(rows), [
    { bucket: '2026-06-22', value: 100 },
    { bucket: '2026-06-23', value: 150 },
  ])
}
// seriesPointsFromTw: ISO timestamps trimmed to date.
{
  const rows = [{ bucket: '2026-06-22T00:00:00.000Z', value: 100 }]
  assert.deepEqual(seriesPointsFromTw(rows), [{ bucket: '2026-06-22', value: 100 }])
}

// buildTwGroupedKey shape.
{
  const b = { source: 'triplewhale' as const, metric: 'ad_spend' }
  const k = buildTwGroupedKey(b, 'channel', '2026-06-01,2026-06-30')
  assert.equal(k[0], 'tw-grouped')
  assert.equal(k[1], 'ad_spend')
  assert.equal(k[2], 'channel')
  assert.equal(k[3], '2026-06-01,2026-06-30')
  assert.equal(k[4], '')                  // no filters → empty
}
// buildTwSeriesKey shape.
{
  const b = { source: 'triplewhale' as const, metric: 'revenue', filters: [{ column: 'country', values: ['US'] }] }
  const k = buildTwSeriesKey(b, 'week', '2026-06-01,2026-06-30')
  assert.equal(k[0], 'tw-series')
  assert.equal(k[1], 'revenue')
  assert.equal(k[2], 'week')
  assert.equal(k[3], '2026-06-01,2026-06-30')
  assert.match(k[4], /country = 'US'/)    // filter string serialized
}

console.log('ok')
