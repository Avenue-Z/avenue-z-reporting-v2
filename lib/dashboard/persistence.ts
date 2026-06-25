import type {
  AggregateBinding, AggregateOperand, Binding, BlockKind, BlockLayout, CalculatedBinding, DashboardConfig, Granularity, LeafBinding,
  MetricFormat, PersistedBlock, SupermetricsBinding, TripleWhaleBinding,
} from './types'

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const FORMATS: MetricFormat[] = ['currency', 'percent', 'count', 'number']
const OPS: AggregateBinding['op'][] = ['+', '-', '*', '/']
const BLOCK_KINDS: BlockKind[] = ['kpi', 'bar', 'line', 'table', 'narrative', 'header']
const GRANULARITIES: Granularity[] = ['day', 'week', 'month']
const SM_DIM_RE = /^[A-Za-z0-9_]+$/                     // mirrors SM_COLUMN_RE in lib/dashboard/adapters/supermetrics.ts
const TW_DIM_RE = /^[a-z0-9_]+$/                        // mirrors isSafeColumn in lib/triplewhale/queries.ts

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNonEmptyStr = (v: unknown): v is string => isStr(v) && v.length > 0

function parseFilters(v: unknown, path: string): Parsed<{ column: string; values: string[] }[]> {
  if (!Array.isArray(v)) return { ok: false, error: `${path}: expected array` }
  const out: { column: string; values: string[] }[] = []
  for (const f of v) {
    if (!isObj(f) || !isNonEmptyStr(f.column)) return { ok: false, error: `${path}: expected {column, values}[]` }
    if (Array.isArray(f.values) && f.values.every(isStr)) {
      out.push({ column: f.column, values: f.values as string[] })
    } else if (isStr(f.value)) {
      out.push({ column: f.column, values: [f.value] }) // legacy {column,value}
    } else {
      return { ok: false, error: `${path}: expected {column, values}[]` }
    }
  }
  return { ok: true, value: out }
}

function parseRange(v: unknown, path: string): Parsed<{ dateRange: string; compareRange: string | null }> {
  if (!isObj(v)) return { ok: false, error: `${path}: expected object` }
  if (!isNonEmptyStr(v.dateRange)) return { ok: false, error: `${path}.dateRange: expected non-empty string` }
  if (!(v.compareRange === null || isStr(v.compareRange))) return { ok: false, error: `${path}.compareRange: expected string or null` }
  return { ok: true, value: { dateRange: v.dateRange, compareRange: v.compareRange } }
}

