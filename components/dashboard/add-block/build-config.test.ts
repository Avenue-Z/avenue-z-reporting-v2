// Run: npx tsx components/dashboard/add-block/build-config.test.ts
import { strict as assert } from 'node:assert'
import { buildBlockConfig, blockToManualDraft, formatFromDataType, isDraftComplete, leafToBinding, calculatedToBinding, operandToBinding, isOperandComplete, formulaToBinding, leafToDraft, formulaToDraft, bindingToFormulaDraft, COMMON_TW_METRICS, type ManualDraft } from './build-config'
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

// formatFromDataType
{
  assert.equal(formatFromDataType('float.currency.value'), 'currency')
  assert.equal(formatFromDataType('float.percentage.value'), 'percent')
  assert.equal(formatFromDataType('int.value'), 'count')
  assert.equal(formatFromDataType('string.text.value'), 'number')
  assert.equal(formatFromDataType(undefined), 'number')
}

// isDraftComplete: name required; leaf completeness
{
  assert.equal(isDraftComplete({ kind: 'leaf', name: '', format: 'number', leaf: { source: 'triplewhale', metric: 'revenue' } }), false)
  assert.equal(isDraftComplete({ kind: 'leaf', name: 'X', format: 'number', leaf: { source: 'supermetrics', dsId: 'FA', metricField: '', account: 'act_1' } }), false)
  assert.equal(isDraftComplete({ kind: 'leaf', name: 'X', format: 'number', leaf: { source: 'supermetrics', dsId: 'FA', metricField: 'SocialSpend', account: 'act_1' } }), true)
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
// (calculated is no longer authored in the UI, but the converter is retained for
//  reverse-mapping legacy persisted blocks into formula drafts.)
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
// blockToManualDraft dispatch: leaf + legacy aggregate fold into a formula draft
{
  const leafBlock = { id: 'x', name: 'Spend', format: 'currency' as const, range: null, binding: { source: 'triplewhale' as const, metric: 'ad_spend' } }
  assert.equal(blockToManualDraft(leafBlock).source, 'triplewhale')
  const aggBlock = { id: 'y', name: 'ROAS', format: 'number' as const, range: null, binding: { source: 'aggregate' as const, op: '/' as const, left: { source: 'triplewhale' as const, metric: 'revenue' }, right: { source: 'triplewhale' as const, metric: 'ad_spend' } } }
  const md = blockToManualDraft(aggBlock)
  assert.equal(md.source, 'formula')
  if (md.draft.kind === 'formula') { const d = md.draft; assert.doesNotThrow(() => parse(d.formula.expr)) }
}

// expectedAccounts round-trips through leafToDraft -> leafToBinding
{
  const b = { source: 'supermetrics' as const, dsId: 'SHP', metricField: 'total_sales', account: 'a', expectedAccounts: ['a', 'b'] }
  assert.deepEqual(leafToBinding(leafToDraft(b)), b)
}
// TW account round-trips through leafToDraft -> leafToBinding
{
  const b = { source: 'triplewhale' as const, metric: 'revenue', account: 'shop1' }
  assert.deepEqual(leafToBinding(leafToDraft(b)), b)
}
// bindingToFormulaDraft: (rev - tax) / spend -> natural expr, parses
{
  const d = bindingToFormulaDraft({ source: 'aggregate', op: '/',
    left: { source: 'calculated', terms: [
      { coefficient: 1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'total_sales', account: 'a' } },
      { coefficient: -1, leaf: { source: 'supermetrics', dsId: 'SHP', metricField: 'tax', account: 'a' } },
    ] },
    right: { source: 'triplewhale', metric: 'ad_spend' } })
  assert.doesNotThrow(() => parse(d.expr))
  // should not contain " + -" (naive join artifact)
  assert.equal(d.expr.includes('+ -'), false, 'no "plus negative" in expr')
}

// ── Chart kinds (bar/line/pills/table) ─────────────────────────────────────────

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

// header draft → header config (no binding semantics — synthesize a no-op leaf)
{
  const cfg = buildBlockConfig({ kind: 'header', name: 'Q3', format: 'number',
    header: { source: 'header', level: 1 } })
  assert.equal(cfg.kind, 'header')
  assert.equal(cfg.headerLevel, 1)
}

// narrative draft → narrative config
{
  const cfg = buildBlockConfig({ kind: 'narrative', name: 'Notes', format: 'number',
    narrative: { source: 'narrative', body: '## Hi' } })
  assert.equal(cfg.kind, 'narrative')
  assert.equal(cfg.narrativeBody, '## Hi')
}

