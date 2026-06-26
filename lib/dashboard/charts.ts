import { format as formatDate, parseISO } from 'date-fns'
import type { Granularity, GroupedResult, SeriesResult } from './types'
import type { BarChartInput, LineChartInput } from '@/components/dashboard/blocks/chart-types'

/** Granularity-aware x-axis tick format string. Consumed by AreaChart xTickFormatter. */
export function bucketLabelPattern(g: Granularity): string {
  if (g === 'day') return 'MMM d'         // Jun 24
  if (g === 'week') return "'Wk' w"        // Wk 26
  return 'MMM yy'                          // Jun 26
}

/** Pure: GroupedResult (ok) → BarChartInput.
 *  - Flattens single-key dim object to a `dim` string.
 *  - Coerces undefined values (prior-only dims) to 0 for chart rendering.
 *  - hasCompare = any row has prevValue. */
export function toBarChartInput(
  r: Extract<GroupedResult, { ok: true }>,
  target?: number,
  ceiling?: number,
): BarChartInput {
  const data = r.rows.map((row) => {
    const dimKey = Object.keys(row.dim)[0] ?? 'dim'
    const dim = row.dim[dimKey] ?? ''
    const value = row.value ?? 0
    const out: { dim: string; value: number; prevValue?: number } = { dim, value }
    if (row.prevValue !== undefined) out.prevValue = row.prevValue
    return out
  })
  const hasCompare = r.rows.some((row) => row.prevValue !== undefined)
  const result: BarChartInput = { data, hasCompare }
  if (target !== undefined) result.target = target
  if (ceiling !== undefined) result.ceiling = ceiling
  return result
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
