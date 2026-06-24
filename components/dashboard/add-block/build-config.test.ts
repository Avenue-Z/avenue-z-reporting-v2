// Run: npx tsx components/dashboard/add-block/build-config.test.ts
import { strict as assert } from 'node:assert'
import { buildBlockConfig, formatFromDataType, isDraftComplete, leafToBinding, calculatedToBinding, operandToBinding, isOperandComplete, COMMON_TW_METRICS, type ManualDraft } from './build-config'
import { isTwMetric } from '@/lib/triplewhale/queries'

// leafToBinding: supermetrics + triplewhale
{
  assert.deepEqual(leafToBinding({ source: 'supermetrics', dsId: 'FA', metricField: 'SocialSpend', account: 'act_1' }),
    { source: 'supermetrics', dsId: 'FA', metricField: 'SocialSpend', account: 'act_1' })
  assert.deepEqual(leafToBinding({ source: 'triplewhale', metric: 'revenue' }),
    { source: 'triplewhale', metric: 'revenue' })
}

// buildBlockConfig: leaf (supermetrics)
{
  const d: ManualDraft = { kind: 'leaf', name: 'FB Spend', format: 'currency', leaf: { source: 'supermetrics', dsId: 'FA', metricField: 'SocialSpend', account: 'act_1' } }
  const cfg = buildBlockConfig(d)
  assert.equal('id' in cfg, false)
  assert.equal(cfg.name, 'FB Spend'); assert.equal(cfg.format, 'currency'); assert.equal(cfg.range, null)
  assert.equal(cfg.binding.source, 'supermetrics')
  if (cfg.binding.source === 'supermetrics') assert.equal(cfg.binding.metricField, 'SocialSpend')
}

// buildBlockConfig: aggregate (revenue / spend), leaf operands
{
  const d: ManualDraft = { kind: 'aggregate', name: 'Blended ROAS', format: 'number', op: '/',
    left: { kind: 'leaf', leaf: { source: 'triplewhale', metric: 'revenue' } },
    right: { kind: 'leaf', leaf: { source: 'supermetrics', dsId: 'FA', metricField: 'SocialSpend', account: 'act_1' } } }
  const cfg = buildBlockConfig(d)
  assert.equal(cfg.binding.source, 'aggregate')
  if (cfg.binding.source === 'aggregate') {
    assert.equal(cfg.binding.op, '/')
    assert.equal(cfg.binding.left.source, 'triplewhale')
    assert.equal(cfg.binding.right.source, 'supermetrics')
  }
}

// formatFromDataType
{
  assert.equal(formatFromDataType('float.currency.value'), 'currency')
  assert.equal(formatFromDataType('float.percentage.value'), 'percent')
  assert.equal(formatFromDataType('int.value'), 'count')
  assert.equal(formatFromDataType('string.text.value'), 'number')
  assert.equal(formatFromDataType(undefined), 'number')
}

// isDraftComplete: name required; leaf/aggregate completeness
{
  assert.equal(isDraftComplete({ kind: 'leaf', name: '', format: 'number', leaf: { source: 'triplewhale', metric: 'revenue' } }), false)
  assert.equal(isDraftComplete({ kind: 'leaf', name: 'X', format: 'number', leaf: { source: 'supermetrics', dsId: 'FA', metricField: '', account: 'act_1' } }), false)
  assert.equal(isDraftComplete({ kind: 'leaf', name: 'X', format: 'number', leaf: { source: 'supermetrics', dsId: 'FA', metricField: 'SocialSpend', account: 'act_1' } }), true)
  assert.equal(isDraftComplete({ kind: 'aggregate', name: 'X', format: 'number', op: '/', left: { kind: 'leaf', leaf: { source: 'triplewhale', metric: 'revenue' } }, right: { kind: 'leaf', leaf: { source: 'triplewhale', metric: '' } } }), false)
}

// leafToBinding: triplewhale carries non-empty filters as values arrays
{
  const b = leafToBinding({ source: 'triplewhale', metric: 'spend', filters: [{ column: 'channel', values: ['facebook-ads', 'google-ads'] }] })
  if (b.source === 'triplewhale') assert.deepEqual(b.filters, [{ column: 'channel', values: ['facebook-ads', 'google-ads'] }])
}
// single value round-trips unchanged
{
  const b = leafToBinding({ source: 'triplewhale', metric: 'spend', filters: [{ column: 'channel', values: ['facebook-ads'] }] })
  if (b.source === 'triplewhale') assert.deepEqual(b.filters, [{ column: 'channel', values: ['facebook-ads'] }])
}
// empty/incomplete filter rows are dropped (no filters key)
{
  const b = leafToBinding({ source: 'triplewhale', metric: 'spend', filters: [{ column: '', values: [] }, { column: 'channel', values: [''] }] })
  if (b.source === 'triplewhale') assert.equal(b.filters, undefined)
}
// no filters provided -> no filters key
{
  const b = leafToBinding({ source: 'triplewhale', metric: 'spend' })
  if (b.source === 'triplewhale') assert.equal(b.filters, undefined)
}

