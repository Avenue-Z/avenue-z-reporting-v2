// lib/dashboard/persistence.test.ts
// Run: npx tsx lib/dashboard/persistence.test.ts
import { strict as assert } from 'node:assert'
import { parseBlockConfig, parseDashboardConfig } from './persistence'

const sm = { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }
const tw = { source: 'triplewhale', metric: 'revenue' }
const agg = { source: 'aggregate', op: '/', left: tw, right: sm }
const block = (binding: unknown) => ({ id: 'b1', name: 'Cost', format: 'currency', range: null, binding })

// valid full config with all three binding kinds
const full = {
  defaultRange: { dateRange: 'last_30_days', compareRange: 'previous_period' },
  blocks: [block(sm), block(tw), { ...block(agg), format: 'number' }],
}
{
  const r = parseDashboardConfig(full)
  assert.equal(r.ok, true)
  if (r.ok) { assert.equal(r.config.blocks.length, 3); assert.equal(r.config.blocks[2].binding.source, 'aggregate') }
}

// empty blocks is valid
assert.equal(parseDashboardConfig({ defaultRange: { dateRange: 'last_7_days', compareRange: null }, blocks: [] }).ok, true)

// missing/invalid defaultRange
assert.equal(parseDashboardConfig({ blocks: [] }).ok, false)
assert.equal(parseDashboardConfig({ defaultRange: { dateRange: '', compareRange: null }, blocks: [] }).ok, false)

// blocks must be an array
assert.equal(parseDashboardConfig({ defaultRange: { dateRange: 'last_7_days', compareRange: null }, blocks: {} }).ok, false)

// bad format
assert.equal(parseBlockConfig({ ...block(sm), format: 'dollars' }).ok, false)

// supermetrics missing metricField; triplewhale missing metric
assert.equal(parseBlockConfig(block({ source: 'supermetrics', dsId: 'AW', account: '1' })).ok, false)
assert.equal(parseBlockConfig(block({ source: 'triplewhale' })).ok, false)

// aggregate: bad op, and nested-aggregate operand rejected (operands must be leaves)
assert.equal(parseBlockConfig(block({ source: 'aggregate', op: '%', left: tw, right: sm })).ok, false)
assert.equal(parseBlockConfig(block({ source: 'aggregate', op: '/', left: agg, right: sm })).ok, false)

// range may be null (inherit) or an object; a malformed object is rejected
assert.equal(parseBlockConfig({ ...block(sm), range: { dateRange: 'last_7_days', compareRange: null } }).ok, true)
assert.equal(parseBlockConfig({ ...block(sm), range: { compareRange: null } }).ok, false)

// error string names the path
{
  const r = parseDashboardConfig({ defaultRange: { dateRange: 'x', compareRange: null }, blocks: [block({ source: 'supermetrics', dsId: 'AW', account: '1' })] })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error.includes('blocks[0]'), true)
}

