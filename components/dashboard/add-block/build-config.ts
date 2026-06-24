import type { BlockConfig, LeafBinding, AggregateBinding, AggregateOperand, CalculatedBinding, MetricFormat, Granularity } from '@/lib/dashboard/types'

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

/** The whole manual form's state. */
export type ManualDraft =
  | { kind: 'leaf'; name: string; format: MetricFormat; leaf: LeafDraft }
  | { kind: 'calculated'; name: string; format: MetricFormat; calc: CalculatedDraft }
  | { kind: 'aggregate'; name: string; format: MetricFormat; op: AggregateBinding['op']; left: OperandDraft; right: OperandDraft }
  | { kind: 'bar'; name: string; format: MetricFormat; bar: BarDraft }
  | { kind: 'line'; name: string; format: MetricFormat; line: LineDraft }

export function leafToBinding(d: LeafDraft): LeafBinding {
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
  // SupermetricsBinding and TripleWhaleBinding both carry an optional `dimensions: string[]`,
  // so spreading the union and adding the field preserves the discriminated source.
  const binding: LeafBinding = { ...base, dimensions: [d.dimension] }
  return { name, format, range: null, binding, kind: 'bar' }
}

/** Convert a line draft into a Line block config (kind: 'line', leaf binding with granularity). */
export function lineToBlockConfig(d: LineDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'> {
  const base = leafToBinding(d.leaf)
  const binding: LeafBinding = { ...base, granularity: d.granularity }
  return { name, format, range: null, binding, kind: 'line' }
}

/** Assemble the final block config (id is assigned later, at confirm). */
export function buildBlockConfig(d: ManualDraft): Omit<BlockConfig, 'id'> {
  if (d.kind === 'leaf')       return { name: d.name, format: d.format, range: null, binding: leafToBinding(d.leaf) }
  if (d.kind === 'calculated') return { name: d.name, format: d.format, range: null, binding: calculatedToBinding(d.calc) }
  if (d.kind === 'aggregate')  return { name: d.name, format: d.format, range: null,
    binding: { source: 'aggregate' as const, op: d.op, left: operandToBinding(d.left), right: operandToBinding(d.right) } }
  if (d.kind === 'bar')        return barToBlockConfig(d.bar, d.name, d.format)
  return lineToBlockConfig(d.line, d.name, d.format)
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
  return isLeafComplete(d.line.leaf) && (GRANULARITIES as string[]).includes(d.line.granularity)
}
