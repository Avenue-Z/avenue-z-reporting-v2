import type { BlockConfig, LeafBinding, AggregateBinding, MetricFormat } from '@/lib/dashboard/types'

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
  | { source: 'supermetrics'; dsId: string; metricField: string; account: string; filters?: { column: string; value: string }[] }
  | { source: 'triplewhale'; metric: string; filters?: { column: string; value: string }[] }

/** The whole manual form's state. */
export type ManualDraft =
  | { kind: 'leaf'; name: string; format: MetricFormat; leaf: LeafDraft }
  | { kind: 'aggregate'; name: string; format: MetricFormat; op: AggregateBinding['op']; left: LeafDraft; right: LeafDraft }

export function leafToBinding(d: LeafDraft): LeafBinding {
  if (d.source === 'supermetrics') {
    const filters = (d.filters ?? [])
      .filter((f) => f.column !== '' && f.value !== '')
      .map((f) => ({ column: f.column, values: [f.value] }))
    return { source: 'supermetrics', dsId: d.dsId, metricField: d.metricField, account: d.account, ...(filters.length ? { filters } : {}) }
  }
  const filters = (d.filters ?? [])
    .filter((f) => f.column !== '' && f.value !== '')
    .map((f) => ({ column: f.column, values: [f.value] }))
  return { source: 'triplewhale', metric: d.metric, ...(filters.length ? { filters } : {}) }
}

/** Assemble the final block config (id is assigned later, at confirm). */
export function buildBlockConfig(d: ManualDraft): Omit<BlockConfig, 'id'> {
  const binding =
    d.kind === 'leaf'
      ? leafToBinding(d.leaf)
      : { source: 'aggregate' as const, op: d.op, left: leafToBinding(d.left), right: leafToBinding(d.right) }
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

export function isDraftComplete(d: ManualDraft): boolean {
  if (d.name.trim() === '') return false
  return d.kind === 'leaf' ? isLeafComplete(d.leaf) : isLeafComplete(d.left) && isLeafComplete(d.right)
}
