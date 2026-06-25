import type { BlockConfig, LeafBinding, AggregateBinding, AggregateOperand, CalculatedBinding, MetricFormat, Granularity, PersistedBlock } from '@/lib/dashboard/types'

/**
 * Common TripleWhale metrics surfaced at the top of the builder's metric picker,
 * above the discovered raw columns. Each `value` must be a curated key in
 * `lib/triplewhale/queries.ts`'s `TW_METRIC_SQL` (the adapter resolves it to the
 * proper formula — incl. ratios like ROAS/CPA that can't be a single SUM'd column).
 * Drift from TW_METRIC_SQL is guarded by build-config.test.ts.
 */
export const COMMON_TW_METRICS: { value: string; label: string }[] = [
  { value: 'revenue', label: 'Revenue' },
  { value: 'ad_spend', label: 'Ad spend' },
  { value: 'blended_roas', label: 'Blended ROAS' },
  { value: 'cpa', label: 'CPA' },
  { value: 'conv_rate', label: 'Conversion rate' },
  { value: 'purchases', label: 'Purchases' },
]

/** A single leaf's manual selections. */
export type LeafDraft =
  | { source: 'supermetrics'; dsId: string; metricField: string; account: string; filters?: { column: string; values: string[] }[] }
  | { source: 'triplewhale'; metric: string; filters?: { column: string; values: string[] }[] }
  | { source: 'shopify'; query: string }

/** Manual weighted-sum draft. `coefficient` is the raw input (parsed at build; blank → 1). */
export type CalculatedDraft = {
  source: 'calculated'
  terms: { coefficient: string; leaf: LeafDraft }[]
}

/** An aggregate operand draft: a single leaf or a weighted-sum calculation. */
export type OperandDraft =
  | { kind: 'leaf'; leaf: LeafDraft }
  | { kind: 'calculated'; calc: CalculatedDraft }

/** Bar block draft: a leaf + a single dimension column. */
export type BarDraft = {
  source: 'bar'
  leaf: LeafDraft
  dimension: string
}

/** Line block draft: a leaf + a granularity. */
export type LineDraft = {
  source: 'line'
  leaf: LeafDraft
  granularity: Granularity
}

/** Header block draft: static heading. No data binding. */
export type HeaderDraft = {
  source: 'header'
  level: 1 | 2 | 3
}

/** Narrative block draft: static markdown prose. No data binding. */
export type NarrativeDraft = {
  source: 'narrative'
  body: string
}

/** Pills block draft: a single leaf (v1 — no aggregate/calculated). */
export type PillsDraft = {
  source: 'pills'
  leaf: LeafDraft
}

/** Table block draft: a leaf + a single dimension column (v1 single-dim, single-metric). */
export type TableDraft = {
  source: 'table'
  leaf: LeafDraft
  dimension: string
}

/** The whole manual form's state. */
export type ManualDraft =
  | { kind: 'leaf'; name: string; format: MetricFormat; leaf: LeafDraft }
  | { kind: 'calculated'; name: string; format: MetricFormat; calc: CalculatedDraft }
  | { kind: 'aggregate'; name: string; format: MetricFormat; op: AggregateBinding['op']; left: OperandDraft; right: OperandDraft }
  | { kind: 'bar'; name: string; format: MetricFormat; bar: BarDraft }
  | { kind: 'line'; name: string; format: MetricFormat; line: LineDraft }
  | { kind: 'pills'; name: string; format: MetricFormat; pills: PillsDraft }
  | { kind: 'table'; name: string; format: MetricFormat; table: TableDraft }
  | { kind: 'header'; name: string; format: MetricFormat; header: HeaderDraft }
  | { kind: 'narrative'; name: string; format: MetricFormat; narrative: NarrativeDraft }