function parseLeaf(v: unknown, path: string): Parsed<LeafBinding> {
  if (!isObj(v)) return { ok: false, error: `${path}: expected object` }
  if (v.source === 'supermetrics') {
    if (!isNonEmptyStr(v.dsId)) return { ok: false, error: `${path}.dsId: expected non-empty string` }
    if (!isNonEmptyStr(v.metricField)) return { ok: false, error: `${path}.metricField: expected non-empty string` }
    if (!isNonEmptyStr(v.account)) return { ok: false, error: `${path}.account: expected non-empty string` }
    if (v.expectedAccounts !== undefined && !(Array.isArray(v.expectedAccounts) && v.expectedAccounts.every(isStr)))
      return { ok: false, error: `${path}.expectedAccounts: expected string[]` }
    const b: SupermetricsBinding = { source: 'supermetrics', dsId: v.dsId, metricField: v.metricField, account: v.account }
    if (v.expectedAccounts !== undefined) b.expectedAccounts = v.expectedAccounts as string[]
    if (v.filters !== undefined) {
      const pf = parseFilters(v.filters, `${path}.filters`)
      if (!pf.ok) return pf
      b.filters = pf.value
    }
    if (v.dimensions !== undefined) {
      if (!Array.isArray(v.dimensions) || v.dimensions.length !== 1) {
        return { ok: false, error: `${path}.dimensions: expected array of length 1 (v1)` }
      }
      const d = v.dimensions[0]
      if (!isNonEmptyStr(d) || !SM_DIM_RE.test(d)) {
        return { ok: false, error: `${path}.dimensions[0]: expected safe SM column (matching ^[A-Za-z0-9_]+$)` }
      }
      b.dimensions = [d]
    }
    if (v.granularity !== undefined) {
      if (!GRANULARITIES.includes(v.granularity as Granularity)) {
        return { ok: false, error: `${path}.granularity: expected one of ${GRANULARITIES.join(',')}` }
      }
      b.granularity = v.granularity as Granularity
    }
    return { ok: true, value: b }
  }
  if (v.source === 'triplewhale') {
    if (!isNonEmptyStr(v.metric)) return { ok: false, error: `${path}.metric: expected non-empty string` }
    if (v.account !== undefined && !isStr(v.account)) return { ok: false, error: `${path}.account: expected string` }
    const b: TripleWhaleBinding = { source: 'triplewhale', metric: v.metric }
    if (v.account !== undefined) b.account = v.account
    if (v.filters !== undefined) {
      const pf = parseFilters(v.filters, `${path}.filters`)
      if (!pf.ok) return pf
      b.filters = pf.value
    }
    if (v.dimensions !== undefined) {
      if (!Array.isArray(v.dimensions) || v.dimensions.length !== 1) {
        return { ok: false, error: `${path}.dimensions: expected array of length 1 (v1)` }
      }
      const d = v.dimensions[0]
      if (!isNonEmptyStr(d) || !TW_DIM_RE.test(d)) {
        return { ok: false, error: `${path}.dimensions[0]: expected safe TW column (matching ^[a-z0-9_]+$)` }
      }
      b.dimensions = [d]
    }
    if (v.granularity !== undefined) {
      if (!GRANULARITIES.includes(v.granularity as Granularity)) {
        return { ok: false, error: `${path}.granularity: expected one of ${GRANULARITIES.join(',')}` }
      }
      b.granularity = v.granularity as Granularity
    }
    return { ok: true, value: b }
  }
  return { ok: false, error: `${path}.source: expected 'supermetrics' or 'triplewhale'` }
}

function parseCalculated(v: unknown, path: string): Parsed<CalculatedBinding> {
  if (!isObj(v)) return { ok: false, error: `${path}: expected object` }
  if (!Array.isArray(v.terms) || v.terms.length === 0) return { ok: false, error: `${path}.terms: expected non-empty array` }
  const terms: CalculatedBinding['terms'] = []
  for (let i = 0; i < v.terms.length; i++) {
    const t = v.terms[i]
    if (!isObj(t)) return { ok: false, error: `${path}.terms[${i}]: expected object` }
    if (typeof t.coefficient !== 'number' || !Number.isFinite(t.coefficient)) {
      return { ok: false, error: `${path}.terms[${i}].coefficient: expected finite number` }
    }
    const leaf = parseLeaf(t.leaf, `${path}.terms[${i}].leaf`)
    if (!leaf.ok) return leaf
    terms.push({ coefficient: t.coefficient, leaf: leaf.value })
  }
  return { ok: true, value: { source: 'calculated', terms } }
}

function parseOperand(v: unknown, path: string): Parsed<AggregateOperand> {
  if (isObj(v) && v.source === 'calculated') return parseCalculated(v, path)
  return parseLeaf(v, path)
}

function parseBinding(v: unknown, path: string): Parsed<Binding> {
  if (!isObj(v)) return { ok: false, error: `${path}: expected object` }
  if (v.source === 'aggregate') {
    if (!OPS.includes(v.op as AggregateBinding['op'])) return { ok: false, error: `${path}.op: expected one of ${OPS.join(',')}` }
    const left = parseOperand(v.left, `${path}.left`)
    if (!left.ok) return left
    const right = parseOperand(v.right, `${path}.right`)
    if (!right.ok) return right
    const b: AggregateBinding = { source: 'aggregate', op: v.op as AggregateBinding['op'], left: left.value, right: right.value }
    return { ok: true, value: b }
  }
  if (v.source === 'calculated') return parseCalculated(v, path)
  return parseLeaf(v, path)
}

