import { format as formatDate, parseISO } from 'date-fns'
import type { Granularity, GroupedResult, SeriesResult, LabelOverrides } from './types'
import type { LineChartInput, CapsuleBarInput } from '@/components/dashboard/blocks/chart-types'
import { resolveValueLabel } from './labels'

/**
 * Robust upper bound for a bar-chart value scale — ignores extreme outliers so one
 * freak value (e.g. a ratio metric with a near-zero denominator: tiktok conv_rate of
 * 337,650%) doesn't squash every other bar to an invisible sliver. Returns the highest
 * value that ISN'T a far-out outlier; callers clip anything above it.
 *
 * Method: over the positive values (zeros are "no data", excluded), flag outliers past
 * the Tukey "far out" fence (Q3 + 3·IQR). With no outliers it returns the true max, so
 * normal charts are unchanged — this only engages when the data is genuinely skewed.
 * For tiny N (<4, too few for stable quartiles) a value ≥ 5× the next-largest is treated
 * as the outlier. Returns 0 when there are no positive values.
 */
export function robustMax(values: number[]): number {
  const v = values.filter((x) => Number.isFinite(x) && x > 0).sort((a, b) => a - b)
  const n = v.length
  if (n === 0) return 0
  const trueMax = v[n - 1]
  if (n < 2) return trueMax
  if (n >= 4) {
    const q = (p: number) => {
      const i = (n - 1) * p, lo = Math.floor(i), hi = Math.ceil(i)
      return v[lo] + (v[hi] - v[lo]) * (i - lo)
    }
    const fence = q(0.75) + 3 * (q(0.75) - q(0.25))
    if (trueMax > fence) {
      const within = v.filter((x) => x <= fence)
      return within.length ? within[within.length - 1] : fence
    }
    return trueMax
  }
  // Small N: a lone value ≥ 5× the next-largest is the outlier; scale to the rest.
  const second = v[n - 2]
  return second > 0 && trueMax >= 5 * second ? second : trueMax
}

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
  topN?: number,
): CapsuleBarInput {
  const total = r.rows.reduce((s, row) => s + (row.value ?? 0), 0)
  const dimKey = r.rows.length > 0 ? Object.keys(r.rows[0].dim)[0] ?? 'dim' : 'dim'
  // Highest value first so top-N keeps the largest categories (TW already sorts;
  // SM/Shopify grouped results may not).
  const sorted = [...r.rows].sort((a, b) => (b.value ?? 0) - (a.value ?? 0))

  const toRow = (row: (typeof sorted)[number]) => {
    const key = row.dim[Object.keys(row.dim)[0] ?? 'dim'] ?? ''
    const value = row.value ?? 0
    const pct = total > 0 ? Math.round((value / total) * 100) : 0
    const out: { name: string; key: string; value: number; pct: number; prior?: number } = {
      name: resolveValueLabel(overrides, dimKey, key), key, value, pct,
    }
    if (row.prevValue !== undefined) out.prior = row.prevValue
    return out
  }

  let rows: ReturnType<typeof toRow>[]
  if (topN !== undefined && topN > 0 && sorted.length > topN) {
    // Top N as real bars; roll the long tail into one "Other" bar so high-cardinality
    // groupings (e.g. clicks by country) stay readable instead of 200 invisible slivers.
    rows = sorted.slice(0, topN).map(toRow)
    const tail = sorted.slice(topN)
    const otherValue = tail.reduce((s, row) => s + (row.value ?? 0), 0)
    const other: { name: string; key: string; value: number; pct: number; prior?: number } = {
      name: 'Other',
      key: '__other__',
      value: otherValue,
      pct: total > 0 ? Math.round((otherValue / total) * 100) : 0,
    }
    if (tail.some((row) => row.prevValue !== undefined)) {
      other.prior = tail.reduce((s, row) => s + (row.prevValue ?? 0), 0)
    }
    rows.push(other)
  } else {
    rows = sorted.map(toRow)
  }

  const hasCompare = r.rows.some((row) => row.prevValue !== undefined)
  return { rows, hasCompare, dimKey }
}
