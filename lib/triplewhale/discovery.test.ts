// Run: npx tsx lib/triplewhale/discovery.test.ts
import { strict as assert } from 'node:assert'
import { isNumericType, parseColumns, twFields, twDistinctValues, onlyPopulatedMetrics } from './discovery'

// numeric ClickHouse types (Nullable unwrapped); strings/dates are not numeric
assert.equal(isNumericType('Nullable(Float64)'), true)
assert.equal(isNumericType('Float64'), true)
assert.equal(isNumericType('Nullable(Int64)'), true)
assert.equal(isNumericType('UInt32'), true)
assert.equal(isNumericType('Nullable(Decimal(38, 9))'), true)
assert.equal(isNumericType('Nullable(String)'), false)
assert.equal(isNumericType('Nullable(Date)'), false)

// parseColumns splits numeric -> metrics, string -> dimensions; humanizes labels
{
  const f = parseColumns([
    { name: 'spend', type: 'Nullable(Float64)' },
    { name: 'channel', type: 'Nullable(String)' },
    { name: 'event_date', type: 'Nullable(Date)' },
    { name: 'clicks', type: 'Nullable(Int64)' },
  ])
  assert.deepEqual(f.metrics.map((m) => m.value), ['spend', 'clicks'])
  assert.deepEqual(f.dimensions.map((d) => d.value), ['channel'])
  assert.equal(f.metrics[0].label, 'Spend')
}

const fake = (body: unknown): typeof fetch =>
  (async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => body }) as unknown as Response) as unknown as typeof fetch

async function main() {
  const range = { startDate: '2026-06-01', endDate: '2026-06-23' }
  const fields = await twFields('k', 'shop', range, {
    fetchImpl: fake([{ name: 'spend', type: 'Nullable(Float64)' }, { name: 'channel', type: 'Nullable(String)' }]),
  })
  assert.deepEqual(fields.metrics.map((m) => m.value), ['spend'])
  assert.deepEqual(fields.dimensions.map((d) => d.value), ['channel'])

  const vals = await twDistinctValues('k', 'shop', 'channel', range, {
    fetchImpl: fake([{ value: 'facebook-ads' }, { value: 'google-ads' }, { value: null }]),
  })
  assert.deepEqual(vals, ['facebook-ads', 'google-ads'])

  // unsafe column rejected
  await assert.rejects(twDistinctValues('k', 'shop', 'bad; DROP', range, { fetchImpl: fake([]) }))

  // onlyPopulatedMetrics drops columns that sum to 0/null for this shop
  const metrics = [
    { value: 'spend', label: 'Spend' },
    { value: 'gross_sales', label: 'Gross Sales' }, // unpopulated → 0
    { value: 'sessions', label: 'Sessions' },
  ]
  const kept = await onlyPopulatedMetrics('k', 'shop', metrics, range, {
    fetchImpl: fake([{ v0: 2017499, v1: 0, v2: 2855400 }]),
  })
  assert.deepEqual(kept.map((m) => m.value), ['spend', 'sessions']) // gross_sales dropped

  // degrades to the full list if the probe query fails (never breaks the picker)
  const failFetch = (async () => ({ ok: false, status: 400, headers: { get: () => null } }) as unknown as Response) as unknown as typeof fetch
  const onErr = await onlyPopulatedMetrics('k', 'shop', metrics, range, { fetchImpl: failFetch })
  assert.deepEqual(onErr.map((m) => m.value), ['spend', 'gross_sales', 'sessions'])

  console.log('ok')
}
main()