function parseLayout(v: unknown, path: string): Parsed<BlockLayout> {
  if (!isObj(v)) return { ok: false, error: `${path}: expected object` }
  const { x, y, w, h } = v
  const okN = (n: unknown) => typeof n === 'number' && Number.isFinite(n) && n >= 0
  if (!okN(x) || !okN(y) || !okN(w) || !okN(h)) {
    return { ok: false, error: `${path}: expected { x, y, w, h } as non-negative finite numbers` }
  }
  return { ok: true, value: { x: x as number, y: y as number, w: w as number, h: h as number } }
}

export function parseBlockConfig(
  v: unknown,
  path = 'block',
): { ok: true; block: PersistedBlock } | { ok: false; error: string } {
  if (!isObj(v)) return { ok: false, error: `${path}: expected object` }
  if (!isNonEmptyStr(v.id)) return { ok: false, error: `${path}.id: expected non-empty string` }
  if (!isNonEmptyStr(v.name)) return { ok: false, error: `${path}.name: expected non-empty string` }
  if (!FORMATS.includes(v.format as MetricFormat)) return { ok: false, error: `${path}.format: expected one of ${FORMATS.join(',')}` }

  let kind: BlockKind | undefined
  if (v.kind !== undefined) {
    if (!BLOCK_KINDS.includes(v.kind as BlockKind)) {
      return { ok: false, error: `${path}.kind: expected one of ${BLOCK_KINDS.join(',')}` }
    }
    kind = v.kind as BlockKind
  }

  let range: PersistedBlock['range'] = null
  if (v.range !== null) {
    const r = parseRange(v.range, `${path}.range`)
    if (!r.ok) return r
    range = r.value
  }

  let layout: BlockLayout | undefined
  if (v.layout !== undefined) {
    const pl = parseLayout(v.layout, `${path}.layout`)
    if (!pl.ok) return pl
    layout = pl.value
  }

  let subLabel: string | undefined
  if (v.subLabel !== undefined) {
    if (!isStr(v.subLabel)) return { ok: false, error: `${path}.subLabel: expected string` }
    subLabel = v.subLabel
  }
  let target: number | undefined
  if (v.target !== undefined) {
    if (typeof v.target !== 'number' || !Number.isFinite(v.target)) return { ok: false, error: `${path}.target: expected finite number` }
    target = v.target
  }
  let ceiling: number | undefined
  if (v.ceiling !== undefined) {
    if (typeof v.ceiling !== 'number' || !Number.isFinite(v.ceiling)) return { ok: false, error: `${path}.ceiling: expected finite number` }
    ceiling = v.ceiling
  }
  let headerLevel: 1 | 2 | 3 | undefined
  if (v.headerLevel !== undefined) {
    if (v.headerLevel !== 1 && v.headerLevel !== 2 && v.headerLevel !== 3) {
      return { ok: false, error: `${path}.headerLevel: expected 1, 2, or 3` }
    }
    headerLevel = v.headerLevel
  }

  const binding = parseBinding(v.binding, `${path}.binding`)
  if (!binding.ok) return binding

  const block: PersistedBlock = { id: v.id, name: v.name, format: v.format as MetricFormat, binding: binding.value, range }
  if (kind !== undefined) block.kind = kind
  if (layout !== undefined) block.layout = layout
  if (subLabel !== undefined) block.subLabel = subLabel
  if (target !== undefined) block.target = target
  if (ceiling !== undefined) block.ceiling = ceiling
  if (headerLevel !== undefined) block.headerLevel = headerLevel
  return { ok: true, block }
}

export function parseDashboardConfig(
  v: unknown,
): { ok: true; config: DashboardConfig } | { ok: false; error: string } {
  if (!isObj(v)) return { ok: false, error: 'config: expected object' }
  const dr = parseRange(v.defaultRange, 'config.defaultRange')
  if (!dr.ok) return dr
  if (!Array.isArray(v.blocks)) return { ok: false, error: 'config.blocks: expected array' }
  const blocks: PersistedBlock[] = []
  for (let i = 0; i < v.blocks.length; i++) {
    const pb = parseBlockConfig(v.blocks[i], `config.blocks[${i}]`)
    if (!pb.ok) return pb
    blocks.push(pb.block)
  }
  return { ok: true, config: { defaultRange: dr.value, blocks } }
}
