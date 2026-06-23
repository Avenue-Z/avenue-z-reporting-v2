import type {
  AggregateBinding, Binding, DashboardConfig, LeafBinding,
  MetricFormat, PersistedBlock, SupermetricsBinding, TripleWhaleBinding,
} from './types'

type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

const FORMATS: MetricFormat[] = ['currency', 'percent', 'count', 'number']
const OPS: AggregateBinding['op'][] = ['+', '-', '*', '/']

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}
const isStr = (v: unknown): v is string => typeof v === 'string'
const isNonEmptyStr = (v: unknown): v is string => isStr(v) && v.length > 0

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
      if (!Array.isArray(v.filters)) return { ok: false, error: `${path}.filters: expected array` }
      const filters: { column: string; value: string }[] = []
      for (const f of v.filters) {
        if (!isObj(f) || !isNonEmptyStr(f.column) || !isStr(f.value)) {
          return { ok: false, error: `${path}.filters: expected {column,value}[]` }
        }
        filters.push({ column: f.column, value: f.value })
      }
      b.filters = filters
    }
    return { ok: true, value: b }
  }
  if (v.source === 'triplewhale') {
    if (!isNonEmptyStr(v.metric)) return { ok: false, error: `${path}.metric: expected non-empty string` }
    if (v.account !== undefined && !isStr(v.account)) return { ok: false, error: `${path}.account: expected string` }
    const b: TripleWhaleBinding = { source: 'triplewhale', metric: v.metric }
    if (v.account !== undefined) b.account = v.account
    if (v.filters !== undefined) {
      if (!Array.isArray(v.filters)) return { ok: false, error: `${path}.filters: expected array` }
      const filters: { column: string; value: string }[] = []
      for (const f of v.filters) {
        if (!isObj(f) || !isNonEmptyStr(f.column) || !isStr(f.value)) {
          return { ok: false, error: `${path}.filters: expected {column,value}[]` }
        }
        filters.push({ column: f.column, value: f.value })
      }
      b.filters = filters
    }
    return { ok: true, value: b }
  }
  return { ok: false, error: `${path}.source: expected 'supermetrics' or 'triplewhale'` }
}

function parseBinding(v: unknown, path: string): Parsed<Binding> {
  if (!isObj(v)) return { ok: false, error: `${path}: expected object` }
  if (v.source === 'aggregate') {
    if (!OPS.includes(v.op as AggregateBinding['op'])) return { ok: false, error: `${path}.op: expected one of ${OPS.join(',')}` }
    const left = parseLeaf(v.left, `${path}.left`)
    if (!left.ok) return left
    const right = parseLeaf(v.right, `${path}.right`)
    if (!right.ok) return right
    const b: AggregateBinding = { source: 'aggregate', op: v.op as AggregateBinding['op'], left: left.value, right: right.value }
    return { ok: true, value: b }
  }
  return parseLeaf(v, path)
}

export function parseBlockConfig(
  v: unknown,
  path = 'block',
): { ok: true; block: PersistedBlock } | { ok: false; error: string } {
  if (!isObj(v)) return { ok: false, error: `${path}: expected object` }
  if (!isNonEmptyStr(v.id)) return { ok: false, error: `${path}.id: expected non-empty string` }
  if (!isNonEmptyStr(v.name)) return { ok: false, error: `${path}.name: expected non-empty string` }
  if (!FORMATS.includes(v.format as MetricFormat)) return { ok: false, error: `${path}.format: expected one of ${FORMATS.join(',')}` }

  let range: PersistedBlock['range'] = null
  if (v.range !== null) {
    const r = parseRange(v.range, `${path}.range`)
    if (!r.ok) return r
    range = r.value
  }

  let layout: PersistedBlock['layout']
  if (v.layout !== undefined) {
    if (!isObj(v.layout)) return { ok: false, error: `${path}.layout: expected object` }
    const w = v.layout.w, h = v.layout.h
    if (w !== undefined && typeof w !== 'number') return { ok: false, error: `${path}.layout.w: expected number` }
    if (h !== undefined && typeof h !== 'number') return { ok: false, error: `${path}.layout.h: expected number` }
    layout = {}
    if (w !== undefined) layout.w = w
    if (h !== undefined) layout.h = h
  }

  const binding = parseBinding(v.binding, `${path}.binding`)
  if (!binding.ok) return binding

  const block: PersistedBlock = { id: v.id, name: v.name, format: v.format as MetricFormat, binding: binding.value, range }
  if (layout !== undefined) block.layout = layout
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