// triplewhale: legacy {column,value} normalizes to {column, values:[value]}
{
  const r = parseBlockConfig({ id: 'b', name: 'n', format: 'number', range: null,
    binding: { source: 'triplewhale', metric: 'spend', filters: [{ column: 'channel', value: 'facebook-ads' }] } })
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'triplewhale') assert.deepEqual(r.block.binding.filters, [{ column: 'channel', values: ['facebook-ads'] }])
}
// triplewhale: new {column, values} (incl. multi) round-trips
{
  const r = parseBlockConfig({ id: 'b', name: 'n', format: 'number', range: null,
    binding: { source: 'triplewhale', metric: 'spend', filters: [{ column: 'channel', values: ['google-ads', 'facebook-ads'] }] } })
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'triplewhale') assert.deepEqual(r.block.binding.filters, [{ column: 'channel', values: ['google-ads', 'facebook-ads'] }])
}
// supermetrics: legacy value normalizes
{
  const r = parseBlockConfig({ id: 'b', name: 'n', format: 'number', range: null,
    binding: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a1', filters: [{ column: 'order_shipping_country', value: 'United States' }] } })
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'supermetrics') assert.deepEqual(r.block.binding.filters, [{ column: 'order_shipping_country', values: ['United States'] }])
}
// malformed filter rejected (no column)
{
  const r = parseBlockConfig({ id: 'b', name: 'n', format: 'number', range: null,
    binding: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a1', filters: [{ values: ['x'] }] } })
  assert.equal(r.ok, false)
}

// calculated binding round-trips
{
  const r = parseBlockConfig({ id: 'b', name: 'Net', format: 'currency', range: null,
    binding: { source: 'calculated', terms: [
      { coefficient: 1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a' } },
      { coefficient: -1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'tax', account: 'a' } },
    ] } })
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'calculated') assert.equal(r.block.binding.terms.length, 2)
}
// empty terms rejected
{
  const r = parseBlockConfig({ id: 'b', name: 'n', format: 'number', range: null, binding: { source: 'calculated', terms: [] } })
  assert.equal(r.ok, false)
}
// non-number coefficient rejected
{
  const r = parseBlockConfig({ id: 'b', name: 'n', format: 'number', range: null,
    binding: { source: 'calculated', terms: [{ coefficient: 'x', leaf: { source: 'triplewhale', metric: 'revenue' } }] } })
  assert.equal(r.ok, false)
}
// calculated as aggregate operand round-trips
{
  const r = parseBlockConfig({ id: 'b', name: 'ROAS', format: 'number', range: null,
    binding: { source: 'aggregate', op: '/',
      left: { source: 'calculated', terms: [{ coefficient: 1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a' } }] },
      right: { source: 'triplewhale', metric: 'ad_spend' } } })
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'aggregate') assert.equal(r.block.binding.left.source, 'calculated')
}

// kind: omitted → parses (back-compat); the persisted block has no kind field.
{
  const r = parseBlockConfig(block(sm))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.block.kind, undefined)
}
// kind: 'bar' parses (renderer not yet implemented; schema is forward-compatible).
{
  const r = parseBlockConfig({ ...block(sm), kind: 'bar' })
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.block.kind, 'bar')
}
// kind: 'wat' rejected with expected-one-of error.
{
  const r = parseBlockConfig({ ...block(sm), kind: 'wat' })
  assert.equal(r.ok, false)
  if (!r.ok) assert.equal(r.error.includes('kind'), true)
}

// layout: full {x,y,w,h} parses.
{
  const r = parseBlockConfig({ ...block(sm), layout: { x: 0, y: 0, w: 3, h: 2 } })
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual(r.block.layout, { x: 0, y: 0, w: 3, h: 2 })
}
// layout: partial {w,h} rejected (full layout required when present).
{
  const r = parseBlockConfig({ ...block(sm), layout: { w: 3, h: 2 } })
  assert.equal(r.ok, false)
}
// layout: negative x rejected.
{
  const r = parseBlockConfig({ ...block(sm), layout: { x: -1, y: 0, w: 3, h: 2 } })
  assert.equal(r.ok, false)
}
// layout: omitted parses to undefined (auto-pack target).
{
  const r = parseBlockConfig(block(sm))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.block.layout, undefined)
}

// KPI annotations: subLabel / target / ceiling round-trip.
{
  const r = parseBlockConfig({ ...block(sm), subLabel: '13-wk avg kr251', target: 250, ceiling: 280 })
  assert.equal(r.ok, true)
  if (r.ok) {
    assert.equal(r.block.subLabel, '13-wk avg kr251')
    assert.equal(r.block.target, 250)
    assert.equal(r.block.ceiling, 280)
  }
}
// KPI annotations: non-finite target rejected.
{
  const r = parseBlockConfig({ ...block(sm), target: Number.NaN })
  assert.equal(r.ok, false)
}
// KPI annotations: non-string subLabel rejected.
{
  const r = parseBlockConfig({ ...block(sm), subLabel: 42 })
  assert.equal(r.ok, false)
}

// headerLevel: 1 / 2 / 3 round-trip (regression: was silently dropped on save).
for (const lvl of [1, 2, 3] as const) {
  const r = parseBlockConfig({ ...block(sm), kind: 'header', headerLevel: lvl })
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.block.headerLevel, lvl)
}
// headerLevel: omitted → parses, no field.
{
  const r = parseBlockConfig({ ...block(sm), kind: 'header' })
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.block.headerLevel, undefined)
}
// headerLevel: out-of-range value rejected.
assert.equal(parseBlockConfig({ ...block(sm), kind: 'header', headerLevel: 4 }).ok, false)