// COMMON_TW_METRICS values must all be curated TripleWhale metric keys (guards drift)
{
  assert.ok(COMMON_TW_METRICS.length > 0, 'common list non-empty')
  for (const m of COMMON_TW_METRICS) {
    assert.equal(isTwMetric(m.value), true, `${m.value} must be a curated TW metric`)
    assert.ok(m.label.length > 0, `${m.value} needs a label`)
  }
  assert.ok(COMMON_TW_METRICS.some((m) => m.value === 'blended_roas'), 'ROAS present')
}

// supermetrics carries cleaned filters as values arrays
{
  const b = leafToBinding({ source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a1', filters: [{ column: 'order_shipping_country', values: ['United States', 'Canada'] }] })
  if (b.source === 'supermetrics') assert.deepEqual(b.filters, [{ column: 'order_shipping_country', values: ['United States', 'Canada'] }])
}
// empty/incomplete SM filter rows dropped (no filters key)
{
  const b = leafToBinding({ source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a1', filters: [{ column: '', values: [] }, { column: 'order_shipping_country', values: [''] }] })
  if (b.source === 'supermetrics') assert.equal(b.filters, undefined)
}
// no SM filters provided -> no filters key
{
  const b = leafToBinding({ source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a1' })
  if (b.source === 'supermetrics') assert.equal(b.filters, undefined)
}

// calculatedToBinding: blank coeff → 1; incomplete term dropped; signs preserved
{
  const b = calculatedToBinding({ source: 'calculated', terms: [
    { coefficient: '', leaf: { source: 'triplewhale', metric: 'revenue' } },
    { coefficient: '-1', leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'tax', account: 'a' } },
    { coefficient: '2', leaf: { source: 'supermetrics', dsId: '', metricField: '', account: '' } }, // incomplete → dropped
  ] })
  assert.deepEqual(b.terms, [
    { coefficient: 1, leaf: { source: 'triplewhale', metric: 'revenue' } },
    { coefficient: -1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'tax', account: 'a' } },
  ])
}
// non-finite coefficient dropped
{
  const bNaN = calculatedToBinding({ source: 'calculated', terms: [
    { coefficient: 'abc', leaf: { source: 'triplewhale', metric: 'revenue' } },
  ] })
  assert.deepEqual(bNaN.terms, [])
}
// buildBlockConfig: calculated kind
{
  const cfg = buildBlockConfig({ kind: 'calculated', name: 'Net', format: 'currency',
    calc: { source: 'calculated', terms: [{ coefficient: '1', leaf: { source: 'triplewhale', metric: 'revenue' } }] } })
  assert.equal(cfg.binding.source, 'calculated')
}
// isDraftComplete: calculated needs name + ≥1 complete term
{
  assert.equal(isDraftComplete({ kind: 'calculated', name: '', format: 'number', calc: { source: 'calculated', terms: [{ coefficient: '1', leaf: { source: 'triplewhale', metric: 'revenue' } }] } }), false)
  assert.equal(isDraftComplete({ kind: 'calculated', name: 'X', format: 'number', calc: { source: 'calculated', terms: [{ coefficient: '1', leaf: { source: 'triplewhale', metric: '' } }] } }), false)
  assert.equal(isDraftComplete({ kind: 'calculated', name: 'X', format: 'number', calc: { source: 'calculated', terms: [{ coefficient: '1', leaf: { source: 'triplewhale', metric: 'revenue' } }] } }), true)
}

// isOperandComplete: leaf complete/incomplete
{
  assert.equal(isOperandComplete({ kind: 'leaf', leaf: { source: 'triplewhale', metric: 'revenue' } }), true)
  assert.equal(isOperandComplete({ kind: 'leaf', leaf: { source: 'triplewhale', metric: '' } }), false)
}
// isOperandComplete: calculated delegates to isCalculatedComplete
{
  assert.equal(isOperandComplete({ kind: 'calculated', calc: { source: 'calculated', terms: [{ coefficient: '1', leaf: { source: 'triplewhale', metric: 'revenue' } }] } }), true)
  assert.equal(isOperandComplete({ kind: 'calculated', calc: { source: 'calculated', terms: [] } }), false)
}

// operandToBinding: leaf
{
  const b = operandToBinding({ kind: 'leaf', leaf: { source: 'triplewhale', metric: 'ad_spend' } })
  assert.deepEqual(b, { source: 'triplewhale', metric: 'ad_spend' })
}
// operandToBinding: calculated
{
  const b = operandToBinding({ kind: 'calculated', calc: { source: 'calculated', terms: [{ coefficient: '1', leaf: { source: 'triplewhale', metric: 'revenue' } }] } })
  assert.equal(b.source, 'calculated')
  if (b.source === 'calculated') assert.equal(b.terms.length, 1)
}
// buildBlockConfig: aggregate with calculated left operand (ROAS = (rev - tax) / spend)
{
  const cfg = buildBlockConfig({ kind: 'aggregate', name: 'ROAS', format: 'number', op: '/',
    left: { kind: 'calculated', calc: { source: 'calculated', terms: [
      { coefficient: '1', leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a' } },
      { coefficient: '-1', leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'tax', account: 'a' } },
    ] } },
    right: { kind: 'leaf', leaf: { source: 'triplewhale', metric: 'ad_spend' } } })
  assert.equal(cfg.binding.source, 'aggregate')
  if (cfg.binding.source === 'aggregate') assert.equal(cfg.binding.left.source, 'calculated')
}

// barToBlockConfig: produces leaf binding with dimensions: [dim] and kind: 'bar'.
{
  const cfg = buildBlockConfig({
    kind: 'bar', name: 'Spend by Channel', format: 'currency',
    bar: { source: 'bar', leaf: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }, dimension: 'Network' },
  })
  assert.equal(cfg.kind, 'bar')
  assert.equal(cfg.binding.source, 'supermetrics')
  if (cfg.binding.source === 'supermetrics') assert.deepEqual(cfg.binding.dimensions, ['Network'])
}

// barToBlockConfig (TW leaf): dimension carried into TW binding.
{
  const cfg = buildBlockConfig({
    kind: 'bar', name: 'Revenue by Country', format: 'currency',
    bar: { source: 'bar', leaf: { source: 'triplewhale', metric: 'revenue' }, dimension: 'country' },
  })
  assert.equal(cfg.binding.source, 'triplewhale')
  if (cfg.binding.source === 'triplewhale') assert.deepEqual(cfg.binding.dimensions, ['country'])
}

// lineToBlockConfig: produces leaf binding with granularity and kind: 'line'.
{
  const cfg = buildBlockConfig({
    kind: 'line', name: 'Spend over time', format: 'currency',
    line: { source: 'line', leaf: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }, granularity: 'week' },
  })
  assert.equal(cfg.kind, 'line')
  if (cfg.binding.source === 'supermetrics') assert.equal(cfg.binding.granularity, 'week')
}

// isDraftComplete: bar without dimension → false.
assert.equal(isDraftComplete({
  kind: 'bar', name: 'X', format: 'number',
  bar: { source: 'bar', leaf: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }, dimension: '' },
}), false)

// isDraftComplete: bar with complete leaf + dimension → true.
assert.equal(isDraftComplete({
  kind: 'bar', name: 'X', format: 'number',
  bar: { source: 'bar', leaf: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }, dimension: 'Channel' },
}), true)

// isDraftComplete: bar with incomplete leaf → false.
assert.equal(isDraftComplete({
  kind: 'bar', name: 'X', format: 'number',
  bar: { source: 'bar', leaf: { source: 'supermetrics', dsId: '', metricField: '', account: '' }, dimension: 'Channel' },
}), false)

// isDraftComplete: line without granularity → false (TS-wise impossible, but defensive).
assert.equal(isDraftComplete({
  kind: 'line', name: 'X', format: 'number',
  line: { source: 'line', leaf: { source: 'triplewhale', metric: 'revenue' }, granularity: '' as unknown as 'day' },
}), false)

// isDraftComplete: line with complete leaf + valid granularity → true.
assert.equal(isDraftComplete({
  kind: 'line', name: 'X', format: 'number',
  line: { source: 'line', leaf: { source: 'triplewhale', metric: 'revenue' }, granularity: 'day' },
}), true)

console.log('ok')
