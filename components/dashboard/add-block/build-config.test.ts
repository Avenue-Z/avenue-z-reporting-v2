// Run: npx tsx components/dashboard/add-block/build-config.test.ts
import { strict as assert } from 'node:assert'
import { buildBlockConfig, formatFromDataType, isDraftComplete, leafToBinding, calculatedToBinding, COMMON_TW_METRICS, type ManualDraft } from './build-config'
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

// buildBlockConfig: aggregate (revenue / spend)
{
  const d: ManualDraft = { kind: 'aggregate', name: 'Blended ROAS', format: 'number', op: '/',
    left: { source: 'triplewhale', metric: 'revenue' },
    right: { source: 'supermetrics', dsId: 'FA', metricField: 'SocialSpend', account: 'act_1' } }
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
  assert.equal(isDraftComplete({ kind: 'aggregate', name: 'X', format: 'number', op: '/', left: { source: 'triplewhale', metric: 'revenue' }, right: { source: 'triplewhale', metric: '' } }), false)
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

console.log('ok')