// narrativeBody: markdown string round-trips (regression: was silently dropped on save).
{
  const r = parseBlockConfig({ ...block(sm), kind: 'narrative', narrativeBody: '## Highlights\n- Cost down 12%' })
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.block.narrativeBody, '## Highlights\n- Cost down 12%')
}
// narrativeBody: omitted → parses, no field.
{
  const r = parseBlockConfig({ ...block(sm), kind: 'narrative' })
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.block.narrativeBody, undefined)
}
// narrativeBody: non-string rejected.
assert.equal(parseBlockConfig({ ...block(sm), kind: 'narrative', narrativeBody: 42 }).ok, false)

// dimensions: SM length-1 valid string → round-trips.
{
  const r = parseBlockConfig(block({ source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1', dimensions: ['Channel'] }))
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'supermetrics') {
    assert.deepEqual(r.block.binding.dimensions, ['Channel'])
  }
}
// dimensions: TW length-1 valid string → round-trips.
{
  const r = parseBlockConfig(block({ source: 'triplewhale', metric: 'ad_spend', dimensions: ['channel'] }))
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'triplewhale') {
    assert.deepEqual(r.block.binding.dimensions, ['channel'])
  }
}
// dimensions: length 0 rejected.
assert.equal(parseBlockConfig(block({ source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1', dimensions: [] })).ok, false)
// dimensions: length 2 rejected (v1 invariant).
assert.equal(parseBlockConfig(block({ source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1', dimensions: ['Channel', 'Country'] })).ok, false)
// dimensions: SM unsafe column rejected.
assert.equal(parseBlockConfig(block({ source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1', dimensions: ['bad col'] })).ok, false)
// dimensions: TW unsafe column rejected (uppercase fails TW's lowercase column regex).
assert.equal(parseBlockConfig(block({ source: 'triplewhale', metric: 'ad_spend', dimensions: ['BadCol'] })).ok, false)
// dimensions: omitted → parses, no field.
{
  const r = parseBlockConfig(block({ source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }))
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'supermetrics') assert.equal(r.block.binding.dimensions, undefined)
}

// granularity: 'day' / 'week' / 'month' round-trip.
for (const g of ['day', 'week', 'month'] as const) {
  const r = parseBlockConfig(block({ source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1', granularity: g }))
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'supermetrics') assert.equal(r.block.binding.granularity, g)
}
// granularity: 'minute' rejected.
assert.equal(parseBlockConfig(block({ source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1', granularity: 'minute' })).ok, false)
// granularity: omitted → parses, no field.
{
  const r = parseBlockConfig(block({ source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }))
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'supermetrics') assert.equal(r.block.binding.granularity, undefined)
}

// shopify leaf binding — valid when query is a non-empty string
{
  const r = parseBlockConfig(block({ source: 'shopify', query: "FROM sales SHOW orders_first_time WHERE subscription_or_one_time = 'subscription'" }))
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.block.binding.source, 'shopify')
}
// shopify leaf binding — rejected when query missing/empty
assert.equal(parseBlockConfig(block({ source: 'shopify' })).ok, false)
assert.equal(parseBlockConfig(block({ source: 'shopify', query: '' })).ok, false)
// shopify works as an aggregate operand (Subscription CAC = spend ÷ subs)
{
  const r = parseBlockConfig(block({ source: 'aggregate', op: '/', left: tw, right: { source: 'shopify', query: 'FROM sales SHOW orders_first_time' } }))
  assert.equal(r.ok, true)
}

// shopify grouped binding: dimension round-trips (safe column)
{
  const r = parseBlockConfig(block({ source: 'shopify', query: 'FROM sales SHOW net_sales', dimensions: ['sales_channel'] }))
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'shopify') assert.deepEqual(r.block.binding.dimensions, ['sales_channel'])
}
// shopify series binding: granularity round-trips
{
  const r = parseBlockConfig(block({ source: 'shopify', query: 'FROM sales SHOW net_sales', granularity: 'week' }))
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'shopify') assert.equal(r.block.binding.granularity, 'week')
}
// shopify: unsafe dimension rejected; length-2 rejected; bad granularity rejected
assert.equal(parseBlockConfig(block({ source: 'shopify', query: 'q', dimensions: ['bad; drop'] })).ok, false)
assert.equal(parseBlockConfig(block({ source: 'shopify', query: 'q', dimensions: ['a', 'b'] })).ok, false)
assert.equal(parseBlockConfig(block({ source: 'shopify', query: 'q', granularity: 'minute' })).ok, false)

// formula binding round-trips (ref + metric + constant)
{
  const r = parseBlockConfig({ id: 'b', name: 'ROAS', format: 'number', range: null,
    binding: { source: 'formula', expr: '(@a - @b) / @c',
      operands: {
        a: { kind: 'metric', leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a' } },
        b: { kind: 'metric', leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'tax', account: 'a' } },
        c: { kind: 'ref', blockId: 'spend-block' },
      } } })
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'formula') assert.equal(Object.keys(r.block.binding.operands).length, 3)
}
// unparseable expr rejected
{
  const r = parseBlockConfig({ id: 'b', name: 'n', format: 'number', range: null,
    binding: { source: 'formula', expr: '(@a + ', operands: { a: { kind: 'ref', blockId: 'x' } } } })
  assert.equal(r.ok, false)
}
// operand/placeholder mismatch rejected (expr uses @a @b but operands miss @b)
{
  const r = parseBlockConfig({ id: 'b', name: 'n', format: 'number', range: null,
    binding: { source: 'formula', expr: '@a + @b', operands: { a: { kind: 'ref', blockId: 'x' } } } })
  assert.equal(r.ok, false)
}
// bad operand (ref without blockId) rejected
{
  const r = parseBlockConfig({ id: 'b', name: 'n', format: 'number', range: null,
    binding: { source: 'formula', expr: '@a', operands: { a: { kind: 'ref' } } } })
  assert.equal(r.ok, false)
}
// constant-only formula (no operands) is valid
{
  const r = parseBlockConfig({ id: 'b', name: 'Const', format: 'number', range: null,
    binding: { source: 'formula', expr: '1 + 2 * 3', operands: {} } })
  assert.equal(r.ok, true)
  if (r.ok && r.block.binding.source === 'formula') assert.equal(Object.keys(r.block.binding.operands).length, 0)
}
// metric operand with an invalid leaf is rejected
{
  const r = parseBlockConfig({ id: 'b', name: 'n', format: 'number', range: null,
    binding: { source: 'formula', expr: '@a', operands: { a: { kind: 'metric', leaf: { source: 'nonsense' } } } } })
  assert.equal(r.ok, false)
}

// labelOverrides: valid map round-trips
{
  const cfg = {
    defaultRange: { dateRange: 'last_30_days', compareRange: null },
    blocks: [],
    labelOverrides: { values: { channel: { 'facebook-ads': 'Facebook Ads' } }, dims: { channel: 'Channel' } },
  }
  const r = parseDashboardConfig(cfg)
  assert.equal(r.ok, true)
  if (r.ok) assert.deepEqual(r.config.labelOverrides, cfg.labelOverrides)
}
// labelOverrides: malformed (non-string leaf) rejects
{
  const r = parseDashboardConfig({
    defaultRange: { dateRange: 'last_30_days', compareRange: null },
    blocks: [],
    labelOverrides: { values: { channel: { 'facebook-ads': 5 } } },
  })
  assert.equal(r.ok, false)
}
// labelOverrides omitted → ok, undefined
{
  const r = parseDashboardConfig({ defaultRange: { dateRange: 'last_30_days', compareRange: null }, blocks: [] })
  assert.equal(r.ok, true)
  if (r.ok) assert.equal(r.config.labelOverrides, undefined)
}

console.log('ok')
