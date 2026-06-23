import type { BlockConfig, LeafBinding, AggregateBinding, MetricFormat } from '@/lib/dashboard/types'

/** A single leaf's manual selections. */
export type LeafDraft =
  | { source: 'supermetrics'; dsId: string; metricField: string; account: string }
  | { source: 'triplewhale'; metric: string }

/** The whole manual form's state. */
export type ManualDraft =
  | { kind: 'leaf'; name: string; format: MetricFormat; leaf: LeafDraft }
  | { kind: 'aggregate'; name: string; format: MetricFormat; op: AggregateBinding['op']; left: LeafDraft; right: LeafDraft }

export function leafToBinding(d: LeafDraft): LeafBinding {
  return d.source === 'supermetrics'
    ? { source: 'supermetrics', dsId: d.dsId, metricField: d.metricField, account: d.account }
    : { source: 'triplewhale', metric: d.metric }
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
