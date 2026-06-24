// lib/dashboard/charts.test.ts
// Run: npx tsx lib/dashboard/charts.test.ts
import { strict as assert } from 'node:assert'
import { toBarChartInput, toLineChartInput, bucketLabelPattern } from './charts'
import type { GroupedResult, SeriesResult } from './types'

// bucketLabelPattern: documented format strings.
assert.equal(bucketLabelPattern('day'), 'MMM d')
assert.equal(bucketLabelPattern('week'), "'Wk' w")
assert.equal(bucketLabelPattern('month'), 'MMM yy')

// toBarChartInput: rows with single-key dim → flattened 'dim' string.
{
  const r: Extract<GroupedResult, { ok: true }> = {
    ok: true,
    format: 'currency',
    rows: [
      { dim: { Country: 'US' }, value: 1000 },
      { dim: { Country: 'CA' }, value: 500 },
    ],
  }
  const out = toBarChartInput(r)
  assert.deepEqual(out.data, [
    { dim: 'US', value: 1000 },
    { dim: 'CA', value: 500 },
  ])
  assert.equal(out.hasCompare, false)
  assert.equal(out.target, undefined)
  assert.equal(out.ceiling, undefined)
}

// toBarChartInput: any row with prevValue → hasCompare true; prevValue carried through.
{
  const r: Extract<GroupedResult, { ok: true }> = {
    ok: true,
    format: 'number',
    rows: [
      { dim: { Channel: 'Google' }, value: 100, prevValue: 80 },
      { dim: { Channel: 'Meta' },   value: 50 },
    ],
  }
  const out = toBarChartInput(r)
  assert.equal(out.hasCompare, true)
  assert.equal(out.data[0].prevValue, 80)
  assert.equal('prevValue' in out.data[1], false)
}

// toBarChartInput: undefined value (prior-only dim) coerced to 0 for chart rendering.
{
  const r: Extract<GroupedResult, { ok: true }> = {
    ok: true,
    format: 'number',
    rows: [{ dim: { Channel: 'New' }, value: undefined, prevValue: 25 }],
  }
  const out = toBarChartInput(r)
  assert.equal(out.data[0].value, 0)
  assert.equal(out.data[0].prevValue, 25)
}

// toBarChartInput: target + ceiling passed through.
{
  const r: Extract<GroupedResult, { ok: true }> = { ok: true, format: 'number', rows: [] }
  const out = toBarChartInput(r, 250, 280)
  assert.equal(out.target, 250)
  assert.equal(out.ceiling, 280)
}

// toBarChartInput: empty rows produce empty data + hasCompare false.
{
  const r: Extract<GroupedResult, { ok: true }> = { ok: true, format: 'number', rows: [] }
  const out = toBarChartInput(r)
  assert.deepEqual(out.data, [])
  assert.equal(out.hasCompare, false)
}

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

console.log('ok')
