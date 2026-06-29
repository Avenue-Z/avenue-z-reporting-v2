// Run: npx tsx lib/triplewhale/discovery.test.ts
import { strict as assert } from 'node:assert'
import { isNumericType, parseColumns, twFields, twDistinctValues } from './discovery'

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
  console.log('ok')
}
main()
