import type { BlockConfig, LeafBinding, AggregateBinding, AggregateOperand, CalculatedBinding, FormulaBinding, FormulaOperand, MetricFormat, PersistedBlock } from '@/lib/dashboard/types'
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

export type FormulaOperandDraft =
  | { kind: 'ref'; blockId: string }
  | { kind: 'metric'; leaf: LeafDraft }

export type FormulaDraft = {
  source: 'formula'
  expr: string
  operands: Record<string, FormulaOperandDraft>
}

/** The whole manual form's state. */
export type ManualDraft =
  | { kind: 'leaf'; name: string; format: MetricFormat; leaf: LeafDraft }
  | { kind: 'calculated'; name: string; format: MetricFormat; calc: CalculatedDraft }
  | { kind: 'aggregate'; name: string; format: MetricFormat; op: AggregateBinding['op']; left: OperandDraft; right: OperandDraft }
  | { kind: 'formula'; name: string; format: MetricFormat; formula: FormulaDraft }

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

export function leafToDraft(b: LeafBinding): LeafDraft {
  const filters = b.filters?.length ? { filters: b.filters.map((f) => ({ column: f.column, values: [...f.values] })) } : {}
  return b.source === 'supermetrics'
    ? { source: 'supermetrics', dsId: b.dsId, metricField: b.metricField, account: b.account, ...filters }
    : { source: 'triplewhale', metric: b.metric, ...filters }
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
  const calcExpr = (c: CalculatedBinding): string =>
    c.terms.map((t) => (t.coefficient === 1 ? metricExpr(t.leaf) : `${t.coefficient} * ${metricExpr(t.leaf)}`)).join(' + ')
  const operandExpr = (o: AggregateOperand): string =>
    o.source === 'calculated' ? `(${calcExpr(o)})` : metricExpr(o)
  const expr = b.source === 'calculated' ? calcExpr(b) : `${operandExpr(b.left)} ${b.op} ${operandExpr(b.right)}`
  return { source: 'formula', expr, operands }
}

export function blockToManualDraft(block: PersistedBlock): { source: 'supermetrics' | 'triplewhale' | 'formula'; draft: ManualDraft } {
  const { name, format, binding } = block
  if (binding.source === 'supermetrics' || binding.source === 'triplewhale') {
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
  const binding =
    d.kind === 'leaf'
      ? leafToBinding(d.leaf)
      : d.kind === 'calculated'
        ? calculatedToBinding(d.calc)
        : d.kind === 'formula'
          ? formulaToBinding(d.formula)
          : { source: 'aggregate' as const, op: d.op, left: operandToBinding(d.left), right: operandToBinding(d.right) }
  return { name: d.name, format: d.format, range: null, binding }
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

export function isDraftComplete(d: ManualDraft): boolean {
  if (d.name.trim() === '') return false
  if (d.kind === 'leaf') return isLeafComplete(d.leaf)
  if (d.kind === 'calculated') return isCalculatedComplete(d.calc)
  if (d.kind === 'formula') return isFormulaComplete(d.formula)
  return isOperandComplete(d.left) && isOperandComplete(d.right)
}