export function leafToBinding(d: LeafDraft): LeafBinding {
  if (d.source === 'shopify') {
    return { source: 'shopify', query: d.query }
  }
  if (d.source === 'supermetrics') {
    const filters = (d.filters ?? [])
      .map((f) => ({ column: f.column, values: f.values.filter((v) => v !== '') }))
      .filter((f) => f.column !== '' && f.values.length > 0)
    return { source: 'supermetrics', dsId: d.dsId, metricField: d.metricField, account: d.account, ...(filters.length ? { filters } : {}) }
  }
  const filters = (d.filters ?? [])
    .map((f) => ({ column: f.column, values: f.values.filter((v) => v !== '') }))
    .filter((f) => f.column !== '' && f.values.length > 0)
  return { source: 'triplewhale', metric: d.metric, ...(filters.length ? { filters } : {}) }
}

/** Build a calculated binding: keep terms with a complete leaf and a numeric
 *  coefficient (blank → 1); drop the rest. */
export function calculatedToBinding(c: CalculatedDraft): CalculatedBinding {
  const terms = c.terms
    .filter((t) => isLeafComplete(t.leaf))
    .map((t) => ({ coefficient: t.coefficient.trim() === '' ? 1 : Number(t.coefficient), leaf: leafToBinding(t.leaf) }))
    .filter((t) => Number.isFinite(t.coefficient))
  return { source: 'calculated', terms }
}

export function operandToBinding(o: OperandDraft): AggregateOperand {
  return o.kind === 'calculated' ? calculatedToBinding(o.calc) : leafToBinding(o.leaf)
}

export function isOperandComplete(o: OperandDraft): boolean {
  return o.kind === 'calculated' ? isCalculatedComplete(o.calc) : isLeafComplete(o.leaf)
}

/** Convert a bar draft into a Bar block config (kind: 'bar', leaf binding with dimensions). */
export function barToBlockConfig(d: BarDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'> {
  const base = leafToBinding(d.leaf)
  // SM/TW carry an optional `dimensions: string[]`; Shopify (ShopifyQL) has none and isn't
  // offered as a bar source, so narrow it out before adding the dimension.
  if (base.source === 'shopify') throw new Error('Shopify is not supported for bar blocks')
  const binding: LeafBinding = { ...base, dimensions: [d.dimension] }
  return { name, format, range: null, binding, kind: 'bar' }
}

/** Convert a line draft into a Line block config (kind: 'line', leaf binding with granularity). */
export function lineToBlockConfig(d: LineDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'> {
  const base = leafToBinding(d.leaf)
  if (base.source === 'shopify') throw new Error('Shopify is not supported for line blocks')
  const binding: LeafBinding = { ...base, granularity: d.granularity }
  return { name, format, range: null, binding, kind: 'line' }
}

/** Convert a pills draft into a Pills block config (kind: 'pills', scalar leaf binding). */
export function pillsToBlockConfig(d: PillsDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'> {
  return { name, format, range: null, binding: leafToBinding(d.leaf), kind: 'pills' }
}

/** Convert a table draft into a Table block config (kind: 'table', leaf binding with one dim). */
export function tableToBlockConfig(d: TableDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'> {
  const base = leafToBinding(d.leaf)
  if (base.source === 'shopify') throw new Error('Shopify is not supported for table blocks')
  const binding: LeafBinding = { ...base, dimensions: [d.dimension] }
  return { name, format, range: null, binding, kind: 'table' }
}

/** Convert a header draft into a Header block config (kind: 'header'). Binding is a
 *  placeholder leaf — header bodies ignore it. We synthesize one so BlockConfig stays
 *  unconditionally typed. */
export function headerToBlockConfig(d: HeaderDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'> {
  const placeholder: LeafBinding = { source: 'supermetrics', dsId: '__static__', metricField: '__static__', account: '__static__' }
  return { name, format, range: null, binding: placeholder, kind: 'header', headerLevel: d.level }
}

/** Convert a narrative draft into a Narrative block config (kind: 'narrative'). Same
 *  placeholder-binding rationale as headerToBlockConfig. */
