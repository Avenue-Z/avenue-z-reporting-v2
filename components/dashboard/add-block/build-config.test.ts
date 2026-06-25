// Run: npx tsx components/dashboard/add-block/build-config.test.ts
import { strict as assert } from 'node:assert'
import { buildBlockConfig, formatFromDataType, isDraftComplete, leafToBinding, calculatedToBinding, operandToBinding, isOperandComplete, formulaToBinding, leafToDraft, formulaToDraft, bindingToFormulaDraft, blockToManualDraft, COMMON_TW_METRICS, type ManualDraft } from './build-config'
import { isTwMetric } from '@/lib/triplewhale/queries'
import { parse } from '@/lib/dashboard/formula/parse'

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

// formulaToBinding: assembles expr + operands; drops operand keys not used in expr
{
  const b = formulaToBinding({ source: 'formula', expr: '@a / @b',
    operands: {
      a: { kind: 'ref', blockId: 'rev' },
      b: { kind: 'metric', leaf: { source: 'triplewhale', metric: 'ad_spend' } },
      z: { kind: 'ref', blockId: 'unused' }, // not in expr -> dropped
    } })
  assert.equal(b.source, 'formula')
  assert.equal(b.expr, '@a / @b')
  assert.deepEqual(Object.keys(b.operands).sort(), ['a', 'b'])
}
// buildBlockConfig: formula kind
{
  const cfg = buildBlockConfig({ kind: 'formula', name: 'ROAS', format: 'number',
    formula: { source: 'formula', expr: '@a / @b', operands: { a: { kind: 'ref', blockId: 'rev' }, b: { kind: 'metric', leaf: { source: 'triplewhale', metric: 'ad_spend' } } } } })
  assert.equal(cfg.binding.source, 'formula')
}
// isDraftComplete: needs name, a parseable expr, and every used operand complete
{
  const ok = { kind: 'formula' as const, name: 'X', format: 'number' as const,
    formula: { source: 'formula' as const, expr: '@a + 1', operands: { a: { kind: 'metric' as const, leaf: { source: 'triplewhale' as const, metric: 'revenue' } } } } }
  assert.equal(isDraftComplete(ok), true)
  assert.equal(isDraftComplete({ ...ok, name: '' }), false)                                   // no name
  assert.equal(isDraftComplete({ ...ok, formula: { source: 'formula', expr: '@a + ', operands: ok.formula.operands } }), false) // bad expr
  assert.equal(isDraftComplete({ ...ok, formula: { source: 'formula', expr: '@a + @b', operands: ok.formula.operands } }), false) // @b unbound
  assert.equal(isDraftComplete({ ...ok, formula: { source: 'formula', expr: '@a', operands: { a: { kind: 'metric', leaf: { source: 'supermetrics', dsId: '', metricField: '', account: '' } } } } }), false) // incomplete metric
}

// leafToDraft round-trips through leafToBinding (supermetrics with filters)
{
  const b = { source: 'supermetrics' as const, dsId: 'SHP', metricField: 'total_sales', account: 'a', filters: [{ column: 'order_shipping_country', values: ['United States', 'Canada'] }] }
  assert.deepEqual(leafToBinding(leafToDraft(b)), b)
}
// leafToDraft round-trips (triplewhale, no filters)
{
  const b = { source: 'triplewhale' as const, metric: 'ad_spend' }
  assert.deepEqual(leafToBinding(leafToDraft(b)), b)
}
// formulaToDraft round-trips through formulaToBinding
{
  const b = { source: 'formula' as const, expr: '@a / @b', operands: { a: { kind: 'ref' as const, blockId: 'rev' }, b: { kind: 'metric' as const, leaf: { source: 'triplewhale' as const, metric: 'ad_spend' } } } }
  assert.deepEqual(formulaToBinding(formulaToDraft(b)), b)
}
// bindingToFormulaDraft: aggregate of two leaves -> "@m0 / @m1", parses
{
  const d = bindingToFormulaDraft({ source: 'aggregate', op: '/', left: { source: 'triplewhale', metric: 'revenue' }, right: { source: 'triplewhale', metric: 'ad_spend' } })
  assert.doesNotThrow(() => parse(d.expr))
  assert.equal(Object.keys(d.operands).length, 2)
}
// bindingToFormulaDraft: (rev - tax) / spend -> parses, 3 operands
{
  const d = bindingToFormulaDraft({ source: 'aggregate', op: '/',
    left: { source: 'calculated', terms: [
      { coefficient: 1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a' } },
      { coefficient: -1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'tax', account: 'a' } },
    ] },
    right: { source: 'triplewhale', metric: 'ad_spend' } })
  assert.doesNotThrow(() => parse(d.expr)) // negative coefficient must produce parser-valid expr
  assert.equal(Object.keys(d.operands).length, 3)
}
// bindingToFormulaDraft: standalone calculated with a negative coefficient parses
{
  const d = bindingToFormulaDraft({ source: 'calculated', terms: [
    { coefficient: 0.8, leaf: { source: 'triplewhale', metric: 'revenue' } },
    { coefficient: -1, leaf: { source: 'triplewhale', metric: 'ad_spend' } },
  ] })
  assert.doesNotThrow(() => parse(d.expr))
}
// blockToManualDraft dispatch
{
  const leafBlock = { id: 'x', name: 'Spend', format: 'currency' as const, range: null, binding: { source: 'triplewhale' as const, metric: 'ad_spend' } }
  assert.equal(blockToManualDraft(leafBlock).source, 'triplewhale')
  const aggBlock = { id: 'y', name: 'ROAS', format: 'number' as const, range: null, binding: { source: 'aggregate' as const, op: '/' as const, left: { source: 'triplewhale' as const, metric: 'revenue' }, right: { source: 'triplewhale' as const, metric: 'ad_spend' } } }
  const md = blockToManualDraft(aggBlock)
  assert.equal(md.source, 'formula')
  if (md.draft.kind === 'formula') { const d = md.draft; assert.doesNotThrow(() => parse(d.formula.expr)) }
}

console.log('ok')
