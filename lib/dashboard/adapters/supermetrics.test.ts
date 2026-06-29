// lib/dashboard/adapters/supermetrics.test.ts
// Run: npx tsx lib/dashboard/adapters/supermetrics.test.ts
import { strict as assert } from 'node:assert'
import { sumMetric, accountDrift, buildSmFilter } from './supermetrics'

// sumMetric: sums a field across rows, treating blanks/missing as 0.
const rows: Record<string, string>[] = [{ Cost: '8824.99' }, { Cost: '3283.43' }, { Cost: '' }, {}]
assert.equal(Math.round(sumMetric(rows, 'Cost')), 12108)
assert.equal(sumMetric([], 'Cost'), 0)

// accountDrift: returns accounts present in `returned` but absent from `expected`.
assert.deepEqual(accountDrift(['123', '999'], ['123']), ['999'])
assert.deepEqual(accountDrift(['123'], ['123', '456']), []) // subset → no drift
assert.deepEqual(accountDrift(['123'], undefined), [])       // no expectation → never drift

// resolveSmApiKey: per-client var wins; otherwise global SUPERMETRICS_API_KEY
import { resolveSmApiKey } from './supermetrics'

// per-client var present → use it
assert.equal(resolveSmApiKey('SM_X', { SM_X: 'perclient', SUPERMETRICS_API_KEY: 'global' } as unknown as NodeJS.ProcessEnv), 'perclient')
// per-client var name set but value missing → fall back to global
assert.equal(resolveSmApiKey('SM_X', { SUPERMETRICS_API_KEY: 'global' } as unknown as NodeJS.ProcessEnv), 'global')
// no per-client var name → global
assert.equal(resolveSmApiKey(null, { SUPERMETRICS_API_KEY: 'global' } as unknown as NodeJS.ProcessEnv), 'global')
// neither → undefined
assert.equal(resolveSmApiKey(null, {} as unknown as NodeJS.ProcessEnv), undefined)

// buildSmFilter: OR within a row, AND across rows; unsafe/empty dropped
assert.equal(buildSmFilter(undefined), undefined)
assert.equal(buildSmFilter([]), undefined)
assert.equal(buildSmFilter([{ column: 'order_shipping_country', values: ['United States'] }]), 'order_shipping_country == United States')
assert.equal(
  buildSmFilter([{ column: 'channel', values: ['google-ads', 'facebook-ads'] }]),
  '(channel == google-ads OR channel == facebook-ads)',
)
assert.equal(
  buildSmFilter([
    { column: 'channel', values: ['google-ads', 'facebook-ads'] },
    { column: 'order_shipping_country', values: ['United States'] },
  ]),
  '(channel == google-ads OR channel == facebook-ads) AND order_shipping_country == United States',
)
// unsafe column or all-empty values dropped
assert.equal(buildSmFilter([{ column: 'bad col', values: ['x'] }]), undefined)
assert.equal(buildSmFilter([{ column: 'a', values: [''] }]), undefined)
assert.equal(buildSmFilter([{ column: 'a', values: ['', 'x'] }]), 'a == x')

// ─────────────────────────────────────────────────────────────────────────
// Grouped + series pure helpers
// ─────────────────────────────────────────────────────────────────────────
import { groupRowsFromSm, seriesPointsFromSm, buildSmGroupedKey, buildSmSeriesKey } from './supermetrics'

// groupRowsFromSm: extracts {dim, value} per row; blanks coerced to 0.
{
  const rows: Record<string, string>[] = [
    { Channel: 'Google', SocialSpend: '1000' },
    { Channel: 'Meta',   SocialSpend: '500'  },
    { Channel: 'TikTok', SocialSpend: ''     },
  ]
  assert.deepEqual(groupRowsFromSm(rows, 'Channel', 'SocialSpend'), [
    { dim: 'Google', value: 1000 },
    { dim: 'Meta',   value: 500 },
    { dim: 'TikTok', value: 0 },
  ])
}

// seriesPointsFromSm: extracts {bucket, value}; bucket normalized via normalizeSmBucket; sorted ascending.
{
  const rows: Record<string, string>[] = [
    { Date: '2026-06-23', Cost: '150' },
    { Date: '2026-06-22', Cost: '100' },
  ]
  assert.deepEqual(seriesPointsFromSm(rows, 'Date', 'Cost', 'day'), [
    { bucket: '2026-06-22', value: 100 },
    { bucket: '2026-06-23', value: 150 },
  ])
}

// buildSmGroupedKey: encodes the §9 matrix exactly.
{
  const b = { source: 'supermetrics' as const, dsId: 'AW', metricField: 'Cost', account: '1' }
  const key = buildSmGroupedKey(b, 'Channel', '2026-06-01,2026-06-30', 'k')
  assert.equal(key[0], 'sm-grouped')
  assert.equal(key[1], 'AW')
  assert.equal(key[2], '1')
  assert.equal(key[3], 'Cost')
  assert.equal(key[4], 'Channel')
  assert.equal(key[5], '2026-06-01,2026-06-30')
  assert.equal(key[6], '')                // no filters → empty string
  assert.equal(typeof key[7], 'string')   // keyHash present
  assert.equal(key[7].length, 16)
}
// buildSmGroupedKey: filters present → filter string in slot 6.
{
  const b = { source: 'supermetrics' as const, dsId: 'AW', metricField: 'Cost', account: '1', filters: [{ column: 'country', values: ['US'] }] }
  const key = buildSmGroupedKey(b, 'Channel', '2026-06-01,2026-06-30', 'k')
  assert.equal(key[6], 'country == US')
}
// buildSmSeriesKey: granularity in slot 4.
{
  const b = { source: 'supermetrics' as const, dsId: 'AW', metricField: 'Cost', account: '1' }
  const key = buildSmSeriesKey(b, 'week', '2026-06-01,2026-06-30', 'k')
  assert.equal(key[0], 'sm-series')
  assert.equal(key[4], 'week')
}
// Cache key isolation: grouped vs series prefixes distinct from scalar.
{
  const b = { source: 'supermetrics' as const, dsId: 'AW', metricField: 'Cost', account: '1' }
  assert.equal(buildSmGroupedKey(b, 'Channel', 'r', 'k')[0], 'sm-grouped')
  assert.equal(buildSmSeriesKey(b, 'day', 'r', 'k')[0], 'sm-series')
}

console.log('ok')
