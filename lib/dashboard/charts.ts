import { format as formatDate, parseISO } from 'date-fns'
import type { Granularity, GroupedResult, SeriesResult, LabelOverrides } from './types'
import type { LineChartInput, CapsuleBarInput } from '@/components/dashboard/blocks/chart-types'
import { resolveValueLabel } from './labels'

/** Granularity-aware x-axis tick format string. Consumed by AreaChart xTickFormatter. */
export function bucketLabelPattern(g: Granularity): string {
  if (g === 'day') return 'MMM d'         // Jun 24
  if (g === 'week') return "'Wk' w"        // Wk 26
  return 'MMM yy'                          // Jun 26
}

/** Pure: SeriesResult (ok) → LineChartInput.
 *  - Adds a formatted `bucketLabel` per point via date-fns.
 *  - hasCompare = any point has prevValue. */
export function toLineChartInput(r: Extract<SeriesResult, { ok: true }>): LineChartInput {
  const pattern = bucketLabelPattern(r.granularity)
  const data = r.points.map((p) => {
    const out: { bucket: string; bucketLabel: string; value: number; prevValue?: number } = {
      bucket: p.bucket,
      bucketLabel: formatDate(parseISO(p.bucket), pattern),
      value: p.value,
    }
    if (p.prevValue !== undefined) out.prevValue = p.prevValue
    return out
  })
  const hasCompare = r.points.some((p) => p.prevValue !== undefined)
  return { data, hasCompare, granularity: r.granularity }
}

/** Pure: GroupedResult (ok) → CapsuleBarInput for CapsuleColumnChart.
 *  - Flattens single-key dim object to a `name` string.
 *  - Emits raw dim value as `key` and dimension key as `dimKey`.
 *  - Applies value overrides to display `name` via resolveValueLabel.
 *  - pct = value / total (rounded); 0 when total is 0.
 *  - Coerces undefined values (prior-only dims) to 0.
 *  - prior present iff the row has prevValue; hasCompare = any row has prevValue. */
export function toCapsuleBarInput(
  r: Extract<GroupedResult, { ok: true }>,
  overrides?: LabelOverrides,
): CapsuleBarInput {
  const total = r.rows.reduce((s, row) => s + (row.value ?? 0), 0)
  const dimKey = r.rows.length > 0 ? Object.keys(r.rows[0].dim)[0] ?? 'dim' : 'dim'
  const rows = r.rows.map((row) => {
    const key = row.dim[Object.keys(row.dim)[0] ?? 'dim'] ?? ''
    const value = row.value ?? 0
    const pct = total > 0 ? Math.round((value / total) * 100) : 0
    const out: { name: string; key: string; value: number; pct: number; prior?: number } = {
      name: resolveValueLabel(overrides, dimKey, key), key, value, pct,
    }
    if (row.prevValue !== undefined) out.prior = row.prevValue
    return out
  })
  const hasCompare = r.rows.some((row) => row.prevValue !== undefined)
  return { rows, hasCompare, dimKey }
}
