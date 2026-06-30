// lib/dashboard/charts.test.ts
// Run: npx tsx lib/dashboard/charts.test.ts
import { strict as assert } from 'node:assert'
import { toLineChartInput, bucketLabelPattern, toCapsuleBarInput, robustMax } from './charts'
import type { GroupedResult, SeriesResult } from './types'

// bucketLabelPattern: documented format strings.
assert.equal(bucketLabelPattern('day'), 'MMM d')
assert.equal(bucketLabelPattern('week'), "'Wk' w")
assert.equal(bucketLabelPattern('month'), 'MMM yy')

// robustMax: far-out outliers don't set the scale; clean data is unchanged.
assert.equal(robustMax([10, 20, 30, 40]), 40)                                  // no outlier → true max
assert.equal(robustMax([0.86, 3.38, 3.65, 8.98, 25.87, 337650]), 25.87)        // conv_rate: drop the 337650% freak
assert.equal(robustMax([]), 0)                                                 // empty
assert.equal(robustMax([0, 0, 0]), 0)                                          // zeros excluded → 0
assert.equal(robustMax([3, 5, 100]), 5)                                        // small-N: 100 ≥ 5×5 → outlier
assert.equal(robustMax([5, 20]), 20)                                           // small-N: 20 < 5×5 → not an outlier

// toLineChartInput: bucketLabel produced via date-fns format(bucketLabelPattern(g)).
{
  const r: Extract<SeriesResult, { ok: true }> = {
    ok: true,
    format: 'currency',
    granularity: 'day',
    points: [
      { bucket: '2026-06-22', value: 100 },
      { bucket: '2026-06-23', value: 150 },
    ],
  }
  const out = toLineChartInput(r)
  assert.equal(out.granularity, 'day')
  assert.equal(out.hasCompare, false)
  assert.equal(out.data.length, 2)
  assert.equal(out.data[0].bucket, '2026-06-22')
  // date-fns format of 2026-06-22 with 'MMM d' = 'Jun 22'.
  assert.equal(out.data[0].bucketLabel, 'Jun 22')
}

// toLineChartInput: hasCompare true iff any point has prevValue.
{
  const r: Extract<SeriesResult, { ok: true }> = {
    ok: true, format: 'number', granularity: 'week',
    points: [
      { bucket: '2026-06-22', value: 10, prevValue: 8 },
      { bucket: '2026-06-29', value: 12 },
    ],
  }
  const out = toLineChartInput(r)
  assert.equal(out.hasCompare, true)
  assert.equal(out.data[0].prevValue, 8)
  assert.equal('prevValue' in out.data[1], false)
  // 2026-06-22 is week 26 → "'Wk' w" → 'Wk 26'.
  assert.equal(out.data[0].bucketLabel, 'Wk 26')
}

// toLineChartInput: empty points → empty data + hasCompare false.
{
  const r: Extract<SeriesResult, { ok: true }> = { ok: true, format: 'number', granularity: 'month', points: [] }
  const out = toLineChartInput(r)
  assert.deepEqual(out.data, [])
  assert.equal(out.hasCompare, false)
}

// toCapsuleBarInput: flatten dim, pct of total, carry prior, hasCompare.
{
  const r: Extract<GroupedResult, { ok: true }> = {
    ok: true, format: 'number',
    rows: [
      { dim: { Channel: 'A' }, value: 75, prevValue: 50 },
      { dim: { Channel: 'B' }, value: 25 },
    ],
  }
  const out = toCapsuleBarInput(r)
  assert.equal(out.dimKey, 'Channel')
  assert.deepEqual(out.rows, [
    { name: 'A', key: 'A', value: 75, pct: 75, prior: 50 },
    { name: 'B', key: 'B', value: 25, pct: 25 },
  ])
  assert.equal(out.hasCompare, true)
}

// toCapsuleBarInput: topN caps to the top N by value + a summed "Other" bar.
{
  const r: Extract<GroupedResult, { ok: true }> = {
    ok: true, format: 'number',
    rows: [
      { dim: { C: 'a' }, value: 10, prevValue: 5 },
      { dim: { C: 'b' }, value: 100, prevValue: 40 },
      { dim: { C: 'c' }, value: 30 },
      { dim: { C: 'd' }, value: 20, prevValue: 8 },
      { dim: { C: 'e' }, value: 40 },
    ],
  }
  const out = toCapsuleBarInput(r, undefined, 2) // total 200; sorted: b,e,c,d,a
  assert.deepEqual(out.rows.map((x) => x.key), ['b', 'e', '__other__'])
  assert.equal(out.rows[0].value, 100) // b
  assert.equal(out.rows[0].pct, 50)
  assert.equal(out.rows[2].name, 'Other')
  assert.equal(out.rows[2].value, 60) // c30 + d20 + a10
  assert.equal(out.rows[2].pct, 30) // 60/200
  assert.equal(out.rows[2].prior, 13) // d8 + a5 (c has none)
  // topN >= row count → no "Other", just sorted desc
  assert.deepEqual(toCapsuleBarInput(r, undefined, 5).rows.map((x) => x.key), ['b', 'e', 'c', 'd', 'a'])
}

// toCapsuleBarInput: zero total → pct 0, no divide-by-zero; undefined value → 0.
{
  const r: Extract<GroupedResult, { ok: true }> = {
    ok: true, format: 'number',
    rows: [{ dim: { X: 'z' }, value: 0 }, { dim: { X: 'q' }, value: undefined }],
  }
  const out = toCapsuleBarInput(r)
  assert.equal(out.dimKey, 'X')
  assert.equal(out.rows[0].pct, 0)
  assert.equal(out.rows[0].key, 'z')
  assert.equal(out.rows[1].value, 0)
  assert.equal(out.rows[1].key, 'q')
  assert.equal(out.hasCompare, false)
}

// toCapsuleBarInput: emits raw key + applies value overrides.
{
  const r: Extract<GroupedResult, { ok: true }> = {
    ok: true, format: 'number',
    rows: [{ dim: { channel: 'facebook-ads' }, value: 75 }, { dim: { channel: 'google-ads' }, value: 25 }],
  }
  const out = toCapsuleBarInput(r, { values: { channel: { 'facebook-ads': 'Facebook Ads' } } })
  assert.equal(out.dimKey, 'channel')
  assert.deepEqual(out.rows[0], { name: 'Facebook Ads', key: 'facebook-ads', value: 75, pct: 75 })
  assert.deepEqual(out.rows[1], { name: 'google-ads', key: 'google-ads', value: 25, pct: 25 }) // no override → raw
}

console.log('ok')
