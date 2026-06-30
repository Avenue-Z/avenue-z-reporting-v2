import type { BlockConfig, LeafBinding, AggregateBinding, AggregateOperand, CalculatedBinding, FormulaBinding, FormulaOperand, MetricFormat, Granularity, PersistedBlock } from '@/lib/dashboard/types'
import { operandKeys, parse } from '@/lib/dashboard/formula/parse'

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
  | { source: 'supermetrics'; dsId: string; metricField: string; account: string; expectedAccounts?: string[]; filters?: { column: string; values: string[] }[] }
  | { source: 'triplewhale'; metric: string; account?: string; filters?: { column: string; values: string[] }[] }
  | { source: 'shopify'; query: string }

/** Manual weighted-sum draft. `coefficient` is the raw input (parsed at build; blank → 1).
 *  Retained for back-compat reverse-mapping; not authored in the builder UI. */
export type CalculatedDraft = {
  source: 'calculated'
  terms: { coefficient: string; leaf: LeafDraft }[]
}

/** An aggregate operand draft: a single leaf or a weighted-sum calculation.
 *  Retained for back-compat reverse-mapping; not authored in the builder UI. */
export type OperandDraft =
  | { kind: 'leaf'; leaf: LeafDraft }
  | { kind: 'calculated'; calc: CalculatedDraft }

export type FormulaOperandDraft =
  | { kind: 'ref'; blockId: string }
  | { kind: 'metric'; leaf: LeafDraft }

export type FormulaDraft = {
  source: 'formula'
  expr: string
  operands: Record<string, FormulaOperandDraft>
}

/** Bar block draft: a leaf + a single dimension column, optional top-N cap. */
export type BarDraft = {
  source: 'bar'
  leaf: LeafDraft
  dimension: string
  /** Cap to the top N categories (+ "Other"); undefined = show all. */
  topN?: number
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

/** Table block draft: a leaf + a single dimension column (v1 single-dim, single-metric). */
export type TableDraft = {
  source: 'table'
  leaf: LeafDraft
  dimension: string
}

/** The whole manual form's state. KPI authoring is leaf or formula (formula supersedes
 *  the retired aggregate/calculated builders); charts + static kinds round it out. */
export type ManualDraft =
  | { kind: 'leaf'; name: string; format: MetricFormat; leaf: LeafDraft }
  | { kind: 'formula'; name: string; format: MetricFormat; formula: FormulaDraft }
  | { kind: 'bar'; name: string; format: MetricFormat; bar: BarDraft }
  | { kind: 'line'; name: string; format: MetricFormat; line: LineDraft }
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
    return {
      source: 'supermetrics', dsId: d.dsId, metricField: d.metricField, account: d.account,
      ...(d.expectedAccounts?.length ? { expectedAccounts: d.expectedAccounts } : {}),
      ...(filters.length ? { filters } : {}),
    }
  }
  const filters = (d.filters ?? [])
    .map((f) => ({ column: f.column, values: f.values.filter((v) => v !== '') }))
    .filter((f) => f.column !== '' && f.values.length > 0)
  return {
    source: 'triplewhale', metric: d.metric,
    ...(d.account ? { account: d.account } : {}),
    ...(filters.length ? { filters } : {}),
  }
}

/** Build a calculated binding: keep terms with a complete leaf and a numeric
 *  coefficient (blank → 1); drop the rest. Back-compat helper (no longer authored). */
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

/** Build a formula binding: keep only operands whose key is used in the expr,
 *  converting metric drafts via leafToBinding. */
export function formulaToBinding(d: FormulaDraft): FormulaBinding {
  let used: string[]
  try { used = operandKeys(d.expr) } catch { used = [] }
  const operands: Record<string, FormulaOperand> = {}
  for (const key of used) {
    const op = d.operands[key]
    if (!op) continue
    operands[key] = op.kind === 'ref' ? { kind: 'ref', blockId: op.blockId } : { kind: 'metric', leaf: leafToBinding(op.leaf) }
  }
  return { source: 'formula', expr: d.expr, operands }
}

/** Convert a bar draft into a Bar block config (kind: 'bar', leaf binding with dimensions).
 *  Works for every leaf source incl. shopify (resolveShopifyGrouped handles the GROUP BY). */
