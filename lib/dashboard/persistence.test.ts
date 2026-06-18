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
console.log('ok')