// pills draft → pills config (kind='pills', leaf binding)
{
  const cfg = buildBlockConfig({ kind: 'pills', name: 'Sessions', format: 'count',
    pills: { source: 'pills', leaf: { source: 'supermetrics', dsId: 'GAWA', metricField: 'sessions', account: '1' } } })
  assert.equal(cfg.kind, 'pills')
  assert.equal(cfg.binding.source, 'supermetrics')
}

// table draft → table config (kind='table', leaf binding with single dim)
{
  const cfg = buildBlockConfig({ kind: 'table', name: 'By channel', format: 'currency',
    table: { source: 'table', leaf: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }, dimension: 'Channel' } })
  assert.equal(cfg.kind, 'table')
  if (cfg.binding.source === 'supermetrics') {
    assert.deepEqual(cfg.binding.dimensions, ['Channel'])
  } else {
    throw new Error('expected supermetrics binding')
  }
}

// isDraftComplete: empty narrative body still completes (name required, body optional in v1)
assert.equal(isDraftComplete({ kind: 'narrative', name: 'X', format: 'number', narrative: { source: 'narrative', body: '' } }), true)
// isDraftComplete: header always completes once name set
assert.equal(isDraftComplete({ kind: 'header', name: 'X', format: 'number', header: { source: 'header', level: 2 } }), true)
// isDraftComplete: pills requires a complete leaf
assert.equal(isDraftComplete({ kind: 'pills', name: 'X', format: 'count', pills: { source: 'pills', leaf: { source: 'supermetrics', dsId: '', metricField: '', account: '' } } }), false)
// isDraftComplete: table requires complete leaf + dimension
assert.equal(isDraftComplete({ kind: 'table', name: 'X', format: 'count', table: { source: 'table', leaf: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }, dimension: '' } }), false)
assert.equal(isDraftComplete({ kind: 'table', name: 'X', format: 'count', table: { source: 'table', leaf: { source: 'supermetrics', dsId: 'AW', metricField: 'Cost', account: '1' }, dimension: 'Channel' } }), true)

// ── blockToManualDraft: reverse every editable kind into { source, draft } ──────

