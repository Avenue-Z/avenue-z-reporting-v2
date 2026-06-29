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

// Columns must be RSC-serializable: TableBlockBody is a Server Component that
// passes columns to the client <DataTable>, so no column prop may be a function.
{
  const rows: GroupedRow[] = [
    { dim: { Channel: 'Google' }, value: 1500, prevValue: 1000 },
    { dim: { Channel: 'Meta' }, value: 800 },
  ]
  const r = toTableInput({ ok: true, rows, format: 'currency' as MetricFormat })
  for (const c of r.columns) {
    for (const [k, v] of Object.entries(c)) {
      assert.notEqual(typeof v, 'function', `column ${c.key}.${k} must be serializable (no function)`)
    }
  }
  // Sort is declared, not a function: dim sorts as a string by its own key;
  // numeric columns sort by their hidden __sort field.
  assert.equal(r.columns[0].sortType, 'string')
  assert.equal(r.columns[1].sortType, 'number')
  assert.equal(r.columns[1].sortKey, '__value____sort')
  // the declared sortKey must be a real field on the rows
  assert.ok(r.columns[1].sortKey! in r.rows[0])
}

// undefined value (prior-only dim) renders as em-dash and its hidden numeric
// sort field is -Infinity, so it sorts below rows with a defined value.
{
  const rows: GroupedRow[] = [
    { dim: { Channel: 'Google' }, value: 100 },
    { dim: { Channel: 'New' }, value: undefined, prevValue: 50 },
  ]
  const r = toTableInput({ ok: true, rows, format: 'number' as MetricFormat })
  const sortField = r.columns[1].sortKey!
  const undefRow = r.rows.find((row) => row.Channel === 'New')!
  const valRow = r.rows.find((row) => row.Channel === 'Google')!
  assert.equal((undefRow[sortField] as number) < (valRow[sortField] as number), true)
}

// Dim header override, editable flag, dimKey, cell display override, and raw key preserved
{
  const r = { ok: true as const, format: 'number' as const, rows: [{ dim: { channel: 'facebook-ads' }, value: 10 }] }
  const t = toTableInput(r, { values: { channel: { 'facebook-ads': 'Facebook Ads' } }, dims: { channel: 'Channel' } })
  const dimCol = t.columns[0]
  assert.equal(dimCol.label, 'Channel')        // dim header override
  assert.equal(dimCol.editable, true)
  assert.equal(dimCol.dimKey, 'channel')
  assert.equal(t.rows[0][dimCol.key], 'Facebook Ads')        // cell display = override
  assert.equal(t.rows[0]['channel__raw'], 'facebook-ads')    // raw preserved for editing
}

console.log('ok')