export function barToBlockConfig(d: BarDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'> {
  const base = leafToBinding(d.leaf)
  const binding: LeafBinding = { ...base, dimensions: [d.dimension] }
  return { name, format, range: null, binding, kind: 'bar', ...(d.topN !== undefined ? { topN: d.topN } : {}) }
}

/** Convert a line draft into a Line block config (kind: 'line', leaf binding with granularity).
 *  Works for every leaf source incl. shopify (resolveShopifySeries handles the time bucket). */
export function lineToBlockConfig(d: LineDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'> {
  const base = leafToBinding(d.leaf)
  const binding: LeafBinding = { ...base, granularity: d.granularity }
  return { name, format, range: null, binding, kind: 'line' }
}

/** Convert a table draft into a Table block config (kind: 'table', leaf binding with one dim). */
export function tableToBlockConfig(d: TableDraft, name: string, format: MetricFormat): Omit<BlockConfig, 'id'> {
  const base = leafToBinding(d.leaf)
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

export function leafToDraft(b: LeafBinding): LeafDraft {
  if (b.source === 'shopify') {
    return { source: 'shopify', query: b.query }
  }
  const filters = b.filters?.length ? { filters: b.filters.map((f) => ({ column: f.column, values: [...f.values] })) } : {}
  if (b.source === 'supermetrics') {
    return {
      source: 'supermetrics', dsId: b.dsId, metricField: b.metricField, account: b.account,
      ...(b.expectedAccounts?.length ? { expectedAccounts: [...b.expectedAccounts] } : {}),
      ...filters,
    }
  }
  return {
    source: 'triplewhale', metric: b.metric,
    ...(b.account ? { account: b.account } : {}),
    ...filters,
  }
}

export function formulaToDraft(b: FormulaBinding): FormulaDraft {
  const operands: Record<string, FormulaOperandDraft> = {}
  for (const [k, op] of Object.entries(b.operands)) {
    operands[k] = op.kind === 'ref' ? { kind: 'ref', blockId: op.blockId } : { kind: 'metric', leaf: leafToDraft(op.leaf) }
  }
  return { source: 'formula', expr: b.expr, operands }
}

/** Convert a legacy aggregate/calculated binding into an equivalent formula draft.
 *  Operand keys are unique (m0, m1, …); negative coefficients rely on unary minus. */
export function bindingToFormulaDraft(b: AggregateBinding | CalculatedBinding): FormulaDraft {
  const operands: Record<string, FormulaOperandDraft> = {}
  let n = 0
  const metricExpr = (leaf: LeafBinding): string => {
    const k = `m${n++}`
    operands[k] = { kind: 'metric', leaf: leafToDraft(leaf) }
    return `@${k}`
  }
  const calcExpr = (c: CalculatedBinding): string => {
    const parts: string[] = []
    for (const t of c.terms) {
      const ref = metricExpr(t.leaf)
      if (parts.length === 0) {
        // First term: emit without leading connector
        if (t.coefficient === 1) parts.push(ref)
        else if (t.coefficient === -1) parts.push(`-${ref}`)
        else if (t.coefficient < 0) parts.push(`-${Math.abs(t.coefficient)} * ${ref}`)
        else parts.push(`${t.coefficient} * ${ref}`)
      } else {
        // Subsequent terms: choose connector based on sign
        if (t.coefficient === 1) parts.push(`+ ${ref}`)
        else if (t.coefficient === -1) parts.push(`- ${ref}`)
        else if (t.coefficient < 0) parts.push(`- ${Math.abs(t.coefficient)} * ${ref}`)
        else parts.push(`+ ${t.coefficient} * ${ref}`)
      }
    }
    return parts.join(' ')
  }
  const operandExpr = (o: AggregateOperand): string =>
    o.source === 'calculated' ? `(${calcExpr(o)})` : metricExpr(o)
  const expr = b.source === 'calculated' ? calcExpr(b) : `${operandExpr(b.left)} ${b.op} ${operandExpr(b.right)}`
  return { source: 'formula', expr, operands }
}

/** Reverse a persisted block into a builder draft + its source so Edit opens pre-filled.
 *  Covers every editable kind: kpi (leaf/formula, legacy aggregate/calculated folded into
 *  a formula draft), bar/line/table charts, and header/narrative static kinds. */
export function blockToManualDraft(block: PersistedBlock): { source: 'supermetrics' | 'triplewhale' | 'shopify' | 'formula'; draft: ManualDraft } {
  const { name, format, binding } = block
  const kind = block.kind ?? 'kpi'

  if (kind === 'header') {
    return { source: 'formula', draft: { kind: 'header', name, format, header: { source: 'header', level: block.headerLevel ?? 2 } } }
  }
  if (kind === 'narrative') {
    return { source: 'formula', draft: { kind: 'narrative', name, format, narrative: { source: 'narrative', body: block.narrativeBody ?? '' } } }
  }

  // Chart kinds carry a leaf binding (sm/tw/shopify) annotated with dimensions/granularity.
  if (kind === 'bar' || kind === 'table') {
    const leaf = leafToDraft(binding as LeafBinding)
    const dimension = (binding as LeafBinding).dimensions?.[0] ?? ''
    const source = leaf.source
    return kind === 'bar'
      ? { source, draft: { kind: 'bar', name, format, bar: { source: 'bar', leaf, dimension, ...(block.topN !== undefined ? { topN: block.topN } : {}) } } }
      : { source, draft: { kind: 'table', name, format, table: { source: 'table', leaf, dimension } } }
  }
  if (kind === 'line') {
    const leaf = leafToDraft(binding as LeafBinding)
    const granularity = (binding as LeafBinding).granularity ?? 'day'
    return { source: leaf.source, draft: { kind: 'line', name, format, line: { source: 'line', leaf, granularity } } }
  }

  // KPI: scalar leaf, formula, or a legacy aggregate/calculated folded into a formula draft.
  if (binding.source === 'supermetrics' || binding.source === 'triplewhale' || binding.source === 'shopify') {
    return { source: binding.source, draft: { kind: 'leaf', name, format, leaf: leafToDraft(binding) } }
  }
  if (binding.source === 'formula') {
    return { source: 'formula', draft: { kind: 'formula', name, format, formula: formulaToDraft(binding) } }
  }
  return { source: 'formula', draft: { kind: 'formula', name, format, formula: bindingToFormulaDraft(binding) } }
}

function isFormulaOperandComplete(op: FormulaOperandDraft): boolean {
  return op.kind === 'ref' ? op.blockId !== '' : isLeafComplete(op.leaf)
}

export function isFormulaComplete(d: FormulaDraft): boolean {
  let used: string[]
  try { parse(d.expr); used = operandKeys(d.expr) } catch { return false }
  if (used.length === 0 && d.expr.trim() === '') return false
  return used.every((k) => { const op = d.operands[k]; return !!op && isFormulaOperandComplete(op) })
}

/** Assemble the final block config (id is assigned later, at confirm). */
export function buildBlockConfig(d: ManualDraft): Omit<BlockConfig, 'id'> {
  if (d.kind === 'leaf')      return { name: d.name, format: d.format, range: null, binding: leafToBinding(d.leaf) }
  if (d.kind === 'formula')   return { name: d.name, format: d.format, range: null, binding: formulaToBinding(d.formula) }
  if (d.kind === 'bar')       return barToBlockConfig(d.bar, d.name, d.format)
  if (d.kind === 'line')      return lineToBlockConfig(d.line, d.name, d.format)
  if (d.kind === 'table')     return tableToBlockConfig(d.table, d.name, d.format)
  if (d.kind === 'header')    return headerToBlockConfig(d.header, d.name, d.format)
  return narrativeToBlockConfig(d.narrative, d.name, d.format)
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
  if (d.kind === 'leaf')    return isLeafComplete(d.leaf)
  if (d.kind === 'formula') return isFormulaComplete(d.formula)
  if (d.kind === 'bar')     return isLeafComplete(d.bar.leaf) && d.bar.dimension.trim() !== ''
  if (d.kind === 'line')    return isLeafComplete(d.line.leaf) && (GRANULARITIES as string[]).includes(d.line.granularity)
  if (d.kind === 'table')   return isLeafComplete(d.table.leaf) && d.table.dimension.trim() !== ''
  if (d.kind === 'header')  return true
  return true // narrative — name is required (checked above); body is optional in v1
}