// header round-trips through buildBlockConfig (name, kind, level)
{
  const headerBlock = { id: 'h', name: 'Section A', format: 'number' as const, range: null,
    kind: 'header' as const, headerLevel: 1 as const,
    binding: { source: 'supermetrics' as const, dsId: '__static__', metricField: '__static__', account: '__static__' } }
  const { draft } = blockToManualDraft(headerBlock)
  assert.equal(draft.kind, 'header')
  const cfg = buildBlockConfig(draft)
  assert.equal(cfg.kind, 'header')
  assert.equal(cfg.name, 'Section A')
  assert.equal(cfg.headerLevel, 1)
}
// narrative round-trips (name, kind, body)
{
  const narrativeBlock = { id: 'n', name: 'Notes', format: 'number' as const, range: null,
    kind: 'narrative' as const, narrativeBody: '## Hi\n- a',
    binding: { source: 'supermetrics' as const, dsId: '__static__', metricField: '__static__', account: '__static__' } }
  const { draft } = blockToManualDraft(narrativeBlock)
  assert.equal(draft.kind, 'narrative')
  const cfg = buildBlockConfig(draft)
  assert.equal(cfg.kind, 'narrative')
  assert.equal(cfg.name, 'Notes')
  assert.equal(cfg.narrativeBody, '## Hi\n- a')
}
// missing headerLevel defaults to 2
{
  const headerBlock = { id: 'h', name: 'X', format: 'number' as const, range: null, kind: 'header' as const,
    binding: { source: 'supermetrics' as const, dsId: '__static__', metricField: '__static__', account: '__static__' } }
  const { draft } = blockToManualDraft(headerBlock)
  if (draft.kind === 'header') assert.equal(draft.header.level, 2)
}
// bar block round-trips: leaf + dimension recovered, source surfaced
{
  const barBlock = { id: 'b', name: 'Spend by Channel', format: 'currency' as const, range: null, kind: 'bar' as const,
    binding: { source: 'supermetrics' as const, dsId: 'AW', metricField: 'Cost', account: '1', dimensions: ['Network'] } }
  const { source, draft } = blockToManualDraft(barBlock)
  assert.equal(source, 'supermetrics')
  assert.equal(draft.kind, 'bar')
  if (draft.kind === 'bar') {
    assert.equal(draft.bar.dimension, 'Network')
    assert.equal(draft.bar.leaf.source, 'supermetrics')
    const cfg = buildBlockConfig(draft)
    if (cfg.binding.source === 'supermetrics') assert.deepEqual(cfg.binding.dimensions, ['Network'])
  }
}
// line block round-trips: granularity recovered
{
  const lineBlock = { id: 'l', name: 'Sales/day', format: 'currency' as const, range: null, kind: 'line' as const,
    binding: { source: 'shopify' as const, query: 'FROM sales SHOW net_sales', granularity: 'week' as const } }
  const { source, draft } = blockToManualDraft(lineBlock)
  assert.equal(source, 'shopify')
  assert.equal(draft.kind, 'line')
  if (draft.kind === 'line') assert.equal(draft.line.granularity, 'week')
}
// table block round-trips: dimension recovered
{
  const tableBlock = { id: 't', name: 'By channel', format: 'currency' as const, range: null, kind: 'table' as const,
    binding: { source: 'supermetrics' as const, dsId: 'AW', metricField: 'Cost', account: '1', dimensions: ['Channel'] } }
  const { draft } = blockToManualDraft(tableBlock)
  assert.equal(draft.kind, 'table')
  if (draft.kind === 'table') assert.equal(draft.table.dimension, 'Channel')
}
// pills block round-trips
{
  const pillsBlock = { id: 'p', name: 'Sessions', format: 'count' as const, range: null, kind: 'pills' as const,
    binding: { source: 'supermetrics' as const, dsId: 'GAWA', metricField: 'sessions', account: '1' } }
  const { draft } = blockToManualDraft(pillsBlock)
  assert.equal(draft.kind, 'pills')
}
// formula KPI round-trips
{
  const formulaBlock = { id: 'f', name: 'ROAS', format: 'number' as const, range: null,
    binding: { source: 'formula' as const, expr: '@a / @b', operands: { a: { kind: 'ref' as const, blockId: 'rev' }, b: { kind: 'metric' as const, leaf: { source: 'triplewhale' as const, metric: 'ad_spend' } } } } }
  const { source, draft } = blockToManualDraft(formulaBlock)
  assert.equal(source, 'formula')
  assert.equal(draft.kind, 'formula')
}

// ── Shopify leaf ───────────────────────────────────────────────────────────────

// leafToBinding: shopify carries the ShopifyQL query through
{
  const b = leafToBinding({ source: 'shopify', query: "FROM sales SHOW orders_first_time WHERE subscription_or_one_time = 'subscription'" })
  assert.equal(b.source, 'shopify')
  if (b.source === 'shopify') assert.equal(b.query, "FROM sales SHOW orders_first_time WHERE subscription_or_one_time = 'subscription'")
}
// isDraftComplete: shopify leaf complete iff query non-blank
assert.equal(isDraftComplete({ kind: 'leaf', name: 'Subs', format: 'count', leaf: { source: 'shopify', query: 'FROM sales SHOW orders_first_time' } }), true)
assert.equal(isDraftComplete({ kind: 'leaf', name: 'Subs', format: 'count', leaf: { source: 'shopify', query: '   ' } }), false)
// shopify leaf round-trips through leafToDraft -> leafToBinding
{
  const b = { source: 'shopify' as const, query: 'FROM sales SHOW net_sales' }
  assert.deepEqual(leafToBinding(leafToDraft(b)), b)
}

// bar with a Shopify leaf attaches the dimension to the shopify binding
{
  const cfg = buildBlockConfig({ kind: 'bar', name: 'Sales by Channel', format: 'currency',
    bar: { source: 'bar', leaf: { source: 'shopify', query: 'FROM sales SHOW net_sales' }, dimension: 'sales_channel' } })
  assert.equal(cfg.kind, 'bar')
  assert.equal(cfg.binding.source, 'shopify')
  if (cfg.binding.source === 'shopify') assert.deepEqual(cfg.binding.dimensions, ['sales_channel'])
}
// line with a Shopify leaf attaches the granularity
{
  const cfg = buildBlockConfig({ kind: 'line', name: 'Sales/day', format: 'currency',
    line: { source: 'line', leaf: { source: 'shopify', query: 'FROM sales SHOW net_sales' }, granularity: 'day' } })
  assert.equal(cfg.binding.source, 'shopify')
  if (cfg.binding.source === 'shopify') assert.equal(cfg.binding.granularity, 'day')
}

console.log('ok')
