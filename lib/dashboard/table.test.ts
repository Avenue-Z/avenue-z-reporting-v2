// lib/dashboard/table.test.ts
// Run: npx tsx lib/dashboard/table.test.ts
import { strict as assert } from 'node:assert'
import { toTableInput } from './table'
import type { GroupedRow, MetricFormat } from './types'

// Single-dim, no compare → 2 cols (dim + value), 3 rows, sorted desc by value default
{
  const rows: GroupedRow[] = [
    { dim: { Channel: 'Google' }, value: 1500 },
    { dim: { Channel: 'Meta' }, value: 800 },
    { dim: { Channel: 'TikTok' }, value: 200 },
  ]
  const r = toTableInput({ ok: true, rows, format: 'currency' as MetricFormat })
  assert.equal(r.columns.length, 2, '2 columns (dim + value)')
  assert.equal(r.columns[0].key, 'Channel')
  assert.equal(r.columns[1].key, '__value__')
  assert.equal(r.columns[1].align, 'right')
  assert.equal(r.rows.length, 3)
  assert.equal(r.defaultSort?.key, '__value__')
  assert.equal(r.defaultSort?.dir, 'desc')
}

// With compare → 3 cols (dim + value + prev)
{
  const rows: GroupedRow[] = [
    { dim: { Channel: 'Google' }, value: 1500, prevValue: 1000 },
    { dim: { Channel: 'Meta' }, value: 800, prevValue: 900 },
  ]
  const r = toTableInput({ ok: true, rows, format: 'currency' as MetricFormat })
  assert.equal(r.columns.length, 3)
  assert.equal(r.columns[2].key, '__prev__')
}

// undefined value (prior-only dim) renders as em-dash, sorts as -Infinity
{
  const rows: GroupedRow[] = [
    { dim: { Channel: 'Google' }, value: 100 },
    { dim: { Channel: 'New' }, value: undefined, prevValue: 50 },
  ]
  const r = toTableInput({ ok: true, rows, format: 'number' as MetricFormat })
  const sv = r.columns[1].sortValue!
  // The row whose value is undefined should sort below the row with value 100.
  const undefRow = r.rows.find((row) => row.Channel === 'New')!
  const valRow = r.rows.find((row) => row.Channel === 'Google')!
  assert.equal(typeof sv(undefRow), 'number')
  assert.equal((sv(undefRow) as number) < (sv(valRow) as number), true)
}

console.log('ok')
