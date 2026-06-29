// lib/dashboard/group-join.test.ts
// Run: npx tsx lib/dashboard/group-join.test.ts
import { strict as assert } from 'node:assert'
import { joinGrouped, alignSeries } from './group-join'

// joinGrouped: both sides present, current order preserved, prevValue populated.
{
  const rows = joinGrouped(
    [{ dim: 'US', value: 100 }, { dim: 'CA', value: 50 }],
    [{ dim: 'CA', value: 40 }, { dim: 'US', value: 80 }],
    'Country',
  )
  assert.deepEqual(rows, [
    { dim: { Country: 'US' }, value: 100, prevValue: 80 },
    { dim: { Country: 'CA' }, value: 50, prevValue: 40 },
  ])
}

// joinGrouped: prior-only dim appended with value=undefined.
{
  const rows = joinGrouped(
    [{ dim: 'US', value: 100 }],
    [{ dim: 'US', value: 80 }, { dim: 'MX', value: 25 }],
    'Country',
  )
  assert.equal(rows.length, 2)
  assert.deepEqual(rows[0], { dim: { Country: 'US' }, value: 100, prevValue: 80 })
  assert.deepEqual(rows[1], { dim: { Country: 'MX' }, value: undefined, prevValue: 25 })
}

// joinGrouped: current-only dim → prevValue absent (not present-undefined).
{
  const rows = joinGrouped(
    [{ dim: 'US', value: 100 }, { dim: 'NEW', value: 5 }],
    [{ dim: 'US', value: 80 }],
    'Country',
  )
  assert.equal(rows[1].prevValue, undefined)
  assert.equal('prevValue' in rows[1], false, 'undefined prevValue must be absent, not present-undefined')
}

// joinGrouped: null prior (no comparison) → no prevValue on any row.
{
  const rows = joinGrouped([{ dim: 'US', value: 100 }], null, 'Country')
  assert.deepEqual(rows, [{ dim: { Country: 'US' }, value: 100 }])
}

// joinGrouped: empty current + non-null prior → all rows have value undefined, prevValue set.
{
  const rows = joinGrouped([], [{ dim: 'US', value: 80 }], 'Country')
  assert.deepEqual(rows, [{ dim: { Country: 'US' }, value: undefined, prevValue: 80 }])
}

// alignSeries: equal lengths, paired by index.
{
  const pts = alignSeries(
    [{ bucket: '2026-06-01', value: 10 }, { bucket: '2026-06-02', value: 20 }],
    [{ bucket: '2026-05-01', value: 8  }, { bucket: '2026-05-02', value: 18 }],
  )
  assert.deepEqual(pts, [
    { bucket: '2026-06-01', value: 10, prevValue: 8  },
    { bucket: '2026-06-02', value: 20, prevValue: 18 },
  ])
}

// alignSeries: current longer than prior → trailing points carry no prevValue.
{
  const pts = alignSeries(
    [{ bucket: '2026-06-01', value: 10 }, { bucket: '2026-06-02', value: 20 }, { bucket: '2026-06-03', value: 30 }],
    [{ bucket: '2026-05-01', value: 8  }],
  )
  assert.equal(pts.length, 3)
  assert.equal(pts[0].prevValue, 8)
  assert.equal('prevValue' in pts[1], false)
  assert.equal('prevValue' in pts[2], false)
}

// alignSeries: prior longer than current → trailing prior buckets dropped.
{
  const pts = alignSeries(
    [{ bucket: '2026-06-01', value: 10 }],
    [{ bucket: '2026-05-01', value: 8 }, { bucket: '2026-05-02', value: 18 }],
  )
  assert.equal(pts.length, 1)
  assert.equal(pts[0].prevValue, 8)
}

// alignSeries: null prior → no prevValue on any point.
{
  const pts = alignSeries([{ bucket: '2026-06-01', value: 10 }], null)
  assert.deepEqual(pts, [{ bucket: '2026-06-01', value: 10 }])
}

// alignSeries: empty current → empty result.
{
  assert.deepEqual(alignSeries([], [{ bucket: '2026-05-01', value: 8 }]), [])
}

console.log('ok')