export function narrativeToBlockConfig(d: NarrativeDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'> {
  const placeholder: LeafBinding = { source: 'supermetrics', dsId: '__static__', metricField: '__static__', account: '__static__' }
  return { name, format, range: null, binding: placeholder, kind: 'narrative', narrativeBody: d.body }
}

/** Assemble the final block config (id is assigned later, at confirm). */
export function buildBlockConfig(d: ManualDraft): Omit<BlockConfig, 'id'> {
  if (d.kind === 'leaf')       return { name: d.name, format: d.format, range: null, binding: leafToBinding(d.leaf) }
  if (d.kind === 'calculated') return { name: d.name, format: d.format, range: null, binding: calculatedToBinding(d.calc) }
  if (d.kind === 'aggregate')  return { name: d.name, format: d.format, range: null,
    binding: { source: 'aggregate' as const, op: d.op, left: operandToBinding(d.left), right: operandToBinding(d.right) } }
  if (d.kind === 'bar')        return barToBlockConfig(d.bar, d.name, d.format)
  if (d.kind === 'line')       return lineToBlockConfig(d.line, d.name, d.format)
  if (d.kind === 'pills')      return pillsToBlockConfig(d.pills, d.name, d.format)
  if (d.kind === 'table')      return tableToBlockConfig(d.table, d.name, d.format)
  if (d.kind === 'header')     return headerToBlockConfig(d.header, d.name, d.format)
  return narrativeToBlockConfig(d.narrative, d.name, d.format)
}

/** Reverse a persisted block into a builder draft so edit opens pre-filled.
 *  Scoped to the kinds we currently edit (header, narrative). */
export function blockToManualDraft(block: PersistedBlock): ManualDraft {
  const { name, format } = block
  if (block.kind === 'header') {
    return { kind: 'header', name, format, header: { source: 'header', level: block.headerLevel ?? 2 } }
  }
  if (block.kind === 'narrative') {
    return { kind: 'narrative', name, format, narrative: { source: 'narrative', body: block.narrativeBody ?? '' } }
  }
  throw new Error(`blockToManualDraft: unsupported kind ${block.kind ?? 'kpi'}`)
}

/** Best-guess format from a Supermetrics field data_type (user can override). */
export function formatFromDataType(dataType?: string): MetricFormat {
  const t = (dataType ?? '').toLowerCase()
  if (t.includes('currency')) return 'currency'
  if (t.includes('percent')) return 'percent'
  if (t.includes('int')) return 'count'
  return 'number'
}

export function isLeafComplete(d: LeafDraft): boolean {
  if (d.source === 'shopify') return d.query.trim() !== ''
  return d.source === 'supermetrics'
    ? d.dsId !== '' && d.metricField !== '' && d.account !== ''
    : d.metric !== ''
}

export function isCalculatedComplete(c: CalculatedDraft): boolean {
  return c.terms.some((t) => isLeafComplete(t.leaf) && (t.coefficient.trim() === '' || Number.isFinite(Number(t.coefficient))))
}

const GRANULARITIES: Granularity[] = ['day', 'week', 'month']

export function isDraftComplete(d: ManualDraft): boolean {
  if (d.name.trim() === '') return false
  if (d.kind === 'leaf')       return isLeafComplete(d.leaf)
  if (d.kind === 'calculated') return isCalculatedComplete(d.calc)
  if (d.kind === 'aggregate')  return isOperandComplete(d.left) && isOperandComplete(d.right)
  if (d.kind === 'bar')        return isLeafComplete(d.bar.leaf) && d.bar.dimension.trim() !== ''
  if (d.kind === 'line')       return isLeafComplete(d.line.leaf) && (GRANULARITIES as string[]).includes(d.line.granularity)
  if (d.kind === 'pills')      return isLeafComplete(d.pills.leaf)
  if (d.kind === 'table')      return isLeafComplete(d.table.leaf) && d.table.dimension.trim() !== ''
  if (d.kind === 'header')     return true
  return true // narrative — name is required (checked above); body is optional in v1
}
